import { z } from 'zod';

// ============================================================
// Refunds Validators
// ============================================================

/**
 * POST /refunds — create a refund for a completed PIX payment
 */
export const createRefundSchema = z.object({
  transactionId: z.string().uuid('Invalid transaction ID'),
  reason: z.string().max(1000).optional(),
});

export type CreateRefundInput = z.infer<typeof createRefundSchema>;

/**
 * GET /refunds — list refunds (query params)
 */
export const listRefundsQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(100).default(20),
  status: z.string().optional(),
});

export type ListRefundsQuery = z.infer<typeof listRefundsQuerySchema>;

/**
 * GET /refunds/:id — param validation
 */
export const refundIdParamSchema = z.object({
  id: z.string().uuid('Invalid refund ID'),
});

export type RefundIdParam = z.infer<typeof refundIdParamSchema>;
