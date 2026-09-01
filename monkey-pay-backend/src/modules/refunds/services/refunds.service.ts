import { v4 as uuidv4 } from 'uuid';

import { supabase } from '../../config/supabase.js';
import goatPayClient from '../../lib/goatPayClient.js';
import logger from '../../utils/logger.js';
import {
  AppError,
  RefundStatus,
  TransactionStatus,
  TransactionType,
  type Transaction,
  type Refund,
} from '../../types/index.js';
import { generateExternalReference } from '../../lib/idempotency.js';

// ============================================================
// Types
// ============================================================

export interface RefundResponse {
  id: string;
  goatpayRefundId: string;
  externalReference: string;
  transactionId: string;
  amount: number;
  status: string;
  reason: string | null;
  createdAt: string;
}

export interface RefundListItem {
  id: string;
  goatpayRefundId: string;
  externalReference: string;
  transactionId: string;
  amount: number;
  status: string;
  reason: string | null;
  createdAt: string;
  completedAt: string | null;
}

export interface RefundListResult {
  refunds: RefundListItem[];
  total: number;
  totalPages: number;
}

export interface RefundStatusResponse {
  id: string;
  goatpayRefundId: string;
  externalReference: string;
  transactionId: string;
  amount: number;
  status: string;
  reason: string | null;
  createdAt: string;
  completedAt: string | null;
}

// ============================================================
// Helpers
// ============================================================

function mapGoatPayRefundStatus(gpStatus: string): RefundStatus {
  const mapping: Record<string, RefundStatus> = {
    REQUESTED: RefundStatus.REQUESTED,
    PROCESSING: RefundStatus.PROCESSING,
    COMPLETED: RefundStatus.COMPLETED,
    FAILED: RefundStatus.FAILED,
  };
  return mapping[gpStatus] ?? RefundStatus.REQUESTED;
}

// ============================================================
// Service methods
// ============================================================

/**
 * Create a refund for a completed PIX-in transaction.
 *
 * 1. Find original transaction (must be type 'pix_in' and status 'completed')
 * 2. Generate externalReference
 * 3. Call Goat Pay createRefund
 * 4. Create local refund record (status: 'pending')
 * 5. Create transaction_event on original transaction (status → 'reversing')
 * 6. Return refund
 */
export async function createRefund(
  userId: string,
  data: {
    transactionId: string;
    reason?: string;
  },
): Promise<RefundResponse> {
  // 1. Find and validate the original transaction
  const { data: originalTx, error: txError } = await supabase
    .from('transactions')
    .select('*')
    .eq('id', data.transactionId)
    .eq('user_id', userId)
    .single();

  if (txError || !originalTx) {
    throw new AppError('Transaction not found', 404, 'TRANSACTION_NOT_FOUND');
  }

  const tx = originalTx as Record<string, unknown>;

  if (tx.type !== TransactionType.PIX_IN) {
    throw new AppError(
      'Only PIX-in (received) payments can be refunded',
      409,
      'INVALID_TRANSACTION_TYPE',
    );
  }

  if (tx.status !== TransactionStatus.COMPLETED) {
    throw new AppError(
      'Only completed payments can be refunded',
      409,
      'TRANSACTION_NOT_COMPLETED',
    );
  }

  // Check if a refund already exists for this transaction
  const { data: existingRefund } = await supabase
    .from('refunds')
    .select('id, status')
    .eq('transaction_id', data.transactionId)
    .in('status', [RefundStatus.REQUESTED, RefundStatus.PROCESSING])
    .maybeSingle();

  if (existingRefund) {
    throw new AppError(
      'A refund is already in progress for this transaction',
      409,
      'REFUND_ALREADY_EXISTS',
      false,
      { refundId: (existingRefund as Record<string, unknown>).id },
    );
  }

  // 2. Generate externalReference
  const externalReference = generateExternalReference('refund', userId);

  // 3. Call Goat Pay
  const gpResult = await goatPayClient.createRefund({
    paymentId: tx.goatpay_transaction_id as string,
    externalReference,
    reason: data.reason,
  });

  const gpData = gpResult as Record<string, unknown>;
  const gpRefundId = (gpData.id ?? gpData.refundId) as string;

  if (!gpRefundId) {
    logger.error({ userId, gpData }, 'Goat Pay returned no refund ID');
    throw new AppError('Refund created but no ID returned by provider', 502, 'GOATPAY_NO_ID');
  }

  // 4. Create local refund record
  const refundId = uuidv4();
  const { data: refund, error: refundError } = await supabase
    .from('refunds')
    .insert({
      id: refundId,
      user_id: userId,
      transaction_id: data.transactionId,
      goatpay_refund_id: gpRefundId,
      external_reference: externalReference,
      amount: tx.amount as number,
      status: RefundStatus.REQUESTED,
      reason: data.reason ?? null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      completed_at: null,
    })
    .select('*')
    .single();

  if (refundError || !refund) {
    logger.error({ error: refundError, userId, gpRefundId }, 'Failed to create local refund');
    throw new AppError('Refund created at provider but failed to save locally', 500, 'REFUND_SAVE_FAILED');
  }

  // 5. Create transaction_event on original transaction (status → 'reversing')
  const currentTxStatus = tx.status as TransactionStatus;
  await supabase.from('transaction_events').insert({
    id: uuidv4(),
    transaction_id: data.transactionId,
    from_status: currentTxStatus,
    to_status: TransactionStatus.REVERSED,
    source: 'system',
    payload: { refundId, reason: 'Refund initiated' },
    created_at: new Date().toISOString(),
  });

  logger.info(
    { userId, refundId, gpRefundId, transactionId: data.transactionId, amount: tx.amount },
    'Refund created',
  );

  return {
    id: refundId,
    goatpayRefundId: gpRefundId,
    externalReference,
    transactionId: data.transactionId,
    amount: tx.amount as number,
    status: RefundStatus.REQUESTED,
    reason: data.reason ?? null,
    createdAt: new Date().toISOString(),
  };
}

