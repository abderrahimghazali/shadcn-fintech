import crypto from 'node:crypto';
import { v4 as uuidv4 } from 'uuid';

import { supabase } from '../../config/supabase.js';
import logger from '../../utils/logger.js';
import { AppError, type ApiKey } from '../../types/index.js';

// ============================================================
// Types
// ============================================================

export interface CreateApiKeyData {
  name: string;
  scopes: string[];
}

export interface CreateApiKeyResult {
  id: string;
  name: string;
  prefix: string;
  key: string; // plaintext — only returned once
  scopes: string[];
  createdAt: string;
}

export interface ApiKeyListItem {
  id: string;
  name: string;
  prefix: string;
  scopes: string[];
  lastUsedAt: string | null;
  active: boolean;
  createdAt: string;
}

export interface UpdateApiKeyData {
  name?: string;
  active?: boolean;
}

export interface RotateApiKeyResult {
  id: string;
  name: string;
  prefix: string;
  key: string; // new plaintext key
  scopes: string[];
  createdAt: string;
}

export interface ValidateApiKeyResult {
  id: string;
  userId: string;
  name: string;
  scopes: string[];
  user: {
    id: string;
    email: string;
    role: string;
    isActive: boolean;
  };
}

export interface ApiKeyListResult {
  keys: ApiKeyListItem[];
  total: number;
  totalPages: number;
}

// ============================================================
// Helpers
// ============================================================

/**
 * Hash a raw API key with SHA-256 for storage.
 */
function hashApiKey(rawKey: string): string {
  return crypto.createHash('sha256').update(rawKey).digest('hex');
}

/**
 * Generate a new plaintext API key.
 */
function generatePlaintextKey(): string {
  const bytes = crypto.randomBytes(24).toString('hex');
  return `mk_live_${bytes}`;
}

/**
 * Extract the prefix from a plaintext key (first 12 chars).
 */
function extractPrefix(key: string): string {
  return key.slice(0, 12);
}

// ============================================================
// Service methods
// ============================================================

/**
 * Create a new API key for a user.
 * 1. Generate key: mk_live_ + crypto.randomBytes(24).toString('hex')
 * 2. Hash with SHA-256 for storage
 * 3. Insert into api_keys table
 * 4. Audit log
 * 5. RETURN THE PLAINTEXT KEY (only time it's visible)
 */
export async function createApiKey(
  userId: string,
  data: CreateApiKeyData,
): Promise<CreateApiKeyResult> {
  const rawKey = generatePlaintextKey();
  const keyHash = hashApiKey(rawKey);
  const prefix = extractPrefix(rawKey);
  const keyId = uuidv4();
  const now = new Date().toISOString();

  const { data: apiKey, error } = await supabase
    .from('api_keys')
    .insert({
      id: keyId,
      user_id: userId,
      name: data.name,
      key_prefix: prefix,
      key_hash: keyHash,
      scopes: data.scopes,
      is_active: true,
      expires_at: null,
      created_at: now,
      updated_at: now,
      revoked_at: null,
    })
    .select('id, name, key_prefix, scopes, created_at')
      .single();

  if (error || !apiKey) {
    logger.error({ error, userId }, 'Failed to create API key');
    throw new AppError('Failed to create API key', 500, 'API_KEY_CREATE_FAILED');
  }

  // Audit log
  await supabase.from('audit_logs').insert({
    id: uuidv4(),
    user_id: userId,
    action: 'api_key.created',
    resource_type: 'api_key',
    resource_id: keyId,
    details: { name: data.name, scopes: data.scopes, prefix },
    created_at: now,
  });

  logger.info({ userId, keyId, prefix, name: data.name }, 'API key created');

  return {
    id: apiKey.id as string,
    name: apiKey.name as string,
    prefix: apiKey.key_prefix as string,
    key: rawKey,
    scopes: apiKey.scopes as string[],
    createdAt: apiKey.created_at as string,
  };
}

/**
 * List API keys for a user (paginated).
 * NEVER returns the key hash — only prefix, name, scopes, last_used_at, created_at, active.
 */
