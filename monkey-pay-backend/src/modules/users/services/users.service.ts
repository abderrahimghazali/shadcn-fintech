import { supabase } from '../../config/supabase.js';
import logger from '../../utils/logger.js';
import { AppError, type UserRole } from '../../types/index.js';
import type { ListUsersQuery } from '../validators/users.validators.js';

// ============================================================
// Types
// ============================================================

export interface ProfileResponse {
  id: string;
  email: string;
  name: string | null;
  phone: string | null;
  avatarUrl: string | null;
  businessName: string | null;
  document: string | null;
  postalCode: string | null;
  city: string | null;
  state: string | null;
  country: string | null;
  role: UserRole;
  isActive: boolean;
  isVerified: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface UserListItem {
  id: string;
  email: string;
  name: string | null;
  phone: string | null;
  role: UserRole;
  isActive: boolean;
  isVerified: boolean;
  createdAt: string;
}

// ============================================================
// Service methods
// ============================================================

/**
 * Get the authenticated user's own profile.
 */
export async function getProfile(userId: string): Promise<ProfileResponse> {
  const { data: user, error: userError } = await supabase
    .from('users')
    .select('*')
    .eq('id', userId)
    .single();

  if (userError || !user) {
    throw new AppError('User not found', 404, 'USER_NOT_FOUND');
  }

  const { data: profile } = await supabase
    .from('user_profiles')
    .select('*')
    .eq('user_id', userId)
    .single();

  return {
    id: user.id,
    email: user.email,
    name: profile?.full_name ?? null,
    phone: profile?.phone ?? null,
    avatarUrl: profile?.avatar_url ?? null,
    businessName: profile?.business_name ?? null,
    document: profile?.document ?? null,
    postalCode: profile?.postal_code ?? null,
    city: profile?.city ?? null,
    state: profile?.state ?? null,
    country: profile?.country ?? null,
    role: user.role as UserRole,
    isActive: user.is_active,
    isVerified: user.is_verified,
    createdAt: user.created_at,
    updatedAt: user.updated_at,
  };
}

/**
 * Update the authenticated user's profile.
 */
export async function updateProfile(
  userId: string,
  data: { name?: string; phone?: string; avatarUrl?: string | null },
): Promise<ProfileResponse> {
  const updateData: Record<string, unknown> = { updated_at: new Date().toISOString() };

  if (data.name !== undefined) updateData.full_name = data.name;
  if (data.phone !== undefined) updateData.phone = data.phone;
  if (data.avatarUrl !== undefined) updateData.avatar_url = data.avatarUrl;

  const { error } = await supabase
    .from('user_profiles')
    .update(updateData)
    .eq('user_id', userId);

  if (error) {
    logger.error({ error, userId }, 'Failed to update profile');
    throw new AppError('Failed to update profile', 500, 'PROFILE_UPDATE_FAILED');
  }

  logger.info({ userId }, 'Profile updated');

  return getProfile(userId);
}

/**
 * List users (admin only) with optional filters.
 */
export async function listUsers(
  filters: ListUsersQuery,
): Promise<{
  users: UserListItem[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}> {
  const page = filters.page;
  const pageSize = filters.pageSize;
  const offset = (page - 1) * pageSize;

  // Build base query with join
  let query = supabase
    .from('users')
    .select('id, email, role, is_active, is_verified, created_at, user_profiles(full_name, phone)', { count: 'exact' })
    .order('created_at', { ascending: false });

  // Apply status filter (maps to is_active)
  if (filters.status === 'active') {
    query = query.eq('is_active', true);
  } else if (filters.status === 'suspended' || filters.status === 'banned') {
    query = query.eq('is_active', false);
  }

  // Apply role filter
  if (filters.role) {
    query = query.eq('role', filters.role);
  }

  // Apply search filter (email or name)
  if (filters.search) {
    query = query.or(`email.ilike.%${filters.search}%,full_name.ilike.%${filters.search}%`);
  }

  // Pagination
  query = query.range(offset, offset + pageSize - 1);

  const { data, error, count } = await query;

  if (error) {
    logger.error({ error, filters }, 'Failed to list users');
    throw new AppError('Failed to list users', 500, 'USER_LIST_FAILED');
  }

  const users: UserListItem[] = (data ?? []).map((row: Record<string, unknown>) => {
    const profile = row.user_profiles as { full_name?: string; phone?: string } | null;
    return {
      id: row.id as string,
      email: row.email as string,
      name: profile?.full_name ?? null,
      phone: profile?.phone ?? null,
      role: row.role as UserRole,
      isActive: row.is_active as boolean,
      isVerified: row.is_verified as boolean,
      createdAt: row.created_at as string,
    };
  });

  const total = count ?? 0;
  const totalPages = Math.ceil(total / pageSize);

  return { users, total, page, pageSize, totalPages };
}

/**
 * Get a specific user by ID (admin only).
 */
export async function getUserById(userId: string): Promise<ProfileResponse> {
  return getProfile(userId);
}

/**
 * Update a user's active status (admin only).
 */
export async function updateUserStatus(
  adminUserId: string,
  targetUserId: string,
  status: 'active' | 'suspended' | 'banned',
): Promise<void> {
  const isActive = status === 'active';

  const { error } = await supabase
    .from('users')
    .update({ is_active: isActive, updated_at: new Date().toISOString() })
    .eq('id', targetUserId);

  if (error) {
    logger.error({ error, targetUserId, status }, 'Failed to update user status');
    throw new AppError('Failed to update user status', 500, 'STATUS_UPDATE_FAILED');
  }

  // Audit log
  await supabase.from('audit_logs').insert({
    id: crypto.randomUUID(),
    user_id: adminUserId,
    action: 'update_user_status',
    resource_type: 'user',
    resource_id: targetUserId,
    details: { status },
    created_at: new Date().toISOString(),
  });

  logger.info({ adminUserId, targetUserId, status }, 'User status updated');
}
