import { v4 as uuidv4 } from 'uuid';

import { supabase } from '../../config/supabase.js';
import goatPayClient from '../../lib/goatPayClient.js';
import logger from '../../utils/logger.js';
import {
  AppError,
  TransactionStatus,
  TransactionType,
  type Subaccount,
  type Transaction,
} from '../../types/index.js';
import {
  generateExternalReference,
  checkIdempotency,
} from '../../lib/idempotency.js';

// ============================================================
// Types
// ============================================================

export interface CreatePaymentData {
  amount: number;
  description?: string;
  externalReference?: string;
  coverFee: boolean;
  subaccountMode: boolean;
}

export interface PaymentResponse {
  transaction: {
    id: string;
    goatpayTransactionId: string;
    externalReference: string;
    type: string;
    status: string;
    amount: number;
    fee: number;
    netAmount: number;
    description: string | null;
    coverFee: boolean;
    createdAt: string;
  };
  pixData: {
    qrCodeBase64?: string;
    copyPaste?: string;
    brCode?: string;
    expiresAt?: string;
  };
}

export interface PaymentListItem {
  id: string;
  goatpayTransactionId: string;
  externalReference: string;
  type: string;
  status: string;
  amount: number;
  fee: number;
  netAmount: number;
  description: string | null;
  coverFee: boolean;
  createdAt: string;
  completedAt: string | null;
}

export interface PaymentListResult {
  payments: PaymentListItem[];
  total: number;
  totalPages: number;
}

export interface PaymentStatusResponse {
  id: string;
  goatpayTransactionId: string;
  externalReference: string;
  status: string;
  amount: number;
  fee: number;
  netAmount: number;
  description: string | null;
  coverFee: boolean;
  createdAt: string;
  completedAt: string | null;
  pixData?: {
    qrCodeBase64?: string;
    copyPaste?: string;
    brCode?: string;
    expiresAt?: string;
  };
}

// ============================================================
// Helpers
// ============================================================

/**
 * Fetch the user's active subaccount from DB.
 * Throws if not found or inactive.
 */
async function getActiveSubaccount(userId: string): Promise<Subaccount> {
  const { data: subaccount, error } = await supabase
    .from('subaccounts')
    .select('*')
    .eq('user_id', userId)
    .eq('is_active', true)
    .single();

  if (error || !subaccount) {
    throw new AppError(
      'No active subaccount found. Complete KYC first.',
      404,
      'SUBACCOUNT_NOT_FOUND',
    );
  }

  return subaccount as Subaccount;
}

/**
 * Map a Goat Pay status string to our internal TransactionStatus enum.
 */
function mapGoatPayStatus(gpStatus: string): TransactionStatus {
  const mapping: Record<string, TransactionStatus> = {
    PENDING: TransactionStatus.PENDING,
    PROCESSING: TransactionStatus.PROCESSING,
    COMPLETED: TransactionStatus.COMPLETED,
    FAILED: TransactionStatus.FAILED,
    CANCELED: TransactionStatus.CANCELED,
    REVERSED: TransactionStatus.REVERSED,
  };
  return mapping[gpStatus] ?? TransactionStatus.PENDING;
}

/**
 * Create a transaction event record in the DB.
 */
async function createTransactionEvent(
  transactionId: string,
  toStatus: TransactionStatus,
  fromStatus: TransactionStatus | null,
  source: 'webhook' | 'poll' | 'system',
  payload: Record<string, unknown> | null = null,
): Promise<void> {
  await supabase.from('transaction_events').insert({
    id: uuidv4(),
    transaction_id: transactionId,
    from_status: fromStatus,
    to_status: toStatus,
    source,
    payload,
    created_at: new Date().toISOString(),
  });
}

// ============================================================
// Service methods
// ============================================================

/**
 * Create a PIX payment (receive money).
 *
 * 1. Check user has an active subaccount.
 * 2. Generate externalReference if not provided.
 * 3. Check idempotency — return existing if found.
 * 4. Call Goat Pay createPaymentPix.
 * 5. Create local transaction record (status: 'pending').
 * 6. Create transaction_event.
 * 7. Return transaction + QR/copy-paste data.
 */
