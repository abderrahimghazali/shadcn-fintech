import { z } from 'zod';

// ============================================================
// All 23 Goat Pay event types
// ============================================================

export const WEBHOOK_EVENT_TYPES = [
  'payment.created',
  'payment.paid',
  'payment.failed',
  'payment.pix.expired',
  'payment.refunded',
  'refund.requested',
  'refund.completed',
  'refund.failed',
  'transfer.created',
  'transfer.completed',
  'transfer.failed',
  'transfer.internal.completed',
  'transfer.internal.received',
  'med.created',
  'med.evidence_sent',
  'med.updated',
  'payment_link.paid',
  'invoice.created',
  'invoice.processing',
  'invoice.issued',
  'invoice.failed',
  'invoice.cancelled',
  'webhook.test',
] as const;

export type WebhookEventType = (typeof WEBHOOK_EVENT_TYPES)[number];

// ============================================================
// Schemas
// ============================================================

export const createWebhookSchema = z.object({
  url: z.string().url('Must be a valid URL').refine(
    (u) => u.startsWith('https://'),
    'Webhook URL must use HTTPS',
  ),
  events: z.array(z.enum(WEBHOOK_EVENT_TYPES)).min(1, 'At least one event is required'),
  secret: z.string().optional(), // auto-generated if not provided
});

export const updateWebhookSchema = z.object({
  url: z.string().url().refine(
    (u) => u.startsWith('https://'),
    'Webhook URL must use HTTPS',
  ).optional(),
  events: z.array(z.enum(WEBHOOK_EVENT_TYPES)).min(1).optional(),
  active: z.boolean().optional(),
});

export const listWebhooksSchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(100).default(20),
});

export const webhookIdParamSchema = z.object({
  id: z.string().uuid('Invalid webhook endpoint ID'),
});
