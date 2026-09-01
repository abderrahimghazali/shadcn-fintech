import { v4 as uuidv4 } from 'uuid';

import { supabase } from '../../config/supabase.js';
import goatPayClient from '../../lib/goatPayClient.js';
import logger from '../../utils/logger.js';
import { AppError, UserRole } from '../../types/index.js';
import * as auditService from '../audit/services/audit.service.js';

// ============================================================
// Types
// ============================================================

export interface SystemStats {
  totalUsers: number;
  activeMerchants: number;
  totalVolume: number;
  pendingKycReviews: number;
  activeDisputes: number;
}

export interface SystemHealth {
  goatPayApi: 'ok' | 'error';
  goatPayLatencyMs: number | null;
  supabase: 'ok' | 'error';
  supabaseLatencyMs: number | null;
  timestamp: string;
}

export type UserManagementAction =
  | 'suspend'
  | 'ban'
  | 'unsuspend'
  | 'unban'
  | 'promote'
  | 'demote';

// ============================================================
// Service methods
// ============================================================

/**
 * Get system-wide statistics.
 */
export async function getSystemStats(): Promise<SystemStats> {
  // Total users
  const { count: totalUsers } = await supabase
    .from('users')
    .select('id', { count: 'exact', head: true });

  // Active merchants (users with approved KYC and active subaccount)
  const { count: activeMerchants } = await supabase
    .from('subaccounts')
    .select('id', { count: 'exact', head: true })
    .eq('is_active', true);

  // Total volume (sum of completed transactions)
  const { data: volumeRows } = await supabase
    .from('transactions')
    .select('amount')
    .eq('status', 'completed')
    .eq('type', 'pix_in');

  const totalVolume = (volumeRows ?? []).reduce(
    (sum, row) => sum + ((row as Record<string, unknown>).amount as number),
    0,
  );

  // Pending KYC reviews
  const { count: pendingKyc } = await supabase
    .from('kyc_submissions')
    .select('id', { count: 'exact', head: true })
    .eq('status', 'under_review');

  // Active disputes (MEDs — approximated from webhook events)
  const { count: activeDisputes } = await supabase
    .from('goatpay_webhook_events')
    .select('id', { count: 'exact', head: true })
    .eq('event_type', 'med.created');

  return {
    totalUsers: totalUsers ?? 0,
    activeMerchants: activeMerchants ?? 0,
    totalVolume,
    pendingKycReviews: pendingKyc ?? 0,
    activeDisputes: activeDisputes ?? 0,
  };
}

/**
 * Check system health — Goat Pay API connectivity, Supabase connectivity.
 */
export async function getSystemHealth(): Promise<SystemHealth> {
  const now = new Date().toISOString();

  // Check Goat Pay API
  let goatPayStatus: 'ok' | 'error' = 'ok';
  let goatPayLatency: number | null = null;
  try {
    const start = Date.now();
    await goatPayClient.getBalance();
    goatPayLatency = Date.now() - start;
  } catch (err) {
    goatPayStatus = 'error';
    logger.error({ err }, 'Goat Pay API health check failed');
  }

  // Check Supabase
  let supabaseStatus: 'ok' | 'error' = 'ok';
  let supabaseLatency: number | null = null;
  try {
    const start = Date.now();
    await supabase.from('users').select('id', { count: 'exact', head: true }).limit(1);
    supabaseLatency = Date.now() - start;
  } catch (err) {
    supabaseStatus = 'error';
    logger.error({ err }, 'Supabase health check failed');
  }

  return {
    goatPayApi: goatPayStatus,
    goatPayLatencyMs: goatPayLatency,
    supabase: supabaseStatus,
    supabaseLatencyMs: supabaseLatency,
    timestamp: now,
  };
}

/**
 * Manage a user (suspend, ban, unsuspend, unban, promote, demote).
 * All operations audit logged.
 */
export async function manageUser(
  adminId: string,
  targetUserId: string,
  action: UserManagementAction,
  data?: Record<string, unknown>,
): Promise<void> {
  // Verify target user exists
  const { data: targetUser, error: fetchError } = await supabase
    .from('users')
    .select('id, email, role, is_active')
    .eq('id', targetUserId)
    .single();

  if (fetchError || !targetUser) {
    throw new AppError('User not found', 404, 'USER_NOT_FOUND');
  }

  const target = targetUser as Record<string, unknown>;

  // Prevent admin from managing themselves
  if (targetUserId === adminId) {
    throw new AppError('Cannot perform this action on yourself', 409, 'SELF_ACTION_FORBIDDEN');
  }

  const updateFields: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  };

  switch (action) {
    case 'suspend':
      updateFields.is_active = false;
      break;
    case 'ban':
      updateFields.is_active = false;
      // Ban could involve additional measures in the future
      break;
    case 'unsuspend':
      updateFields.is_active = true;
      break;
    case 'unban':
      updateFields.is_active = true;
      break;
    case 'promote':
      updateFields.role = UserRole.ADMIN;
      break;
    case 'demote': {
      // Cannot demote the last admin
      const { count: adminCount } = await supabase
        .from('users')
        .select('id', { count: 'exact', head: true })
        .eq('role', UserRole.ADMIN)
        .eq('is_active', true);

      if ((adminCount ?? 0) <= 1) {
        throw new AppError('Cannot demote the last active admin', 409, 'LAST_ADMIN_DEMOTE_FORBIDDEN');
      }
      updateFields.role = UserRole.MERCHANT;
      break;
    }
    default:
      throw new AppError(`Unknown management action: ${action}`, 400, 'INVALID_ACTION');
  }

  const { error: updateError } = await supabase
    .from('users')
    .update(updateFields)
    .eq('id', targetUserId);

  if (updateError) {
    logger.error({ error: updateError, targetUserId, action }, 'Failed to manage user');
    throw new AppError('Failed to update user', 500, 'USER_UPDATE_FAILED');
  }

  // Audit log
  await auditService.log(
    `user.${action}`,
    adminId,
    targetUserId,
    'user',
    { action, previousRole: target.role, previousActive: target.is_active, ...data },
  );

  logger.info(
    { adminId, targetUserId, action, email: target.email },
    'User management action performed',
  );
}
