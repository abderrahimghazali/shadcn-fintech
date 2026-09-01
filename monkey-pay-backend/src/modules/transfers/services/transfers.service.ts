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

export interface TransferResponse {
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
    pixKey: string | null;
    coverFee: boolean;
    createdAt: string;
  };
}

export interface TransferListItem {
  id: string;
  goatpayTransactionId: string;
  externalReference: string;
  type: string;
  status: string;
  amount: number;
  fee: number;
  netAmount: number;
  description: string | null;
  pixKey: string | null;
  destinationEmail: string | null;
  coverFee: boolean;
  createdAt: string;
  completedAt: string | null;
}

export interface TransferListResult {
  transfers: TransferListItem[];
  total: number;
  totalPages: number;
}

export interface TransferStatusResponse {
  id: string;
  goatpayTransactionId: string;
  externalReference: string;
  type: string;
  status: string;
  amount: number;
  fee: number;
  netAmount: number;
  description: string | null;
  pixKey: string | null;
  destinationEmail: string | null;
  coverFee: boolean;
  createdAt: string;
  completedAt: string | null;
}

export interface ScheduledTransferResponse {
  id: string;
  goatpayScheduledId: string;
  externalReference: string;
  amount: number;
  pixKey: string;
  scheduleType: string;
  status: string;
  nextExecution: string | null;
  createdAt: string;
}

export interface ScheduledTransferListItem {
  id: string;
  goatpayScheduledId: string;
  externalReference: string;
  amount: number;
  pixKey: string;
  scheduleType: string;
  cronExpression: string | null;
  balanceThreshold: number | null;
  nextExecution: string | null;
  status: string;
  createdAt: string;
}

export interface ScheduledListResult {
  scheduled: ScheduledTransferListItem[];
  total: number;
  totalPages: number;
}

// ============================================================
// Helpers
// ============================================================

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

/**
 * Check that the user's subaccount has sufficient spendable balance.
 */
async function assertSufficientBalance(
  subaccountId: string,
  amount: number,
  coverFee: boolean,
): Promise<void> {
  // coverFee=true for transfers means amount is what destination receives,
  // so we need more balance (amount + fee). We check spendable >= amount as a
  // minimum — Goat Pay will reject at their level if truly insufficient.
  const balance = await goatPayClient.getSubaccountBalance(subaccountId);
  if (balance.spendablePadrao < amount) {
    throw new AppError(
      'Insufficient balance for this transfer',
      422,
      'INSUFFICIENT_BALANCE',
      false,
      {
        spendable: balance.spendablePadrao,
        requested: amount,
      },
    );
  }
}

// ============================================================
// Service methods
// ============================================================

/**
 * Create an external PIX transfer (send money to a PIX key).
 *
 * 1. Check subaccount + sufficient balance
 * 2. Generate externalReference if not provided
 * 3. Idempotency check
 * 4. Call Goat Pay createTransferPix
 * 5. Create local transaction (type: 'pix_out', status: 'pending')
 * 6. Return transaction
 */
