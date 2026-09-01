import { supabase } from '../../config/supabase.js';
import logger from '../../utils/logger.js';
import { AppError, TransactionStatus, TransactionType } from '../../types/index.js';

// ============================================================
// Types
// ============================================================

export type ReportPeriod = '7d' | '30d' | '90d' | '12m';

export interface DashboardStats {
  totalBalance: number;
  todayVolume: number;
  monthVolume: number;
  pendingTransactions: number;
  activeApiKeys: number;
}

export interface VolumeDataPoint {
  period: string;
  volume: number;
  count: number;
  fees: number;
}

export interface VolumeReport {
  period: ReportPeriod;
  data: VolumeDataPoint[];
  totalVolume: number;
  totalFees: number;
}

export interface RevenueReport {
  period: ReportPeriod;
  data: VolumeDataPoint[];
  totalRevenue: number;
}

export interface TransactionReportRow {
  id: string;
  type: string;
  status: string;
  amount: number;
  fee: number;
  netAmount: number;
  description: string | null;
  pixKey: string | null;
  createdAt: string;
  completedAt: string | null;
}

export interface TransactionReportResult {
  transactions: TransactionReportRow[];
  total: number;
  totalPages: number;
}

// ============================================================
// Helpers
// ============================================================

/**
 * Calculate the start date for a given period.
 */
function getStartDate(period: ReportPeriod): string {
  const now = new Date();
  const start = new Date();

  switch (period) {
    case '7d':
      start.setDate(now.getDate() - 7);
      break;
    case '30d':
      start.setDate(now.getDate() - 30);
      break;
    case '90d':
      start.setDate(now.getDate() - 90);
      break;
    case '12m':
      start.setFullYear(now.getFullYear() - 1);
      break;
  }

  return start.toISOString();
}

/**
 * Determine the date truncation format for grouping.
 */
function getDateTrunc(period: ReportPeriod): string {
  switch (period) {
    case '7d':
      return 'day';
    case '30d':
      return 'day';
    case '90d':
      return 'week';
    case '12m':
      return 'month';
  }
}

// ============================================================
// Service methods
// ============================================================

/**
 * Get dashboard stats for a user.
 * - Total balance (from subaccounts table or latest completed transaction)
 * - Today's volume (sum completed pix_in today)
 * - Month volume (sum completed pix_in this month)
 * - Pending transactions count
 * - Active API keys count
 *
 * All queries hit local Supabase transactions table, not Goat Pay directly.
 */
export async function getDashboardStats(userId: string): Promise<DashboardStats> {
  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();

  // Total balance: sum of completed pix_in minus sum of completed pix_out/transfer/failed
  const { data: balanceRows } = await supabase
    .from('transactions')
    .select('type, status, amount, fee')
    .eq('user_id', userId)
    .eq('status', TransactionStatus.COMPLETED);

  let totalBalance = 0;
  for (const row of balanceRows ?? []) {
    const r = row as Record<string, unknown>;
    const amount = r.amount as number;
    const fee = r.fee as number;
    const type = r.type as string;

    if (type === TransactionType.PIX_IN || type === TransactionType.TRANSFER_INTERNAL) {
      totalBalance += amount - fee;
    } else {
      totalBalance -= amount + fee;
    }
  }

  // Today's volume: sum of completed pix_in today
  const { data: todayRows } = await supabase
    .from('transactions')
    .select('amount')
    .eq('user_id', userId)
    .eq('type', TransactionType.PIX_IN)
    .eq('status', TransactionStatus.COMPLETED)
    .gte('completed_at', todayStart);

  const todayVolume = (todayRows ?? []).reduce(
    (sum, row) => sum + ((row as Record<string, unknown>).amount as number),
    0,
  );

  // Month volume
  const { data: monthRows } = await supabase
    .from('transactions')
    .select('amount')
    .eq('user_id', userId)
    .eq('type', TransactionType.PIX_IN)
    .eq('status', TransactionStatus.COMPLETED)
    .gte('completed_at', monthStart);

  const monthVolume = (monthRows ?? []).reduce(
    (sum, row) => sum + ((row as Record<string, unknown>).amount as number),
    0,
  );

  // Pending transactions count
  const { count: pendingCount } = await supabase
    .from('transactions')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .in('status', [TransactionStatus.PENDING, TransactionStatus.PROCESSING]);

  // Active API keys count
  const { count: activeKeys } = await supabase
    .from('api_keys')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .eq('is_active', true);

  return {
    totalBalance,
    todayVolume,
    monthVolume,
    pendingTransactions: pendingCount ?? 0,
    activeApiKeys: activeKeys ?? 0,
  };
}

/**
 * Get volume report grouped by day/week/month.
 * All queries hit local Supabase transactions table.
 */
