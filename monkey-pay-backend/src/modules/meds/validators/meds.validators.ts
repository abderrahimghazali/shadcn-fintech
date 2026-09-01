import { z } from 'zod';

// ============================================================
// Schemas
// ============================================================

export const listMedsSchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(100).default(20),
  status: z.string().optional(),
});

export const getMedSchema = z.object({
  id: z.string().min(1, 'MED ID is required'),
});

export const sendEvidenceSchema = z.object({
  id: z.string().min(1, 'MED ID is required'),
  evidenceText: z.string().min(10, 'Evidence must be at least 10 characters'),
});
