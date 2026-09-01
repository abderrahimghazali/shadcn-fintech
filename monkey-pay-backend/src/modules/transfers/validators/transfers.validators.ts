import { z } from 'zod';

// ============================================================
// Transfers Validators
// ============================================================

/**
 * POST /transfers — create an external PIX transfer (send money)
 *
 * amount: integer in reais-cents (R$10,00 = 1000)
 * coverFee: when true, amount is what the destination receives;
 *            the sender pays the fee on top.
 */
export const createTransferSchema = z.object({
  amount: z.number().int().min(1, 'Amount must be at least 1 cent'),
  pixKey: z.string().min(1, 'PIX key is required').max(255),
  pixKeyType: z.enum(['cpf', 'cnpj', 'email', 'phone', 'random']),
  description: z.string().max(500).optional(),
  externalReference: z.string().max(255).optional(),
  coverFee: z.boolean().default(false),
});

export type CreateTransferInput = z.infer<typeof createTransferSchema>;

/**
 * POST /transfers/internal — internal transfer between Goat Pay accounts
 */
export const createInternalTransferSchema = z.object({
  amount: z.number().int().min(1, 'Amount must be at least 1 cent'),
  recipientEmail: z.string().email('Invalid recipient email'),
  description: z.string().max(500).optional(),
  externalReference: z.string().max(255).optional(),
});

export type CreateInternalTransferInput = z.infer<typeof createInternalTransferSchema>;

/**
 * GET /transfers — list transfers (query params)
 */
export const listTransfersQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(100).default(20),
  status: z.string().optional(),
  type: z.string().optional(),
});

export type ListTransfersQuery = z.infer<typeof listTransfersQuerySchema>;

/**
 * POST /transfers/scheduled — schedule a transfer
 */
export const createScheduledTransferSchema = z.object({
  amount: z.number().int().min(1, 'Amount must be at least 1 cent'),
  pixKey: z.string().min(1, 'PIX key is required').max(255),
  pixKeyType: z.enum(['cpf', 'cnpj', 'email', 'phone', 'random']),
  scheduleType: z.enum(['once', 'recurring', 'balance_trigger']),
  scheduledDate: z.string().optional(),
  recurrence: z.enum(['daily', 'weekly', 'monthly']).optional(),
  triggerBalanceThreshold: z.number().int().min(0).optional(),
  description: z.string().max(500).optional(),
}).refine(
  (data) => {
    if (data.scheduleType === 'once') return data.scheduledDate !== undefined;
    if (data.scheduleType === 'recurring') return data.recurrence !== undefined;
    if (data.scheduleType === 'balance_trigger') return data.triggerBalanceThreshold !== undefined;
    return true;
  },
  {
    message: 'Missing required field for the selected scheduleType',
    path: ['scheduleType'],
  },
);

export type CreateScheduledTransferInput = z.infer<typeof createScheduledTransferSchema>;

/**
 * GET /transfers/scheduled — list scheduled transfers (query)
 */
export const listScheduledQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(100).default(20),
});

export type ListScheduledQuery = z.infer<typeof listScheduledQuerySchema>;

/**
 * DELETE /transfers/scheduled/:id — param validation
 */
export const deleteScheduledParamSchema = z.object({
  id: z.string().uuid('Invalid scheduled transfer ID'),
});

export type DeleteScheduledParam = z.infer<typeof deleteScheduledParamSchema>;

/**
 * GET /transfers/:id/status — param validation
 */
export const transferIdParamSchema = z.object({
  id: z.string().uuid('Invalid transfer ID'),
});

export type TransferIdParam = z.infer<typeof transferIdParamSchema>;
