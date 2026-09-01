import { v4 as uuidv4 } from 'uuid';

import { supabase } from '../../config/supabase.js';
import logger from '../../utils/logger.js';
import { AppError } from '../../types/index.js';

// ============================================================
// Types
// ============================================================

export interface AuditLogEntry {
  id: string;
  userId: string | null;
  action: string;
  resourceType: string;
  resourceId: string | null;
  details: Record<string, unknown> | null;
  ipAddress: string | null;
  userAgent: string | null;
  createdAt: string;
}

export interface AuditLogListItem {
  id: string;
  userId: string | null;
  action: string;
  resourceType: string;
  resourceId: string | null;
  details: Record<string, unknown> | null;
  ipAddress: string | null;
  createdAt: string;
}

export interface AuditLogListResult {
  logs: AuditLogListItem[];
  total: number;
  totalPages: number;
}

// ============================================================
// Service methods
// ============================================================

/**
 * Log an audit entry. Used by all other modules.
 */
export async function log(
  action: string,
  userId: string | null = null,
  resourceId: string | null = null,
  resourceType: string | null = null,
  details?: Record<string, unknown>,
  ipAddress?: string | null,
): Promise<void> {
  const id = uuidv4();

  await supabase.from('audit_logs').insert({
    id,
    user_id: userId,
    action,
    resource_type: resourceType ?? 'unknown',
    resource_id: resourceId,
    details: details ?? null,
    ip_address: ipAddress ?? null,
    user_agent: null,
    created_at: new Date().toISOString(),
  });
}

/**
 * Get audit logs with filters (admin).
 */
export async function getAuditLog(
  filters: {
    page: number;
    pageSize: number;
 userId?: string;
    action?: string;
    resourceType?: string;
    resourceId?: string;
    startDate?: string;
    endDate?: string;
  },
): Promise<AuditLogListResult> {
  let query = supabase
    .from('audit_logs')
    .select('id, user_id, action, resource_type, resource_id, details, ip_address, created_at', { count: 'exact' })
    .order('created_at', { ascending: false });

  if (filters.userId) query = query.eq('user_id', filters.userId);
  if (filters.action) query = query.eq('action', filters.action);
  if (filters.resourceType) query = query.eq('resource_type', filters.resourceType);
  if (filters.resourceId) query = query.eq('resource_id', filters.resourceId);
  if (filters.startDate) query = query.gte('created_at', filters.startDate);
  if (filters.endDate) query = query.lte('created_at', filters.endDate);

  const offset = (filters.page - 1) * filters.pageSize;
  query = query.range(offset, offset + filters.pageSize - 1);

  const { data, error, count } = await query;

  if (error) {
    logger.error({ error }, 'Failed to list audit logs');
    throw new AppError('Failed to list audit logs', 500, 'AUDIT_LOG_LIST_FAILED');
  }

  const logs: AuditLogListItem[] = (data ?? []).map(
    (row: Record<string, unknown>) => ({
      id: row.id as string,
      userId: row.user_id as string | null,
      action: row.action as string,
      resourceType: row.resource_type as string,
      resourceId: row.resource_id as string | null,
      details: row.details as Record<string, unknown> | null,
      ipAddress: row.ip_address as string | null,
      createdAt: row.created_at as string,
    }),
  );

  const total = count ?? 0;
  const totalPages = Math.ceil(total / filters.pageSize);

  return { logs, total, totalPages };
}