export async function createPayment(
  userId: string,
  data: CreatePaymentData,
): Promise<PaymentResponse> {
  const subaccount = await getActiveSubaccount(userId);

  // 1. Generate externalReference if not provided
  const externalReference = data.externalReference
    ?? generateExternalReference('pix_in', userId);

  // 2. Idempotency check — if the externalReference already exists, return it
  const existing = await checkIdempotency<Transaction>(
    'transactions',
    externalReference,
  );

  if (existing) {
    logger.info({ userId, externalReference, existingId: existing.id }, 'Returning existing payment (idempotent)');
    return {
      transaction: {
        id: existing.id,
        goatpayTransactionId: existing.goatpay_transaction_id,
        externalReference: existing.external_reference,
        type: existing.type,
        status: existing.status,
        amount: existing.amount,
        fee: existing.fee,
        netAmount: existing.net_amount,
        description: existing.description,
        coverFee: existing.cover_fee,
        createdAt: existing.created_at,
      },
      pixData: {},
    };
  }

  // 3. Call Goat Pay
  const gpResult = await goatPayClient.createPaymentPix({
    amount: data.amount,
    description: data.description,
    externalReference,
    coverFee: data.coverFee,
    subaccountId: data.subaccountMode ? subaccount.goatpay_subaccount_id : undefined,
  });

  const gpData = gpResult as Record<string, unknown>;
  const gpPaymentId = (gpData.id ?? gpData.paymentId) as string;

  if (!gpPaymentId) {
    logger.error({ userId, gpData }, 'Goat Pay returned no payment ID');
    throw new AppError('Payment created but no ID returned by provider', 502, 'GOATPAY_NO_ID');
  }

  // 4. Create local transaction (status: 'pending')
  const transactionId = uuidv4();
  const fee = (gpData.fee as number) ?? 0;
  const netAmount = data.coverFee ? data.amount : data.amount - fee;

  const { data: transaction, error: txError } = await supabase
    .from('transactions')
    .insert({
      id: transactionId,
      user_id: userId,
      subaccount_id: subaccount.id,
      goatpay_transaction_id: gpPaymentId,
      external_reference: externalReference,
      type: TransactionType.PIX_IN,
      status: TransactionStatus.PENDING,
      amount: data.amount,
      fee,
      net_amount: netAmount,
      description: data.description ?? null,
      pix_key: null,
      destination_email: null,
      cover_fee: data.coverFee,
      metadata: gpData,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      completed_at: null,
    })
    .select('*')
    .single();

  if (txError || !transaction) {
    logger.error({ error: txError, userId, gpPaymentId }, 'Failed to create local transaction');
    throw new AppError('Payment created at provider but failed to save locally', 500, 'TX_SAVE_FAILED');
  }

  // 5. Create transaction event
  await createTransactionEvent(transactionId, TransactionStatus.PENDING, null, 'system');

  logger.info({ userId, transactionId, gpPaymentId, amount: data.amount }, 'PIX payment created');

  // 6. Extract PIX data from Goat Pay response
  const pixData: PaymentResponse['pixData'] = {
    qrCodeBase64: (gpData.qrCodeBase64 as string | undefined)
      ?? (gpData.qrCode as string | undefined),
    copyPaste: (gpData.copyPaste as string | undefined)
      ?? (gpData.brCode as string | undefined)
      ?? (gpData.emv as string | undefined),
    brCode: (gpData.brCode as string | undefined)
      ?? (gpData.emv as string | undefined),
    expiresAt: (gpData.expiresAt as string | undefined)
      ?? (gpData.expiresAt as string | undefined),
  };

  return {
    transaction: {
      id: (transaction as Record<string, unknown>).id as string,
      goatpayTransactionId: (transaction as Record<string, unknown>).goatpay_transaction_id as string,
      externalReference: (transaction as Record<string, unknown>).external_reference as string,
      type: (transaction as Record<string, unknown>).type as string,
      status: (transaction as Record<string, unknown>).status as string,
      amount: (transaction as Record<string, unknown>).amount as number,
      fee: (transaction as Record<string, unknown>).fee as number,
      netAmount: (transaction as Record<string, unknown>).net_amount as number,
      description: (transaction as Record<string, unknown>).description as string | null,
      coverFee: (transaction as Record<string, unknown>).cover_fee as boolean,
      createdAt: (transaction as Record<string, unknown>).created_at as string,
    },
    pixData,
  };
}