export async function listApiKeys(
  userId: string,
  filters: { page: number; pageSize: number },
): Promise<ApiKeyListResult> {
  const offset = (filters.page - 1) * filters.pageSize;

  const { data, error, count } = await supabase
    .from('api_keys')
    .select('id, name, key_prefix, scopes, last_used_at, is_active, created_at', { count: 'exact' })
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .range(offset, offset + filters.pageSize - 1);

  if (error) {
    logger.error({ error, userId }, 'Failed to list API keys');
    throw new AppError('Failed to list API keys', 500, 'API_KEYS_LIST_FAILED');
  }

  const keys: ApiKeyListItem[] = (data ?? []).map((row: Record<string, unknown>) => ({
    id: row.id as string,
    name: row.name as string,
    prefix: row.key_prefix as string,
    scopes: row.scopes as string[],
    lastUsedAt: row.last_used_at as string | null,
    active: row.is_active as boolean,
    createdAt: row.created_at as string,
  }));

  const total = count ?? 0;
  const totalPages = Math.ceil(total / filters.pageSize);

  return { keys, total, totalPages };
}

/**
 * Update an API key's name or active status.
 */
export async function updateApiKey(
  userId: string,
  keyId: string,
  data: UpdateApiKeyData,
): Promise<ApiKeyListItem> {
  // Verify ownership
  const { data: existing, error: fetchError } = await supabase
    .from('api_keys')
    .select('id, user_id, is_active')
    .eq('id', keyId)
    .eq('user_id', userId)
    .single();

  if (fetchError || !existing) {
    throw new AppError('API key not found', 404, 'API_KEY_NOT_FOUND');
  }

  const updateFields: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  };

  if (data.name !== undefined) updateFields.name = data.name;
  if (data.active !== undefined) {
    updateFields.is_active = data.active;
    if (!data.active) updateFields.revoked_at = new Date().toISOString();
  }

  const { data: updated, error: updateError } = await supabase
    .from('api_keys')
    .update(updateFields)
    .eq('id', keyId)
    .select('id, name, key_prefix, scopes, last_used_at, is_active, created_at')
    .single();

  if (updateError || !updated) {
    logger.error({ error: updateError, keyId, userId }, 'Failed to update API key');
    throw new AppError('Failed to update API key', 500, 'API_KEY_UPDATE_FAILED');
  }

  // Audit log
  await supabase.from('audit_logs').insert({
    id: uuidv4(),
    user_id: userId,
    action: 'api_key.updated',
    resource_type: 'api_key',
    resource_id: keyId,
    details: data,
    created_at: new Date().toISOString(),
  });

  const row = updated as Record<string, unknown>;
  return {
    id: row.id as string,
    name: row.name as string,
    prefix: row.key_prefix as string,
    scopes: row.scopes as string[],
    lastUsedAt: row.last_used_at as string | null,
    active: row.is_active as boolean,
    createdAt: row.created_at as string,
  };
}

/**
 * Rotate an API key: deactivate old, generate new, return new plaintext key.
 */