/**
 * Get refund status. If pending/processing, poll Goat Pay.
 */
export async function getRefundStatus(
  userId: string,
  refundId: string,
): Promise<RefundStatusResponse> {
  const { data: refund, error } = await supabase
    .from('refunds')
    .select('*')
    .eq('id', refundId)
    .eq('user_id', userId)
    .single();

  if (error || !refund) {
    throw new AppError('Refund not found', 404, 'REFUND_NOT_FOUND');
  }

  const r = refund as Record<string, unknown>;
  const currentStatus = r.status as RefundStatus;

  // Poll if still pending/processing
  if (
    currentStatus === RefundStatus.REQUESTED ||
    currentStatus === RefundStatus.PROCESSING
  ) {
    try {
      const gpResult = await goatPayClient.getRefundStatus(
        r.goatpay_refund_id as string,
      );
      const gpData = gpResult as Record<string, unknown>;
      const gpStatus = gpData.status as string;

      if (gpStatus) {
        const newStatus = mapGoatPayRefundStatus(gpStatus);

        if (newStatus !== currentStatus) {
          const updateFields: Record<string, unknown> = {
            status: newStatus,
            updated_at: new Date().toISOString(),
          };

          if (newStatus === RefundStatus.COMPLETED) {
            updateFields.completed_at = new Date().toISOString();
          }

          await supabase
            .from('refunds')
            .update(updateFields)
            .eq('id', refundId);

          // If refund completed, update the original transaction status
          if (newStatus === RefundStatus.COMPLETED) {
            await supabase
              .from('transactions')
              .update({
                status: TransactionStatus.REVERSED,
                updated_at: new Date().toISOString(),
                completed_at: new Date().toISOString(),
              })
              .eq('id', r.transaction_id);

            await supabase.from('transaction_events').insert({
              id: uuidv4(),
              transaction_id: r.transaction_id as string,
              from_status: TransactionStatus.COMPLETED,
              to_status: TransactionStatus.REVERSED,
              source: 'poll',
              payload: { refundId, gpData },
              created_at: new Date().toISOString(),
            });
          }

          r.status = newStatus;
          if (newStatus === RefundStatus.COMPLETED) {
            r.completed_at = new Date().toISOString();
          }
        }
      }
    } catch (err) {
      logger.warn(
        { err, refundId, userId },
        'Failed to poll Goat Pay for refund status, returning local status',
      );
    }
  }

  return {
    id: r.id as string,
    goatpayRefundId: r.goatpay_refund_id as string,
    externalReference: r.external_reference as string,
    transactionId: r.transaction_id as string,
    amount: r.amount as number,
    status: r.status as string,
    reason: r.reason as string | null,
    createdAt: r.created_at as string,
    completedAt: r.completed_at as string | null,
  };
}