/**
 * Get payment status. If pending/processing, poll Goat Pay for latest.
 */
export async function getPaymentStatus(
  userId: string,
  paymentId: string,
): Promise<PaymentStatusResponse> {
  const { data: transaction, error } = await supabase
    .from('transactions')
    .select('*')
    .eq('id', paymentId)
    .eq('user_id', userId)
    .single();

  if (error || !transaction) {
    throw new AppError('Payment not found', 404, 'PAYMENT_NOT_FOUND');
  }

  const tx = transaction as Record<string, unknown>;
  const currentStatus = tx.status as TransactionStatus;

  // If still pending/processing, poll Goat Pay for the latest status
  if (
    currentStatus === TransactionStatus.PENDING ||
    currentStatus === TransactionStatus.PROCESSING
  ) {
    try {
      const gpResult = await goatPayClient.getPaymentPixStatus(
        tx.goatpay_transaction_id as string,
      );
      const gpData = gpResult as Record<string, unknown>;
      const gpStatus = gpData.status as string;

      if (gpStatus) {
        const newStatus = mapGoatPayStatus(gpStatus);

        if (newStatus !== currentStatus) {
          // Update local transaction
          const updateFields: Record<string, unknown> = {
            status: newStatus,
            updated_at: new Date().toISOString(),
          };
          if (newStatus === TransactionStatus.COMPLETED) {
            updateFields.completed_at = new Date().toISOString();
            const gpFee = (gpData.fee as number) ?? 0;
            updateFields.fee = gpFee;
            updateFields.net_amount = (tx.cover_fee as boolean)
              ? tx.amount
              : (tx.amount as number) - gpFee;
          }

          await supabase
            .from('transactions')
            .update(updateFields)
            .eq('id', paymentId);

          await createTransactionEvent(paymentId, newStatus, currentStatus, 'poll', gpData);

          tx.status = newStatus;
          if (newStatus === TransactionStatus.COMPLETED) {
            tx.completed_at = new Date().toISOString();
          }
        }
      }
    } catch (err) {
      // Polling failure is non-fatal; return the local status
      logger.warn(
        { err, paymentId, userId },
        'Failed to poll Goat Pay for payment status, returning local status',
      );
    }
  }

  // Extract PIX data from metadata if available
  const metadata = tx.metadata as Record<string, unknown> | null;
  const pixData = metadata
    ? {
        qrCodeBase64: (metadata.qrCodeBase64 as string | undefined)
          ?? (metadata.qrCode as string | undefined),
        copyPaste: (metadata.copyPaste as string | undefined)
          ?? (metadata.brCode as string | undefined)
          ?? (metadata.emv as string | undefined),
        brCode: (metadata.brCode as string | undefined)
          ?? (metadata.emv as string | undefined),
        expiresAt: (metadata.expiresAt as string | undefined),
      }
    : undefined;

  return {
    id: tx.id as string,
    goatpayTransactionId: tx.goatpay_transaction_id as string,
    externalReference: tx.external_reference as string,
    status: tx.status as string,
    amount: tx.amount as number,
    fee: tx.fee as number,
    netAmount: tx.net_amount as number,
    description: tx.description as string | null,
    coverFee: tx.cover_fee as boolean,
    createdAt: tx.created_at as string,
    completedAt: tx.completed_at as string | null,
    pixData,
  };
}

/**
 * Get a single payment by ID.
 */
export async function getPayment(
  userId: string,
  paymentId: string,
): Promise<PaymentStatusResponse> {
  // Reuse getPaymentStatus (it also returns full payment data)
  return getPaymentStatus(userId, paymentId);
}

/**
 * List payments for a user (paginated, filterable).
 */
