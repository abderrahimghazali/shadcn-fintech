import crypto from 'node:crypto';
import { v4 as uuidv4 } from 'uuid';

import { supabase } from '../../../config/supabase.js';
import { sendWebhook } from '../../../lib/webhookSender.js';
import logger from '../../../utils/logger.js';
import { AppError } from '../../../types/index.js';

// ============================================================
// Types
// ============================================================

export interface CreateWebhookData {
  url: string;
  events: string[];
  secret?: string;
}

export interface WebhookEndpointResult {
  id: string;
  url: string;
  events: string[];
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface CreateWebhookResult extends WebhookEndpointResult {
  secret: string; // shown only once
}

export interface UpdateWebhookData {
  url?: string;
  events?: string[];
  active?: boolean;
}

export interface WebhookEndpointListItem {
  id: string;
  url: string;
  events: string[];
  active: boolean;
  lastDeliveryAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface WebhookEndpointListResult {
  endpoints: WebhookEndpointListItem[];
  total: number;
  totalPages: number;
}

// ============================================================
// Helpers
// ============================================================

/**
 * Generate a webhook secret: whsec_mk_ + crypto.randomBytes(24).toString('hex')
 */
function generateWebhookSecret(): string {
  const bytes = crypto.randomBytes(24).toString('hex');
  return `whsec_mk_${bytes}`;
}

// ============================================================
// Service methods
// ============================================================

/**
 * Create a webhook endpoint for a user.
 * 1. Generate secret if not provided
 * 2. Insert into webhook_endpoints table
 * 3. Return endpoint with secret (shown only once)
 */
export async function createWebhookEndpoint(
  userId: string,
  data: CreateWebhookData,
): Promise<CreateWebhookResult> {
  const secret = data.secret ?? generateWebhookSecret();
  const endpointId = uuidv4();
  const now = new Date().toISOString();

  const { data: endpoint, error } = await supabase
    .from('webhook_endpoints')
    .insert({
      id: endpointId,
      user_id: userId,
      url: data.url,
      secret,
      events: data.events,
      is_active: true,
      last_delivery_at: null,
      created_at: now,
      updated_at: now,
    })
    .select('id, url, events, is_active, created_at, updated_at')
    .single();

  if (error || !endpoint) {
    logger.error({ error, userId }, 'Failed to create webhook endpoint');
    throw new AppError('Failed to create webhook endpoint', 500, 'WEBHOOK_CREATE_FAILED');
  }

  // Audit log
  await supabase.from('audit_logs').insert({
    id: uuidv4(),
    user_id: userId,
    action: 'webhook_endpoint.created',
    resource_type: 'webhook_endpoint',
    resource_id: endpointId,
    details: { url: data.url, events: data.events },
    created_at: now,
  });

  logger.info({ userId, endpointId, url: data.url }, 'Webhook endpoint created');

  const row = endpoint as Record<string, unknown>;
  return {
    id: row.id as string,
    url: row.url as string,
    events: row.events as string[],
    active: row.is_active as boolean,
    secret,
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
  };
}

/**
 * List webhook endpoints for a user (paginated).
 * Never returns the secret.
 */
export async function listWebhookEndpoints(
  userId: string,
  filters: { page: number; pageSize: number },
): Promise<WebhookEndpointListResult> {
  const offset = (filters.page - 1) * filters.pageSize;

  const { data, error, count } = await supabase
    .from('webhook_endpoints')
    .select('id, url, events, is_active, last_delivery_at, created_at, updated_at', { count: 'exact' })
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .range(offset, offset + filters.pageSize - 1);

  if (error) {
    logger.error({ error, userId }, 'Failed to list webhook endpoints');
    throw new AppError('Failed to list webhook endpoints', 500, 'WEBHOOKS_LIST_FAILED');
  }

  const endpoints: WebhookEndpointListItem[] = (data ?? []).map(
    (row: Record<string, unknown>) => ({
      id: row.id as string,
      url: row.url as string,
      events: row.events as string[],
      active: row.is_active as boolean,
      lastDeliveryAt: row.last_delivery_at as string | null,
      createdAt: row.created_at as string,
      updatedAt: row.updated_at as string,
    }),
  );

  const total = count ?? 0;
  const totalPages = Math.ceil(total / filters.pageSize);

  return { endpoints, total, totalPages };
}

/**
 * Update a webhook endpoint (URL, events, active status).
 */
export async function updateWebhookEndpoint(
  userId: string,
  endpointId: string,
  data: UpdateWebhookData,
): Promise<WebhookEndpointResult> {
  const { data: existing, error: fetchError } = await supabase
    .from('webhook_endpoints')
    .select('id, user_id')
    .eq('id', endpointId)
    .eq('user_id', userId)
    .single();

  if (fetchError || !existing) {
    throw new AppError('Webhook endpoint not found', 404, 'WEBHOOK_NOT_FOUND');
  }

  const updateFields: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  };