export async function createTransfer(
  userId: string,
  data: {
    amount: number;
    pixKey: string;
    pixKeyType: 'cpf' | 'cnpj' | 'email' | 'phone' | 'random';
    description?: string;
    externalReference?: string;
    coverFee: boolean;
  },
): Promise<TransferResponse> {
  const subaccount = await getActiveSubaccount(userId);

  // 1. Check sufficient balance
  await assertSufficientBalance(
    subaccount.goatpay_subaccount_id,
    data.amount,
    data.coverFee,
  );

  // 2. Generate externalReference if not provided
  const externalReference = data.externalReference
    ?? generateExternalReference('pix_out', userId);

  // 3. Idempotency check
  const existing = await checkIdempotency<Transaction>(
    'transactions',
    externalReference,
  );

  if (existing) {
    logger.info({ userId, externalReference, existingId: existing.id }, 'Returning existing transfer (idempotent)');
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
        pixKey: existing.pix_key,
        coverFee: existing.cover_fee,
        createdAt: existing.created_at,
      },
    };
  }

  // 4. Call Goat Pay
  const gpResult = await goatPayClient.createTransferPix({
    amount: data.amount,
    pixKey: data.pixKey,
    pixKeyType: data.pixKeyType,
    description: data.description,
    externalReference,
    coverFee: data.coverFee,
    subaccountId: subaccount.goatpay_subaccount_id,
  });

  const gpData = gpResult as Record<string, unknown>;
  const gpTransferId = (gpData.id ?? gpData.transferId) as string;

  if (!gpTransferId) {
    logger.error({ userId, gpData }, 'Goat Pay returned no transfer ID');
    throw new AppError('Transfer created but no ID returned by provider', 502, 'GOATPAY_NO_ID');
  }

  // 5. Create local transaction
  const transactionId = uuidv4();
  const fee = (gpData.fee as number) ?? 0;
  const netAmount = data.coverFee ? data.amount : data.amount - fee;

  const { data: transaction, error: txError } = await supabase
    .from('transactions')
    .insert({
      id: transactionId,
      user_id: userId,
      subaccount_id: subaccount.id,
      goatpay_transaction_id: gpTransferId,
      external_reference: externalReference,
      type: TransactionType.PIX_OUT,
      status: TransactionStatus.PENDING,
      amount: data.amount,
      fee,
      net_amount: netAmount,
      description: data.description ?? null,
      pix_key: data.pixKey,
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
    logger.error({ error: txError, userId, gpTransferId }, 'Failed to create local transaction');
    throw new AppError('Transfer created at provider but failed to save locally', 500, 'TX_SAVE_FAILED');
  }

  // 6. Create transaction event
  await createTransactionEvent(transactionId, TransactionStatus.PENDING, null, 'system');

  logger.info({ userId, transactionId, gpTransferId, amount: data.amount, pixKey: data.pixKey }, 'PIX transfer created');

  return {
    transaction: {
      id: transactionId,
      goatpayTransactionId: gpTransferId,
      externalReference,
      type: TransactionType.PIX_OUT,
      status: TransactionStatus.PENDING,
      amount: data.amount,
      fee,
      netAmount,
      description: data.description ?? null,
      pixKey: data.pixKey,
      coverFee: data.coverFee,
      createdAt: new Date().toISOString(),
    },
  };
}

/**
 * Create an internal transfer (between Goat Pay accounts by email).
 */
export async function createInternalTransfer(
  userId: string,
  data: {
    amount: number;
    recipientEmail: string;
    description?: string;
    externalReference?: string;
  },
): Promise<TransferResponse> {
  const subaccount = await getActiveSubaccount(userId);

  // Check balance
  await assertSufficientBalance(subaccount.goatpay_subaccount_id, data.amount, false);

  const externalReference = data.externalReference
    ?? generateExternalReference('internal', userId);

  // Idempotency check
  const existing = await checkIdempotency<Transaction>(
    'transactions',
    externalReference,
  );

  if (existing) {
    logger.info({ userId, externalReference, existingId: existing.id }, 'Returning existing internal transfer (idempotent)');
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
        pixKey: existing.pix_key,
        coverFee: existing.cover_fee,
        createdAt: existing.created_at,
      },
    };
  }

  // Call Goat Pay
  const gpResult = await goatPayClient.createTransferInternal({
    email: data.recipientEmail,
    amount: data.amount,
    externalReference,
    description: data.description,
  });

  const gpData = gpResult as Record<string, unknown>;
  const gpTransferId = (gpData.id ?? gpData.transferId) as string;

  if (!gpTransferId) {
    logger.error({ userId, gpData }, 'Goat Pay returned no internal transfer ID');
    throw new AppError('Internal transfer created but no ID returned by provider', 502, 'GOATPAY_NO_ID');
  }

  // Create local transaction (internal transfers have zero fee)
  const transactionId = uuidv4();

  const { data: transaction, error: txError } = await supabase
    .from('transactions')
    .insert({
      id: transactionId,
      user_id: userId,
      subaccount_id: subaccount.id,
      goatpay_transaction_id: gpTransferId,
      external_reference: externalReference,
      type: TransactionType.TRANSFER_INTERNAL,
      status: TransactionStatus.PENDING,
      amount: data.amount,
      fee: 0,
      net_amount: data.amount,
      description: data.description ?? null,
      pix_key: null,
      destination_email: data.recipientEmail,
      cover_fee: false,
      metadata: gpData,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      completed_at: null,
    })
    .select('*')
    .single();

  if (txError || !transaction) {
    logger.error({ error: txError, userId, gpTransferId }, 'Failed to create local transaction');
    throw new AppError('Internal transfer created at provider but failed to save locally', 500, 'TX_SAVE_FAILED');
  }

  await createTransactionEvent(transactionId, TransactionStatus.PENDING, null, 'system');

  logger.info({ userId, transactionId, gpTransferId, amount: data.amount, recipientEmail: data.recipientEmail }, 'Internal transfer created');

  return {
    transaction: {
      id: transactionId,
      goatpayTransactionId: gpTransferId,
      externalReference,
      type: TransactionType.TRANSFER_INTERNAL,
      status: TransactionStatus.PENDING,
      amount: data.amount,
      fee: 0,
      netAmount: data.amount,
      description: data.description ?? null,
      pixKey: null,
      coverFee: false,
      createdAt: new Date().toISOString(),
    },
  };
}