export async function listPayments(
  userId: string,
  filters: {
    page: number;
    pageSize: number;
    status?: string;
    startDate?: string;
    endDate?: string;
  },
): Promise<PaymentListResult> {
  let query = supabase
    .from('transactions')
    .select('*', { count: 'exact' })
    .eq('user_id', userId)
    .eq('type', TransactionType.PIX_IN)
    .order('created_at', { ascending: false });

  if (filters.status) {
    query = query.eq('status', filters.status);
  }
  if (filters.startDate) {
    query = query.gte('created_at', filters.startDate);
  }
  if (filters.endDate) {
    query = query.lte('created_at', filters.endDate);
  }

  const offset = (filters.page - 1) * filters.pageSize;
  query = query.range(offset, offset + filters.pageSize - 1);

  const { data, error, count } = await query;

  if (error) {
    logger.error({ error, userId }, 'Failed to list payments');
    throw new AppError('Failed to list payments', 500, 'PAYMENTS_LIST_FAILED');
  }

  const payments: PaymentListItem[] = (data ?? []).map(
    (row: Record<string, unknown>) => ({
      id: row.id as string,
      goatpayTransactionId: row.goatpay_transaction_id as string,
      externalReference: row.external_reference as string,
      type: row.type as string,
      status: row.status as string,
      amount: row.amount as number,
      fee: row.fee as number,
      netAmount: row.net_amount as number,
      description: row.description as string | null,
      coverFee: row.cover_fee as boolean,
      createdAt: row.created_at as string,
      completedAt: row.completed_at as string | null,
    }),
  );

  const total = count ?? 0;
  const totalPages = Math.ceil(total / filters.pageSize);

  return { payments, total, totalPages };
}

/**
 * Process an inbound Goat Pay webhook event for payments.
 * Called by the webhook handler — not exposed via HTTP.
 */
export async function processPaymentWebhook(
  eventData: Record<string, unknown>,
): Promise<void> {
  const eventType = eventData.event as string;
  const data = eventData.data as Record<string, unknown> | undefined;
  if (!data) {
    logger.warn({ eventData }, 'Payment webhook missing data payload');
    return;
  }

  const externalReference = data.externalReference as string | undefined;
  if (!externalReference) {
    logger.warn({ data }, 'Payment webhook missing externalReference');
    return;
  }

  // Find the local transaction by externalReference
  const { data: transaction } = await supabase
    .from('transactions')
    .select('*')
    .eq('external_reference', externalReference)
    .maybeSingle();

  if (!transaction) {
    logger.warn({ externalReference, eventType }, 'Payment webhook: transaction not found locally');
    return;
  }

  const tx = transaction as Record<string, unknown>;
  const currentStatus = tx.status as TransactionStatus;
  const gpPaymentId = data.id as string;

  let newStatus: TransactionStatus | null = null;

  switch (eventType) {
    case 'payment.created':
      newStatus = TransactionStatus.PENDING;
      break;
    case 'payment.paid':
      newStatus = TransactionStatus.COMPLETED;
      break;
    case 'payment.failed':
      newStatus = TransactionStatus.FAILED;
      break;
    case 'payment.pix.expired':
      newStatus = TransactionStatus.CANCELED;
      break;
    case 'payment.refunded':
      newStatus = TransactionStatus.REVERSED;
      break;
    default:
      logger.info({ eventType }, 'Ignoring unhandled payment webhook event');
      return;
  }

  // Only update if the status actually changed
  if (newStatus && newStatus !== currentStatus) {
    const updateFields: Record<string, unknown> = {
      status: newStatus,
      updated_at: new Date().toISOString(),
    };

    if (newStatus === TransactionStatus.COMPLETED || newStatus === TransactionStatus.REVERSED) {
      updateFields.completed_at = new Date().toISOString();
    }

    // Update fee if provided by webhook
    if (data.fee !== undefined) {
      updateFields.fee = data.fee as number;
      updateFields.net_amount = (tx.cover_fee as boolean)
        ? tx.amount
        : (tx.amount as number) - (data.fee as number);
    }

    // Update Goat Pay transaction ID if we didn't have it yet
    if (gpPaymentId && !tx.goatpay_transaction_id) {
      updateFields.goatpay_transaction_id = gpPaymentId;
    }

    await supabase
      .from('transactions')
      .update(updateFields)
      .eq('id', tx.id);

    await createTransactionEvent(
      tx.id as string,
      newStatus,
      currentStatus,
      'webhook',
      data,
    );

    logger.info(
      { transactionId: tx.id, externalReference, eventType, from: currentStatus, to: newStatus },
      'Payment transaction updated via webhook',
    );
  }
}
