import { z } from 'zod';

// ============================================================
// Wallet Validators
// ============================================================

/**
 * POST /wallet/sync — no body params needed; uses authenticated user's subaccount.
 */
export const syncBalanceSchema = z.object({});

export type SyncBalanceInput = z.infer<typeof syncBalanceSchema>;

/**
 * POST /wallet/lock
 */
export const setLockSchema = z.object({
  lockType: z.enum(['full', 'withdraw_only', 'deposit_only']),
});

export type SetLockInput = z.infer<typeof setLockSchema>;

/**
 * POST /wallet/limits
 */
export const setLimitsSchema = z.object({
  dailyLimit: z.number().int().min(0).optional(),
  monthlyLimit: z.number().int().min(0).optional(),
  transactionLimit: z.number().int().min(0).optional(),
}).refine(
  (data) => data.dailyLimit !== undefined || data.monthlyLimit !== undefined || data.transactionLimit !== undefined,
  { message: 'At least one limit field is required' },
);

export type SetLimitsInput = z.infer<typeof setLimitsSchema>;

/**
 * GET /wallet/details — no params
 */
export const getWalletDetailsSchema = z.object({});

export type GetWalletDetailsInput = z.infer<typeof getWalletDetailsSchema>;

/**
 * GET /wallet/transactions — query params
 */
export const listTransactionsQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(100).default(20),
  status: z.string().optional(),
  type: z.string().optional(),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
});

export type ListTransactionsQuery = z.infer<typeof listTransactionsQuerySchema>;