/**
 * Get transfer status. If pending/processing, poll Goat Pay.
 */
export async function getTransferStatus(
  userId: string,
  transferId: string,
): Promise<TransferStatusResponse> {
  const { data: transaction, error } = await supabase
    .from('transactions')
    .select('*')
    .eq('id', transferId)
    .eq('user_id', userId)
    .single();

  if (error || !transaction) {
    throw new AppError('Transfer not found', 404, 'TRANSFER_NOT_FOUND');
  }

  const tx = transaction as Record<string, unknown>;
  const currentStatus = tx.status as TransactionStatus;
  const txType = tx.type as TransactionType;

  // If still pending/processing, poll Goat Pay
  if (
    currentStatus === TransactionStatus.PENDING ||
    currentStatus === TransactionStatus.PROCESSING
  ) {
    try {
      let gpResult: Record<string, unknown>;

      if (txType === TransactionType.TRANSFER_INTERNAL) {
        // Internal transfers don't have a dedicated status endpoint;
        // the status comes via webhook only.
        gpResult = {};
      } else {
        gpResult = (await goatPayClient.getTransferPixStatus(
          tx.goatpay_transaction_id as string,
        )) as Record<string, unknown>;
      }

      const gpStatus = gpResult.status as string | undefined;

      if (gpStatus) {
        const newStatus = mapGoatPayStatus(gpStatus);

        if (newStatus !== currentStatus) {
          const updateFields: Record<string, unknown> = {
            status: newStatus,
            updated_at: new Date().toISOString(),
          };

          if (newStatus === TransactionStatus.COMPLETED) {
            updateFields.completed_at = new Date().toISOString();
          }

          await supabase
            .from('transactions')
            .update(updateFields)
            .eq('id', transferId);

          await createTransactionEvent(transferId, newStatus, currentStatus, 'poll', gpResult);

          tx.status = newStatus;
          if (newStatus === TransactionStatus.COMPLETED) {
            tx.completed_at = new Date().toISOString();
          }
        }
      }
    } catch (err) {
      logger.warn(
        { err, transferId, userId },
        'Failed to poll Goat Pay for transfer status, returning local status',
      );
    }
  }

  return {
    id: tx.id as string,
    goatpayTransactionId: tx.goatpay_transaction_id as string,
    externalReference: tx.external_reference as string,
    type: tx.type as string,
    status: tx.status as string,
    amount: tx.amount as number,
    fee: tx.fee as number,
    netAmount: tx.net_amount as number,
    description: tx.description as string | null,
    pixKey: tx.pix_key as string | null,
    destinationEmail: tx.destination_email as string | null,
    coverFee: tx.cover_fee as boolean,
    createdAt: tx.created_at as string,
    completedAt: tx.completed_at as string | null,
  };
}

/**
 * List transfers for a user (paginated, filterable).
 */
export async function listTransfers(
  userId: string,
  filters: {
    page: number;
    pageSize: number;
    status?: string;
    type?: string;
  },
): Promise<TransferListResult> {
  let query = supabase
    .from('transactions')
    .select('*', { count: 'exact' })
    .eq('user_id', userId)
    .in('type', [TransactionType.PIX_OUT, TransactionType.TRANSFER_INTERNAL])
    .order('created_at', { ascending: false });

  if (filters.status) {
    query = query.eq('status', filters.status);
  }
  if (filters.type) {
    query = query.eq('type', filters.type);
  }

  const offset = (filters.page - 1) * filters.pageSize;
  query = query.range(offset, offset + filters.pageSize - 1);

  const { data, error, count } = await query;

  if (error) {
    logger.error({ error, userId }, 'Failed to list transfers');
    throw new AppError('Failed to list transfers', 500, 'TRANSFERS_LIST_FAILED');
  }

  const transfers: TransferListItem[] = (data ?? []).map(
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
      pixKey: row.pix_key as string | null,
      destinationEmail: row.destination_email as string | null,
      coverFee: row.cover_fee as boolean,
      createdAt: row.created_at as string,
      completedAt: row.completed_at as string | null,
    }),
  );

  const total = count ?? 0;
  const totalPages = Math.ceil(total / filters.pageSize);

  return { transfers, total, totalPages };
}