export async function getVolumeReport(
  userId: string,
  period: ReportPeriod,
): Promise<VolumeReport> {
  const startDate = getStartDate(period);

  const { data, error } = await supabase
    .from('transactions')
    .select('amount, fee, created_at, status, type')
    .eq('user_id', userId)
    .eq('status', TransactionStatus.COMPLETED)
    .gte('created_at', startDate)
    .order('created_at', { ascending: true });

  if (error) {
    logger.error({ error, userId }, 'Failed to generate volume report');
    throw new AppError('Failed to generate volume report', 500, 'VOLUME_REPORT_FAILED');
  }

  // Group by period
  const groups = new Map<string, { volume: number; count: number; fees: number }>();

  for (const row of data ?? []) {
    const r = row as Record<string, unknown>;
    const date = new Date(r.created_at as string);
    let periodKey: string;

    switch (getDateTrunc(period)) {
      case 'day':
        periodKey = date.toISOString().slice(0, 10); // YYYY-MM-DD
        break;
      case 'week': {
        // Get ISO week start (Monday)
        const d = new Date(date);
        const day = d.getDay();
        const diff = d.getDate() - day + (day === 0 ? -6 : 1);
        const monday = new Date(d.setDate(diff));
        periodKey = monday.toISOString().slice(0, 10);
        break;
      }
      case 'month':
        periodKey = date.toISOString().slice(0, 7); // YYYY-MM
        break;
    }

    const existing = groups.get(periodKey) ?? { volume: 0, count: 0, fees: 0 };
    existing.volume += r.amount as number;
    existing.fees += r.fee as number;
    existing.count += 1;
    groups.set(periodKey, existing);
  }

  const dataPoints: VolumeDataPoint[] = Array.from(groups.entries()).map(
    ([period, agg]) => ({
      period,
      volume: agg.volume,
      count: agg.count,
      fees: agg.fees,
    }),
  );

  const totalVolume = dataPoints.reduce((sum, dp) => sum + dp.volume, 0);
  const totalFees = dataPoints.reduce((sum, dp) => sum + dp.fees, 0);

  return { period, data: dataPoints, totalVolume, totalFees };
}

/**
 * Get revenue report — sum of fee income from subaccount pricing.
 * Looks at SUBACCOUNT_PROFIT transactions.
 */
export async function getRevenueReport(
  userId: string,
  period: ReportPeriod,
): Promise<RevenueReport> {
  const startDate = getStartDate(period);

  const { data, error } = await supabase
    .from('transactions')
    .select('amount, fee, created_at, status')
    .eq('user_id', userId)
    .eq('type', TransactionType.SUBACCOUNT_PROFIT)
    .eq('status', TransactionStatus.COMPLETED)
    .gte('created_at', startDate)
    .order('created_at', { ascending: true });

  if (error) {
    logger.error({ error, userId }, 'Failed to generate revenue report');
    throw new AppError('Failed to generate revenue report', 500, 'REVENUE_REPORT_FAILED');
  }

  // Group by period
  const groups = new Map<string, { revenue: number; count: number }>();

  for (const row of data ?? []) {
    const r = row as Record<string, unknown>;
    const date = new Date(r.created_at as string);
    let periodKey: string;

    switch (getDateTrunc(period)) {
      case 'day':
        periodKey = date.toISOString().slice(0, 10);
        break;
      case 'week': {
        const d = new Date(date);
        const day = d.getDay();
        const diff = d.getDate() - day + (day === 0 ? -6 : 1);
        const monday = new Date(d.setDate(diff));
        periodKey = monday.toISOString().slice(0, 10);
        break;
      }
      case 'month':
        periodKey = date.toISOString().slice(0, 7);
        break;
    }

    const existing = groups.get(periodKey) ?? { revenue: 0, count: 0 };
    existing.revenue += r.fee as number;
    existing.count += 1;
    groups.set(periodKey, existing);
  }

  const dataPoints: VolumeDataPoint[] = Array.from(groups.entries()).map(
    ([period, agg]) => ({
      period,
      volume: 0,
      count: agg.count,
      fees: agg.revenue,
    }),
  );

  const totalRevenue = dataPoints.reduce((sum, dp) => sum + dp.fees, 0);

  return { period, data: dataPoints, totalRevenue };
}

/**
 * Get detailed transaction report with export-ready format.
 */
export async function getTransactionReport(
  userId: string,
  filters: {
    page: number;
    pageSize: number;
    type?: string;
    status?: string;
    startDate?: string;
    endDate?: string;
  },
): Promise<TransactionReportResult> {
  let query = supabase
    .from('transactions')
    .select('id, type, status, amount, fee, net_amount, description, pix_key, created_at, completed_at', { count: 'exact' })
    .eq('user_id', userId)
    .order('created_at', { ascending: false });

  if (filters.type) query = query.eq('type', filters.type);
  if (filters.status) query = query.eq('status', filters.status);
  if (filters.startDate) query = query.gte('created_at', filters.startDate);
  if (filters.endDate) query = query.lte('created_at', filters.endDate);

  const offset = (filters.page - 1) * filters.pageSize;
  query = query.range(offset, offset + filters.pageSize - 1);

  const { data, error, count } = await query;

  if (error) {
    logger.error({ error, userId }, 'Failed to generate transaction report');
    throw new AppError('Failed to generate transaction report', 500, 'TRANSACTION_REPORT_FAILED');
  }

  const transactions: TransactionReportRow[] = (data ?? []).map(
    (row: Record<string, unknown>) => ({
      id: row.id as string,
      type: row.type as string,
      status: row.status as string,
      amount: row.amount as number,
      fee: row.fee as number,
      netAmount: row.net_amount as number,
      description: row.description as string | null,
      pixKey: row.pix_key as string | null,
      createdAt: row.created_at as string,
      completedAt: row.completed_at as string | null,
    }),
  );

  const total = count ?? 0;
  const totalPages = Math.ceil(total / filters.pageSize);

  return { transactions, total, totalPages };
}
