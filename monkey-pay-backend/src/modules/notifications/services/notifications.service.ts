import { v4 as uuidv4 } from 'uuid';

import { supabase } from '../../config/supabase.js';
import logger from '../../utils/logger.js';
import { AppError } from '../../types/index.js';

// ============================================================
// Types
// ============================================================

export type NotificationEventType =
  | 'payment_received'
  | 'payment_completed'
  | 'transfer_sent'
  | 'transfer_received'
  | 'refund_processed'
  | 'kyc_approved'
  | 'kyc_rejected'
  | 'api_key_created'
  | 'webhook_failed'
  | 'low_balance';

export interface Notification {
  id: string;
  userId: string;
  type: string;
  title: string;
  message: string;
  data: Record<string, unknown> | null;
  isRead: boolean;
  createdAt: string;
}

export interface NotificationListItem {
  id: string;
  type: string;
  title: string;
  message: string;
  data: Record<string, unknown> | null;
  isRead: boolean;
  createdAt: string;
}

export interface NotificationListResult {
  notifications: NotificationListItem[];
  total: number;
  totalPages: number;
}

// ============================================================
// Title/message templates
// ============================================================

const NOTIFICATION_TEMPLATES: Record<
  NotificationEventType,
  (data?: Record<string, unknown>) => { title: string; message: string }
> = {
  payment_received: (data) => ({
    title: 'Payment Received',
    message: `A PIX payment of R$ ${((data?.amount as number) ?? 0 / 100).toFixed(2)} has been received.`,
  }),
  payment_completed: (data) => ({
    title: 'Payment Completed',
    message: `Your PIX payment of R$ ${((data?.amount as number) ?? 0 / 100).toFixed(2)} has been completed.`,
  }),
  transfer_sent: (data) => ({
    title: 'Transfer Sent',
    message: `A PIX transfer of R$ ${((data?.amount as number) ?? 0 / 100).toFixed(2)} has been sent.`,
  }),
  transfer_received: (data) => ({
    title: 'Transfer Received',
    message: `You received an internal transfer of R$ ${((data?.amount as number) ?? 0 / 100).toFixed(2)}.`,
  }),
  refund_processed: (data) => ({
    title: 'Refund Processed',
    message: `A refund of R$ ${((data?.amount as number) ?? 0 / 100).toFixed(2)} has been processed.`,
  }),
  kyc_approved: () => ({
    title: 'KYC Approved',
    message: 'Your identity verification has been approved. You can now use all features.',
  }),
  kyc_rejected: (data) => ({
    title: 'KYC Rejected',
    message: `Your identity verification was rejected. Reason: ${data?.reason ?? 'Not specified'}.`,
  }),
  api_key_created: (data) => ({
    title: 'API Key Created',
    message: `A new API key "${data?.name ?? 'unnamed'}" has been created.`,
  }),
  webhook_failed: (data) => ({
    title: 'Webhook Delivery Failed',
    message: `A webhook delivery to ${data?.url ?? 'your endpoint'} failed after multiple retries.`,
  }),
  low_balance: (data) => ({
    title: 'Low Balance Alert',
    message: `Your available balance is R$ ${((data?.balance as number) ?? 0 / 100).toFixed(2)}. Consider adding funds.`,
  }),
};

// ============================================================
// Service methods
// ============================================================

/**
 * Create a notification for a user.
 */
export async function createNotification(
  userId: string,
  type: string,
  title: string,
  message: string,
  data?: Record<string, unknown>,
): Promise<Notification> {
  const id = uuidv4();
  const now = new Date().toISOString();

  const { data: notification, error } = await supabase
    .from('notifications')
    .insert({
      id,
      user_id: userId,
      type,
      title,
      message,
      data: data ?? null,
      is_read: false,
      created_at: now,
    })
    .select('*')
    .single();

  if (error || !notification) {
    logger.error({ error, userId, type }, 'Failed to create notification');
    // Non-fatal: don't throw, notifications are best-effort
    return { id, userId, type, title, message, data: data ?? null, isRead: false, createdAt: now };
  }

  const row = notification as Record<string, unknown>;
  return {
    id: row.id as string,
    userId: row.user_id as string,
    type: row.type as string,
    title: row.title as string,
    message: row.message as string,
    data: row.data as Record<string, unknown> | null,
    isRead: row.is_read as boolean,
    createdAt: row.created_at as string,
  };
}

/**
 * Get notifications for a user (paginated).
 */
export async function getNotifications(
  userId: string,
  filters: { page: number; pageSize: number },
): Promise<NotificationListResult> {
  const offset = (filters.page - 1) * filters.pageSize;

  const { data, error, count } = await supabase
    .from('notifications')
    .select('id, type, title, message, data, is_read, created_at', { count: 'exact' })
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .range(offset, offset + filters.pageSize - 1);

  if (error) {
    logger.error({ error, userId }, 'Failed to list notifications');
    throw new AppError('Failed to list notifications', 500, 'NOTIFICATIONS_LIST_FAILED');
  }

  const notifications: NotificationListItem[] = (data ?? []).map(
    (row: Record<string, unknown>) => ({
      id: row.id as string,
      type: row.type as string,
      title: row.title as string,
      message: row.message as string,
      data: row.data as Record<string, unknown> | null,
      isRead: row.is_read as boolean,
      createdAt: row.created_at as string,
    }),
  );

  const total = count ?? 0;
  const totalPages = Math.ceil(total / filters.pageSize);

  return { notifications, total, totalPages };
}

/**
 * Mark a single notification as read.
 */
export async function markAsRead(
  userId: string,
  notificationId: string,
): Promise<void> {
  const { error } = await supabase
    .from('notifications')
    .update({ is_read: true })
    .eq('id', notificationId)
    .eq('user_id', userId);

  if (error) {
    logger.error({ error, notificationId, userId }, 'Failed to mark notification as read');
    throw new AppError('Failed to update notification', 500, 'NOTIFICATION_UPDATE_FAILED');
  }
}

/**
 * Mark all notifications as read for a user.
 */
export async function markAllAsRead(userId: string): Promise<number> {
  const { count, error } = await supabase
    .from('notifications')
    .update({ is_read: true }, { count: 'exact' })
    .eq('user_id', userId)
    .eq('is_read', false);

  if (error) {
    logger.error({ error, userId }, 'Failed to mark all notifications as read');
    throw new AppError('Failed to update notifications', 500, 'NOTIFICATIONS_UPDATE_FAILED');
  }

  return count ?? 0;
}

/**
 * Get the unread notification count for a user.
 */
export async function getUnreadCount(userId: string): Promise<number> {
  const { count, error } = await supabase
    .from('notifications')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .eq('is_read', false);

  if (error) {
    logger.error({ error, userId }, 'Failed to get unread notification count');
    return 0;
  }

  return count ?? 0;
}

/**
 * Main entry point: create a notification based on event type.
 */
export async function notifyUser(
  userId: string,
  eventType: NotificationEventType,
  eventData?: Record<string, unknown>,
): Promise<void> {
  const template = NOTIFICATION_TEMPLATES[eventType];
  if (!template) {
    logger.warn({ eventType }, 'Unknown notification event type');
    return;
  }

  const { title, message } = template(eventData);

  await createNotification(userId, eventType, title, message, eventData);
}
