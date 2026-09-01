import { v4 as uuidv4 } from 'uuid';

import { supabase } from '../../config/supabase.js';
import goatPayClient from '../../lib/goatPayClient.js';
import logger from '../../utils/logger.js';
import { AppError, type Subaccount, type Transaction } from '../../types/index.js';

// ============================================================
// Types
// ============================================================

export interface BalanceResponse {
  availablePadrao: number;
  pendingPadrao: number;
  lockedPadrao: number;
  spendablePadrao: number;
}

export interface WalletDetails {
  subaccount: {
    id: string;
    goatpaySubaccountId: string;
    lockStatus: string;
    dailyLimit: number | null;
    monthlyLimit: number | null;
    transactionLimit: number | null;
    isActive: boolean;
    createdAt: string;
  };
  balance: BalanceResponse;
}

export interface TransactionHistoryItem {
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

export interface TransactionHistoryResult {
  transactions: TransactionHistoryItem[];
  total: number;
  totalPages: number;
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

// ============================================================
// Service methods
// ============================================================

/**
 * Get the user's subaccount balance from Goat Pay.
 */
export async function getBalance(userId: string): Promise<BalanceResponse> {
  const subaccount = await getActiveSubaccount(userId);

  const balance = await goatPayClient.getSubaccountBalance(
    subaccount.goatpay_subaccount_id,
  );

  return balance as BalanceResponse;
}

/**
 * Sync the user's balance from Goat Pay and cache it locally.
 */
export async function syncBalance(userId: string): Promise<BalanceResponse> {
  const subaccount = await getActiveSubaccount(userId);

  const balance = await goatPayClient.getSubaccountBalance(
    subaccount.goatpay_subaccount_id,
  );

  // Cache balance fields in subaccounts table for fast reads
  const balanceData = balance as BalanceResponse;

  await supabase
    .from('subaccounts')
    .update({
      daily_limit: balanceData.spendablePadrao, // reuse field as cached available balance
      updated_at: new Date().toISOString(),
    })
    .eq('id', subaccount.id);

  logger.info({ userId, subaccountId: subaccount.id }, 'Balance synced');

  return balanceData;
}

/**
 * Get full wallet details: subaccount info + live balance.
 */
export async function getWalletDetails(userId: string): Promise<WalletDetails> {
  const subaccount = await getActiveSubaccount(userId);

  let balance: BalanceResponse;
  try {
    balance = (await goatPayClient.getSubaccountBalance(
      subaccount.goatpay_subaccount_id,
    )) as BalanceResponse;
  } catch (err) {
    logger.warn({ err, userId }, 'Failed to fetch live balance, returning zeroed');
    balance = {
      availablePadrao: 0,
      pendingPadrao: 0,
      lockedPadrao: 0,
      spendablePadrao: 0,
    };
  }

  return {
    subaccount: {
      id: subaccount.id,
      goatpaySubaccountId: subaccount.goatpay_subaccount_id,
      lockStatus: subaccount.lock_status,
      dailyLimit: subaccount.daily_limit,
      monthlyLimit: subaccount.monthly_limit,
      transactionLimit: subaccount.transaction_limit,
      isActive: subaccount.is_active,
      createdAt: subaccount.created_at,
    },
    balance,
  };
}

/**
 * Lock (or change lock type on) a user's subaccount.
 */
export async function lockWallet(
  userId: string,
  lockType: 'full' | 'withdraw_only' | 'deposit_only',
): Promise<void> {
  const subaccount = await getActiveSubaccount(userId);

  await goatPayClient.lockSubaccount({
    subaccountId: subaccount.goatpay_subaccount_id,
    lockType,
  });

  // Update local record
  await supabase
    .from('subaccounts')
    .update({
      lock_status: lockType,
      updated_at: new Date().toISOString(),
    })
    .eq('id', subaccount.id);

  // Audit log
  await supabase.from('audit_logs').insert({
    id: uuidv4(),
    user_id: userId,
    action: 'lock_wallet',
    resource_type: 'subaccount',
    resource_id: subaccount.id,
    details: { lockType, previousStatus: subaccount.lock_status },
    ip_address: null,
    user_agent: null,
    created_at: new Date().toISOString(),
  });

  logger.info({ userId, subaccountId: subaccount.id, lockType }, 'Wallet locked');
}

/**
 * Set operational limits on a user's subaccount.
 */
export async function setLimits(
  userId: string,
  limits: {
    dailyLimit?: number;
    monthlyLimit?: number;
    transactionLimit?: number;
  },
): Promise<void> {
  const subaccount = await getActiveSubaccount(userId);

  await goatPayClient.setSubaccountLimits({
    subaccountId: subaccount.goatpay_subaccount_id,
    ...limits,
  });

  // Update local record
  await supabase
    .from('subaccounts')
    .update({
      daily_limit: limits.dailyLimit ?? subaccount.daily_limit,
      monthly_limit: limits.monthlyLimit ?? subaccount.monthly_limit,
      transaction_limit: limits.transactionLimit ?? subaccount.transaction_limit,
      updated_at: new Date().toISOString(),
    })
    .eq('id', subaccount.id);

  // Audit log
  await supabase.from('audit_logs').insert({
    id: uuidv4(),
    user_id: userId,
    action: 'set_wallet_limits',
    resource_type: 'subaccount',
    resource_id: subaccount.id,
    details: { limits, previous: { dailyLimit: subaccount.daily_limit, monthlyLimit: subaccount.monthly_limit, transactionLimit: subaccount.transaction_limit } },
    ip_address: null,
    user_agent: null,
    created_at: new Date().toISOString(),
  });

  logger.info({ userId, subaccountId: subaccount.id, limits }, 'Wallet limits set');
}

/**
 * Get the user's transaction history (paginated) from the local transactions table.
 */
export async function getTransactionHistory(
  userId: string,
  filters: {
    page: number;
    pageSize: number;
    status?: string;
    type?: string;
    startDate?: string;
    endDate?: string;
  },
): Promise<TransactionHistoryResult> {
  let query = supabase
    .from('transactions')
    .select('*', { count: 'exact' })
    .eq('user_id', userId)
    .order('created_at', { ascending: false });

  if (filters.status) {
    query = query.eq('status', filters.status);
  }
  if (filters.type) {
    query = query.eq('type', filters.type);
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
    logger.error({ error, userId }, 'Failed to fetch transaction history');
    throw new AppError('Failed to fetch transaction history', 500, 'TRANSACTION_HISTORY_FAILED');
  }

  const transactions: TransactionHistoryItem[] = (data ?? []).map(
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

  return { transactions, total, totalPages };
}