export async function rotateApiKey(
  userId: string,
  keyId: string,
): Promise<RotateApiKeyResult> {
  // Verify ownership and get current record
  const { data: existing, error: fetchError } = await supabase
    .from('api_keys')
    .select('id, user_id, name, scopes, is_active, key_prefix')
    .eq('id', keyId)
    .eq('user_id', userId)
    .single();

  if (fetchError || !existing) {
    throw new AppError('API key not found', 404, 'API_KEY_NOT_FOUND');
  }

  const old = existing as Record<string, unknown>;

  if (!old.is_active) {
    throw new AppError('Cannot rotate an inactive API key', 409, 'API_KEY_INACTIVE');
  }

  // Deactivate old key
  await supabase
    .from('api_keys')
    .update({
      is_active: false,
      revoked_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('id', keyId);

  // Generate new key
  const newRawKey = generatePlaintextKey();
  const newKeyHash = hashApiKey(newRawKey);
  const newPrefix = extractPrefix(newRawKey);
  const newKeyId = uuidv4();
  const now = new Date().toISOString();

  const { data: newKey, error: insertError } = await supabase
    .from('api_keys')
    .insert({
      id: newKeyId,
      user_id: userId,
      name: old.name as string,
      key_prefix: newPrefix,
      key_hash: newKeyHash,
      scopes: old.scopes as string[],
      is_active: true,
      expires_at: null,
      created_at: now,
      updated_at: now,
      revoked_at: null,
    })
    .select('id, name, key_prefix, scopes, created_at')
    .single();

  if (insertError || !newKey) {
    logger.error({ error: insertError, userId, keyId }, 'Failed to create rotated API key');
    // Attempt to re-activate old key on failure
    await supabase
      .from('api_keys')
      .update({ is_active: true, revoked_at: null, updated_at: now })
      .eq('id', keyId);
    throw new AppError('Failed to rotate API key', 500, 'API_KEY_ROTATE_FAILED');
  }

  // Audit log
  await supabase.from('audit_logs').insert({
    id: uuidv4(),
    user_id: userId,
    action: 'api_key.rotated',
    resource_type: 'api_key',
    resource_id: newKeyId,
    details: { oldKeyId: keyId, oldPrefix: old.key_prefix, newPrefix },
    created_at: now,
  });

  logger.info(
    { userId, oldKeyId: keyId, newKeyId, oldPrefix: old.key_prefix, newPrefix },
    'API key rotated',
  );

  return {
    id: newKey.id as string,
    name: newKey.name as string,
    prefix: newKey.key_prefix as string,
    key: newRawKey,
    scopes: newKey.scopes as string[],
    createdAt: newKey.created_at as string,
  };
}

/**
 * Revoke an API key (set active = false).
 */
export async function revokeApiKey(
  userId: string,
  keyId: string,
): Promise<void> {
  const { data: existing, error: fetchError } = await supabase
    .from('api_keys')
    .select('id, user_id, is_active, name')
    .eq('id', keyId)
    .eq('user_id', userId)
    .single();

  if (fetchError || !existing) {
    throw new AppError('API key not found', 404, 'API_KEY_NOT_FOUND');
  }

  const row = existing as Record<string, unknown>;

  if (!row.is_active) {
    throw new AppError('API key is already revoked', 409, 'API_KEY_ALREADY_REVOKED');
  }

  const { error: updateError } = await supabase
    .from('api_keys')
    .update({
      is_active: false,
      revoked_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('id', keyId);

  if (updateError) {
    logger.error({ error: updateError, keyId, userId }, 'Failed to revoke API key');
    throw new AppError('Failed to revoke API key', 500, 'API_KEY_REVOKE_FAILED');
  }

  // Audit log
  await supabase.from('audit_logs').insert({
    id: uuidv4(),
    user_id: userId,
    action: 'api_key.revoked',
    resource_type: 'api_key',
    resource_id: keyId,
    details: { name: row.name },
    created_at: new Date().toISOString(),
  });

  logger.info({ userId, keyId, name: row.name }, 'API key revoked');
}

/**
 * Validate a raw API key (used by apiKeyAuth middleware).
 * Hash and lookup in DB, check active, check user active, return key record with user.
 */
export async function validateApiKey(
  rawKey: string,
): Promise<ValidateApiKeyResult> {
  const keyHash = hashApiKey(rawKey);

  const { data: apiKeyRow, error } = await supabase
    .from('api_keys')
    .select('id, user_id, scopes, is_active, expires_at, users!inner(id, email, role, is_active)')
    .eq('key_hash', keyHash)
    .eq('is_active', true)
    .single();

  if (error || !apiKeyRow) {
    return null as unknown as ValidateApiKeyResult;
  }

  const row = apiKeyRow as Record<string, unknown>;
  const user = row.users as Record<string, unknown>;

  // Check expiry
  if (row.expires_at && new Date(row.expires_at as string) < new Date()) {
    return null as unknown as ValidateApiKeyResult;
  }

  // Check user is active
  if (!user.is_active) {
    return null as unknown as ValidateApiKeyResult;
  }

  return {
    id: row.id as string,
    userId: row.user_id as string,
    name: '',
    scopes: row.scopes as string[],
    user: {
      id: user.id as string,
      email: user.email as string,
      role: user.role as string,
      isActive: user.is_active as boolean,
    },
  };
}
