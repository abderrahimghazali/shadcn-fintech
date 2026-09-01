import { z } from 'zod';

// ============================================================
// Payments Validators
// ============================================================

/**
 * POST /payments — create a PIX payment (receive money)
 *
 * amount: integer in reais-cents (R$10,00 = 1000)
 * coverFee: when true, amount is what the user receives (gross);
 *            Goat Pay will compute the fee on top.
 * subaccountMode: if true, the payment is created under the user's subaccount.
 */
export const createPaymentSchema = z.object({
  amount: z.number().int().min(1, 'Amount must be at least 1 cent'),
  description: z.string().max(500).optional(),
  externalReference: z.string().max(255).optional(),
  coverFee: z.boolean().default(false),
  subaccountMode: z.boolean().default(true),
});

export type CreatePaymentInput = z.infer<typeof createPaymentSchema>;

/**
 * GET /payments — list payments (query params)
 */
export const listPaymentsQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(100).default(20),
  status: z.string().optional(),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
});

export type ListPaymentsQuery = z.infer<typeof listPaymentsQuerySchema>;

/**
 * GET /payments/:id/status — param validation
 */
export const paymentIdParamSchema = z.object({
  id: z.string().uuid('Invalid payment ID'),
});

export type PaymentIdParam = z.infer<typeof paymentIdParamSchema>;
