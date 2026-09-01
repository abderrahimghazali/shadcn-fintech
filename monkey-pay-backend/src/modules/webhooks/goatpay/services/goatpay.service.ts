import { v4 as uuidv4 } from 'uuid';

import { supabase } from '../../../config/supabase.js';
import { env } from '../../../config/env.js';
import { verifyGoatPayWebhookSignature } from '../../../lib/goatPayWebhookVerifier.js';
import logger from '../../../utils/logger.js';
import { AppError } from '../../../types/index.js';
import * as paymentsService from '../../payments/services/payments.service.js';
import * as refundsService from '../../refunds/services/refunds.service.js';
import * as transfersService from '../../transfers/services/transfers.service.js';

// ============================================================
// Types
// ============================================================

export interface GoatPayWebhookEvent {
  id: string;
  event: string;
  data: Record<string, unknown>;
  createdAt?: string;
}

export interface WebhookEventListItem {
  id: string;
  deliveryId: string;
  eventType: string;
  processed: boolean;
  createdAt: string;
}

export interface WebhookEventListResult {
  events: WebhookEventListItem[];
  total: number;
  totalPages: number;
}

// ============================================================
// Event type classification
// ============================================================

const PAYMENT_EVENTS = new Set([
  'payment.created',
  'payment.paid',
  'payment.failed',
  'payment.pix.expired',
  'payment.refunded',
]);

const REFUND_EVENTS = new Set([
  'refund.requested',
  'refund.completed',
  'refund.failed',
]);

const TRANSFER_EVENTS = new Set([
  'transfer.created',
  'transfer.completed',
  'transfer.failed',
  'transfer.internal.completed',
  'transfer.internal.received',
]);

// ============================================================
// Service methods
// ============================================================

/**
 * Process an inbound Goat Pay webhook event.
 * 1. Verify HMAC-SHA256 signature
 * 2. Parse event type and data
 * 3. Check idempotency (by event delivery id) — if duplicate, return without processing
 * 4. Store in goatpay_webhook_events table
 * 5. Dispatch to correct handler
 * 6. After processing, trigger outbound webhooks to merchants if applicable
 */
export async function processWebhookEvent(
  rawBody: string,
  signature: string | undefined,
  deliveryId?: string,
): Promise<void> {
  // 1. Verify signature
  verifyGoatPayWebhookSignature(rawBody, signature, env.GOATPAY_WEBHOOK_SECRET);

  // 2. Parse event
  const parsed = JSON.parse(rawBody) as GoatPayWebhookEvent;
  const eventType = parsed.event;
  const eventData = parsed.data ?? parsed;

  // Build full event object for handlers
  const fullEvent: Record<string, unknown> = {
    ...parsed,
    data: eventData,
  };

  logger.info({ eventType, deliveryId: deliveryId ?? parsed.id }, 'Processing Goat Pay webhook event');

  // 3. Check idempotency by delivery ID (the outer `id` from Goat Pay, not `data.id`)
  const eventDeliveryId = deliveryId ?? parsed.id;
  if (eventDeliveryId) {
    const { data: existing } = await supabase
      .from('goatpay_webhook_events')
      .select('id, processed')
      .eq('delivery_id', eventDeliveryId)
      .maybeSingle();

    if (existing) {
      logger.info({ eventDeliveryId, eventType }, 'Duplicate webhook delivery — skipping');
      return;
    }
  }

  // 4. Store in goatpay_webhook_events table
  const eventId = uuidv4();
  const now = new Date().toISOString();

  await supabase.from('goatpay_webhook_events').insert({
    id: eventId,
    delivery_id: eventDeliveryId ?? uuidv4(),
    event_type: eventType,
    payload: parsed,
    processed: false,
    created_at: now,
  });

  // 5. Dispatch to correct handler
  try {
    if (PAYMENT_EVENTS.has(eventType)) {
      await paymentsService.processPaymentWebhook(fullEvent);
    } else if (REFUND_EVENTS.has(eventType)) {
      await refundsService.processRefundWebhook(fullEvent);
    } else if (TRANSFER_EVENTS.has(eventType)) {
      await transfersService.processTransferWebhook(fullEvent);
    } else {
      logger.info({ eventType }, 'No handler for this webhook event type — ignoring');
    }

    // Mark as processed
    await supabase
      .from('goatpay_webhook_events')
      .update({ processed: true })
      .eq('id', eventId);
  } catch (err) {
    logger.error({ err, eventId, eventType }, 'Webhook event handler failed');
    // Don't throw — we already returned 200 to Goat Pay
  }

  // 6. Trigger outbound webhooks to merchants if applicable
  try {
    // Find the user associated with this event (via externalReference)
    const dataRecord = eventData as Record<string, unknown>;
    const externalReference = dataRecord.externalReference as string | undefined;

    if (externalReference) {
      // Extract userId from externalReference format: {prefix}_{userId}_{uuid}
      const parts = externalReference.split('_');
      if (parts.length >= 3) {
        const userId = parts[1];
        // Import dynamically to avoid circular deps
        const { triggerMerchantWebhooks } = await import(
          '../outbound/services/webhooks.service.js'
        );
        await triggerMerchantWebhooks(userId, eventType, eventData);
      }
    }
  } catch (err) {
    logger.error({ err, eventType }, 'Failed to trigger outbound merchant webhooks');
  }
}

/**
 * List webhook events (admin).
 */
export async function getWebhookEvents(
  filters: {
    page: number;
    pageSize: number;
    eventType?: string;
    processed?: boolean;
  },
): Promise<WebhookEventListResult> {
  let query = supabase
    .from('goatpay_webhook_events')
    .select('id, delivery_id, event_type, processed, created_at', { count: 'exact' })
    .order('created_at', { ascending: false });

  if (filters.eventType) {
    query = query.eq('event_type', filters.eventType);
  }
  if (filters.processed !== undefined) {
    query = query.eq('processed', filters.processed);
  }

  const offset = (filters.page - 1) * filters.pageSize;
  query = query.range(offset, offset + filters.pageSize - 1);

  const { data, error, count } = await query;

  if (error) {
    logger.error({ error }, 'Failed to list webhook events');
    throw new AppError('Failed to list webhook events', 500, 'WEBHOOK_EVENTS_LIST_FAILED');
  }

  const events: WebhookEventListItem[] = (data ?? []).map(
    (row: Record<string, unknown>) => ({
      id: row.id as string,
      deliveryId: row.delivery_id as string,
      eventType: row.event_type as string,
      processed: row.processed as boolean,
      createdAt: row.created_at as string,
    }),
  );

  const total = count ?? 0;
  const totalPages = Math.ceil(total / filters.pageSize);

  return { events, total, totalPages };
}