  if (data.url !== undefined) updateFields.url = data.url;
  if (data.events !== undefined) updateFields.events = data.events;
  if (data.active !== undefined) updateFields.is_active = data.active;

  const { data: updated, error: updateError } = await supabase
    .from('webhook_endpoints')
    .update(updateFields)
    .eq('id', endpointId)
    .select('id, url, events, is_active, created_at, updated_at')
    .single();

  if (updateError || !updated) {
    logger.error({ error: updateError, endpointId, userId }, 'Failed to update webhook endpoint');
    throw new AppError('Failed to update webhook endpoint', 500, 'WEBHOOK_UPDATE_FAILED');
  }

  // Audit log
  await supabase.from('audit_logs').insert({
    id: uuidv4(),
    user_id: userId,
    action: 'webhook_endpoint.updated',
    resource_type: 'webhook_endpoint',
    resource_id: endpointId,
    details: data,
    created_at: new Date().toISOString(),
  });

  const row = updated as Record<string, unknown>;
  return {
    id: row.id as string,
    url: row.url as string,
    events: row.events as string[],
    active: row.is_active as boolean,
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
  };
}

/**
 * Soft-delete a webhook endpoint.
 */
export async function deleteWebhookEndpoint(
  userId: string,
  endpointId: string,
): Promise<void> {
  const { data: existing, error: fetchError } = await supabase
    .from('webhook_endpoints')
    .select('id, user_id')
    .eq('id', endpointId)
    .eq('user_id', userId)
    .single();

  if (fetchError || !existing) {
    throw new AppError('Webhook endpoint not found', 404, 'WEBHOOK_NOT_FOUND');
  }

  const { error: deleteError } = await supabase
    .from('webhook_endpoints')
    .delete()
    .eq('id', endpointId);

  if (deleteError) {
    logger.error({ error: deleteError, endpointId, userId }, 'Failed to delete webhook endpoint');
    throw new AppError('Failed to delete webhook endpoint', 500, 'WEBHOOK_DELETE_FAILED');
  }

  // Audit log
  await supabase.from('audit_logs').insert({
    id: uuidv4(),
    user_id: userId,
    action: 'webhook_endpoint.deleted',
    resource_type: 'webhook_endpoint',
    resource_id: endpointId,
    created_at: new Date().toISOString(),
  });

  logger.info({ userId, endpointId }, 'Webhook endpoint deleted');
}

/**
 * Get all active endpoints for a user (used by outbound delivery system).
 */
export async function getActiveEndpoints(
  userId: string,
): Promise<Array<{ id: string; url: string; secret: string; events: string[] }>> {
  const { data, error } = await supabase
    .from('webhook_endpoints')
    .select('id, url, secret, events')
    .eq('user_id', userId)
    .eq('is_active', true);

  if (error) {
    logger.error({ error, userId }, 'Failed to get active webhook endpoints');
    return [];
  }

  return (data ?? []).map((row: Record<string, unknown>) => ({
    id: row.id as string,
    url: row.url as string,
    secret: row.secret as string,
    events: row.events as string[],
  }));
}

/**
 * Trigger outbound webhooks to all active endpoints of a user
 * that subscribe to this event type. Uses webhookSender.
 */
export async function triggerMerchantWebhooks(
  userId: string,
  eventType: string,
  eventData: Record<string, unknown>,
): Promise<void> {
  const endpoints = await getActiveEndpoints(userId);

  if (endpoints.length === 0) {
    return;
  }

  const payload = {
    event: eventType,
    data: eventData,
    createdAt: new Date().toISOString(),
  };

  for (const endpoint of endpoints) {
    // Check if this endpoint subscribes to this event type
    if (!endpoint.events.includes(eventType)) {
      continue;
    }

    // Fire-and-forget: don't await, let the sender handle retries
    sendWebhook({
      endpointId: endpoint.id,
      url: endpoint.url,
      secret: endpoint.secret,
      eventType,
      payload,
    }).catch((err) => {
      logger.error(
        { err, endpointId: endpoint.id, eventType, userId },
        'Failed to queue outbound webhook',
      );
    });
  }
}