/**
 * List refunds for a user (paginated, filterable).
 */
export async function listRefunds(
  userId: string,
  filters: {
    page: number;
    pageSize: number;
    status?: string;
  },
): Promise<RefundListResult> {
  let query = supabase
    .from('refunds')
    .select('*', { count: 'exact' })
    .eq('user_id', userId)
    .order('created_at', { ascending: false });

  if (filters.status) {
    query = query.eq('status', filters.status);
  }

  const offset = (filters.page - 1) * filters.pageSize;
  query = query.range(offset, offset + filters.pageSize - 1);

  const { data, error, count } = await query;

  if (error) {
    logger.error({ error, userId }, 'Failed to list refunds');
    throw new AppError('Failed to list refunds', 500, 'REFUNDS_LIST_FAILED');
  }

  const refunds: RefundListItem[] = (data ?? []).map(
    (row: Record<string, unknown>) => ({
      id: row.id as string,
      goatpayRefundId: row.goatpay_refund_id as string,
      externalReference: row.external_reference as string,
      transactionId: row.transaction_id as string,
      amount: row.amount as number,
      status: row.status as string,
      reason: row.reason as string | null,
      createdAt: row.created_at as string,
      completedAt: row.completed_at as string | null,
    }),
  );

  const total = count ?? 0;
  const totalPages = Math.ceil(total / filters.pageSize);

  return { refunds, total, totalPages };
}

/**
 * Process an inbound Goat Pay webhook event for refunds.
 * Called by the webhook handler — not exposed via HTTP.
 */
export async function processRefundWebhook(
  eventData: Record<string, unknown>,
): Promise<void> {
  const eventType = eventData.event as string;
  const data = eventData.data as Record<string, unknown> | undefined;
  if (!data) {
    logger.warn({ eventData }, 'Refund webhook missing data payload');
    return;
  }

  const externalReference = data.externalReference as string | undefined;
  if (!externalReference) {
    logger.warn({ data }, 'Refund webhook missing externalReference');
    return;
  }

  // Find local refund by externalReference
  const { data: refund } = await supabase
    .from('refunds')
    .select('*')
    .eq('external_reference', externalReference)
    .maybeSingle();

  if (!refund) {
    logger.warn({ externalReference, eventType }, 'Refund webhook: refund not found locally');
    return;
  }

  const r = refund as Record<string, unknown>;
  const currentStatus = r.status as RefundStatus;

  let newStatus: RefundStatus | null = null;

  switch (eventType) {
    case 'refund.requested':
      newStatus = RefundStatus.REQUESTED;
      break;
    case 'refund.completed':
      newStatus = RefundStatus.COMPLETED;
      break;
    case 'refund.failed':
      newStatus = RefundStatus.FAILED;
      break;
    default:
      logger.info({ eventType }, 'Ignoring unhandled refund webhook event');
      return;
  }

  if (newStatus && newStatus !== currentStatus) {
    const updateFields: Record<string, unknown> = {
      status: newStatus,
      updated_at: new Date().toISOString(),
    };

    if (newStatus === RefundStatus.COMPLETED) {
      updateFields.completed_at = new Date().toISOString();
    }

    await supabase
      .from('refunds')
      .update(updateFields)
      .eq('id', r.id);

    // If refund completed, update the original transaction
    if (newStatus === RefundStatus.COMPLETED) {
      await supabase
        .from('transactions')
        .update({
          status: TransactionStatus.REVERSED,
          updated_at: new Date().toISOString(),
          completed_at: new Date().toISOString(),
        })
        .eq('id', r.transaction_id);

      await supabase.from('transaction_events').insert({
        id: uuidv4(),
        transaction_id: r.transaction_id as string,
        from_status: TransactionStatus.COMPLETED,
        to_status: TransactionStatus.REVERSED,
        source: 'webhook',
        payload: { refundId: r.id, eventData: data },
        created_at: new Date().toISOString(),
      });
    }

    logger.info(
      { refundId: r.id, externalReference, eventType, from: currentStatus, to: newStatus },
      'Refund updated via webhook',
    );
  }
}