/**
 * Create a scheduled transfer.
 * Max 20 active per account (enforced by Goat Pay; we also check locally).
 */
export async function createScheduledTransfer(
  userId: string,
  data: {
    amount: number;
    pixKey: string;
    pixKeyType: 'cpf' | 'cnpj' | 'email' | 'phone' | 'random';
    scheduleType: 'once' | 'recurring' | 'balance_trigger';
    scheduledDate?: string;
    recurrence?: 'daily' | 'weekly' | 'monthly';
    triggerBalanceThreshold?: number;
    description?: string;
  },
): Promise<ScheduledTransferResponse> {
  const subaccount = await getActiveSubaccount(userId);

  // Check max 20 active scheduled transfers
  const { count: activeCount } = await supabase
    .from('transfers_scheduled')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', userId)
    .eq('status', 'active');

  if ((activeCount ?? 0) >= 20) {
    throw new AppError(
      'Maximum of 20 active scheduled transfers reached',
      409,
      'SCHEDULED_TRANSFER_LIMIT',
    );
  }

  const externalReference = generateExternalReference('sched', userId);

  // Build cron expression for recurring
  let cronExpression: string | undefined;
  if (data.scheduleType === 'recurring' && data.recurrence) {
    switch (data.recurrence) {
      case 'daily':
        cronExpression = '0 0 * * *';
        break;
      case 'weekly':
        cronExpression = '0 0 * * 1';
        break;
      case 'monthly':
        cronExpression = '0 0 1 * *';
        break;
    }
  }

  // Call Goat Pay
  const gpResult = await goatPayClient.createTransferScheduled({
    pixKey: data.pixKey,
    amount: data.amount,
    scheduleType: data.scheduleType,
    externalReference,
    scheduledDate: data.scheduledDate,
    cronExpression,
    balanceThreshold: data.triggerBalanceThreshold,
    description: data.description,
  });

  const gpData = gpResult as Record<string, unknown>;
  const gpScheduledId = (gpData.id ?? gpData.scheduledId) as string;

  if (!gpScheduledId) {
    logger.error({ userId, gpData }, 'Goat Pay returned no scheduled transfer ID');
    throw new AppError('Scheduled transfer created but no ID returned by provider', 502, 'GOATPAY_NO_ID');
  }

  // Create local record
  const scheduledId = uuidv4();
  const { data: scheduled, error: schedError } = await supabase
    .from('transfers_scheduled')
    .insert({
      id: scheduledId,
      user_id: userId,
      subaccount_id: subaccount.id,
      goatpay_scheduled_id: gpScheduledId,
      external_reference: externalReference,
      amount: data.amount,
      pix_key: data.pixKey,
      schedule_type: data.scheduleType,
      cron_expression: cronExpression ?? null,
      balance_threshold: data.triggerBalanceThreshold ?? null,
      next_execution: data.scheduledDate ?? gpData.nextExecution as string | null,
      status: 'active',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .select('*')
    .single();

  if (schedError || !scheduled) {
    logger.error({ error: schedError, userId, gpScheduledId }, 'Failed to create local scheduled transfer');
    throw new AppError('Scheduled transfer created at provider but failed to save locally', 500, 'SCHEDULED_SAVE_FAILED');
  }

  logger.info({ userId, scheduledId, gpScheduledId, scheduleType: data.scheduleType }, 'Scheduled transfer created');

  return {
    id: scheduledId,
    goatpayScheduledId: gpScheduledId,
    externalReference,
    amount: data.amount,
    pixKey: data.pixKey,
    scheduleType: data.scheduleType,
    status: 'active',
    nextExecution: (scheduled as Record<string, unknown>).next_execution as string | null,
    createdAt: (scheduled as Record<string, unknown>).created_at as string,
  };
}

/**
 * List scheduled transfers for a user.
 */
export async function listScheduledTransfers(
  userId: string,
  filters: { page: number; pageSize: number },
): Promise<ScheduledListResult> {
  const query = supabase
    .from('transfers_scheduled')
    .select('*', { count: 'exact' })
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .range(
      (filters.page - 1) * filters.pageSize,
      (filters.page - 1) * filters.pageSize + filters.pageSize - 1,
    );

  const { data, error, count } = await query;

  if (error) {
    logger.error({ error, userId }, 'Failed to list scheduled transfers');
    throw new AppError('Failed to list scheduled transfers', 500, 'SCHEDULED_LIST_FAILED');
  }

  const scheduled: ScheduledTransferListItem[] = (data ?? []).map(
    (row: Record<string, unknown>) => ({
      id: row.id as string,
      goatpayScheduledId: row.goatpay_scheduled_id as string,
      externalReference: row.external_reference as string,
      amount: row.amount as number,
      pixKey: row.pix_key as string,
      scheduleType: row.schedule_type as string,
      cronExpression: row.cron_expression as string | null,
      balanceThreshold: row.balance_threshold as number | null,
      nextExecution: row.next_execution as string | null,
      status: row.status as string,
      createdAt: row.created_at as string,
    }),
  );

  const total = count ?? 0;
  const totalPages = Math.ceil(total / filters.pageSize);

  return { scheduled, total, totalPages };
}

/**
 * Delete a scheduled transfer.
 */
export async function deleteScheduledTransfer(
  userId: string,
  scheduledId: string,
): Promise<void> {
  // Find local record
  const { data: scheduled, error } = await supabase
    .from('transfers_scheduled')
    .select('*')
    .eq('id', scheduledId)
    .eq('user_id', userId)
    .single();

  if (error || !scheduled) {
    throw new AppError('Scheduled transfer not found', 404, 'SCHEDULED_NOT_FOUND');
  }

  const sched = scheduled as Record<string, unknown>;

  // Call Goat Pay to delete
  await goatPayClient.deleteTransferScheduled(sched.goatpay_scheduled_id as string);

  // Delete local record
  await supabase
    .from('transfers_scheduled')
    .delete()
    .eq('id', scheduledId);

  logger.info({ userId, scheduledId }, 'Scheduled transfer deleted');
}

/**
 * Process an inbound Goat Pay webhook event for transfers.
 * Called by the webhook handler — not exposed via HTTP.
 */
export async function processTransferWebhook(
  eventData: Record<string, unknown>,
): Promise<void> {
  const eventType = eventData.event as string;
  const data = eventData.data as Record<string, unknown> | undefined;
  if (!data) {
    logger.warn({ eventData }, 'Transfer webhook missing data payload');
    return;
  }

  const externalReference = data.externalReference as string | undefined;
  if (!externalReference) {
    logger.warn({ data }, 'Transfer webhook missing externalReference');
    return;
  }

  // Find the local transaction by externalReference
  const { data: transaction } = await supabase
    .from('transactions')
    .select('*')
    .eq('external_reference', externalReference)
    .maybeSingle();

  if (!transaction) {
    logger.warn({ externalReference, eventType }, 'Transfer webhook: transaction not found locally');
    return;
  }

  const tx = transaction as Record<string, unknown>;
  const currentStatus = tx.status as TransactionStatus;

  let newStatus: TransactionStatus | null = null;

  switch (eventType) {
    case 'transfer.created':
      newStatus = TransactionStatus.PENDING;
      break;
    case 'transfer.completed':
      newStatus = TransactionStatus.COMPLETED;
      break;
    case 'transfer.failed':
      newStatus = TransactionStatus.FAILED;
      break;
    case 'transfer.internal.completed':
      newStatus = TransactionStatus.COMPLETED;
      break;
    case 'transfer.internal.received':
      // This is the recipient's perspective — we handle via payment webhooks
      // or a separate lookup. For now, mark the sender's side.
      newStatus = TransactionStatus.COMPLETED;
      break;
    default:
      logger.info({ eventType }, 'Ignoring unhandled transfer webhook event');
      return;
  }

  if (newStatus && newStatus !== currentStatus) {
    const updateFields: Record<string, unknown> = {
      status: newStatus,
      updated_at: new Date().toISOString(),
    };

    if (newStatus === TransactionStatus.COMPLETED) {
      updateFields.completed_at = new Date().toISOString();
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
      'Transfer transaction updated via webhook',
    );
  }
}
