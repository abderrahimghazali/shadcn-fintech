import { z } from 'zod';

// ============================================================
// Schemas
// ============================================================

export const listSubaccountsSchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(100).default(20),
  status: z.enum(['active', 'inactive']).optional(),
});

export const setPricingSchema = z.object({
  pixInFeePercentage: z.number().min(0).max(100),
  pixOutFeePercentage: z.number().min(0).max(100),
});

export const subaccountIdParamSchema = z.object({
  id: z.string().min(1, 'Subaccount ID is required'),
});
