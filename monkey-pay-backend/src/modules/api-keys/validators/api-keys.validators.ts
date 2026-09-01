import { z } from 'zod';

// ============================================================
// API Key Scopes
// ============================================================

export const API_KEY_SCOPES = [
  'payments:read',
  'payments:write',
  'transfers:read',
  'transfers:write',
  'refunds:read',
  'refunds:write',
  'wallet:read',
  'customers:read',
  'webhooks:read',
  'webhooks:write',
] as const;

export type ApiKeyScope = (typeof API_KEY_SCOPES)[number];

// ============================================================
// Schemas
// ============================================================

export const createApiKeySchema = z.object({
  name: z.string().min(3, 'Name must be at least 3 characters'),
  scopes: z.array(z.enum(API_KEY_SCOPES)).min(1, 'At least one scope is required'),
});

export const listApiKeysSchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(100).default(20),
});

export const updateApiKeySchema = z.object({
  name: z.string().min(3).optional(),
  active: z.boolean().optional(),
});

export const rotateApiKeySchema = z.object({
  confirm: z.literal(true, {
    errorMap: () => ({ message: 'You must pass { "confirm": true } to rotate an API key' }),
  }),
});

export const apiKeyIdParamSchema = z.object({
  id: z.string().uuid('Invalid API key ID'),
});
