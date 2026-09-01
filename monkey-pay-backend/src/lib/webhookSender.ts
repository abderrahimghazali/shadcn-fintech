import crypto from 'node:crypto';
import logger from '../utils/logger.js';
import { supabase } from '../config/supabase.js';

// ============================================================
// Outbound Webhook Sender
// Sends webhook events to merchant-configured endpoints.
// Uses HMAC-SHA256 signature (same pattern Goat Pay uses).
// Retry schedule: 1min, 5min, 15min, 1h, 4h (max 5 attempts)
// ============================================================

const RETRY_DELAYS_MS = [
  60_000,   // 1 minute
  300_000,  // 5 minutes
  900_000,  // 15 minutes
  3_600_000, // 1 hour
  14_400_000, // 4 hours
];

/**
 * Generate HMAC-SHA256 signature for an outbound webhook payload.
 */
export function signWebhookPayload(payload: string, secret: string): string {
  const hmac = crypto.createHmac('sha256', secret);
  hmac.update(payload);
  return `sha256=${hmac.digest('hex')}`;
}

interface WebhookSendResult {
 success: boolean;
 statusCode?: number;
 responseBody?: string;
}

/**
 * Deliver a single webhook event to a single endpoint.
 * Returns true if delivery succeeded (2xx).
 */
async function deliverOnce(
  url: string,
  payload: string,
  signature: string,
  deliveryId: string,
): Promise<WebhookSendResult> {
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-MonkeyPay-Signature': signature,
        'X-Webhook-Delivery-Id': deliveryId,
      },
      body: payload,
      signal: AbortSignal.timeout(30_000),
    });

    const responseBody = await res.text();

    return {
      success: res.status >= 200 && res.status < 300,
      statusCode: res.status,
      responseBody,
    };
  } catch (err) {
    logger.warn(
      { err, url, deliveryId },
      'Webhook delivery failed (network error)',
    );
    return { success: false };
  }
}

/**
 * Create a delivery log entry and attempt delivery.
 * Schedules retries via next_retry_at if the attempt fails.
 */
export async function sendWebhook(params: {
  endpointId: string;
  url: string;
  secret: string;
  eventType: string;
  payload: Record<string, unknown>;
}): Promise<void> {
  const { endpointId, url, secret, eventType, payload } = params;

  // Create delivery log
  const { data: delivery, error: insertErr } = await supabase
    .from('webhook_deliveries')
    .insert({
      endpoint_id: endpointId,
      event_type: eventType,
      payload,
      status: 'pending',
      attempt: 0,
    })
    .select('id')
    .single();

  if (insertErr || !delivery) {
    logger.error(
      { err: insertErr, endpointId, eventType },
      'Failed to create webhook delivery log',
    );
    return;
  }

  const deliveryId = delivery.id as string;
  const payloadStr = JSON.stringify(payload);
  const signature = signWebhookPayload(payloadStr, secret);

  // First attempt
  const result = await deliverOnce(url, payloadStr, signature, deliveryId);

  if (result.success) {
    await supabase
      .from('webhook_deliveries')
      .update({
        status: 'success',
        response_status_code: result.statusCode ?? null,
        response_body: result.responseBody ?? null,
        attempt: 1,
        delivered_at: new Date().toISOString(),
      })
      .eq('id', deliveryId);
    return;
  }

  // Failed — schedule first retry
  await scheduleRetry(deliveryId, 0, result);
}

/**
 * Schedule a retry by updating next_retry_at.
 */
async function scheduleRetry(
  deliveryId: string,
  attemptIndex: number,
  lastResult: WebhookSendResult,
): Promise<void> {
  const nextAttempt = attemptIndex + 1;

  if (nextAttempt >= RETRY_DELAYS_MS.length) {
    // Exhausted all retries
    await supabase
      .from('webhook_deliveries')
      .update({
        status: 'failed',
        attempt: nextAttempt + 1,
        response_status_code: lastResult.statusCode ?? null,
        response_body: lastResult.responseBody ?? null,
      })
      .eq('id', deliveryId);
    return;
  }

  const nextRetryAt = new Date(
    Date.now() + RETRY_DELAYS_MS[attemptIndex]!,
  ).toISOString();

  await supabase
    .from('webhook_deliveries')
    .update({
      status: 'retrying',
      attempt: nextAttempt + 1,
      next_retry_at: nextRetryAt,
      response_status_code: lastResult.statusCode ?? null,
      response_body: lastResult.responseBody ?? null,
    })
    .eq('id', deliveryId);
}

/**
 * Process pending/retiring deliveries whose next_retry_at has passed.
 * Call this from a cron job or on startup.
 */
export async function processPendingDeliveries(): Promise<number> {
  const { data: pendingDeliveries, error } = await supabase
    .from('webhook_deliveries')
    .select(
      'id, endpoint_id, payload, attempt, webhook_endpoints(url, secret)',
    )
    .in('status', ['pending', 'retrying'])
    .lte('next_retry_at', new Date().toISOString())
    .limit(100);

  if (error || !pendingDeliveries) return 0;

  let processed = 0;

  for (const delivery of pendingDeliveries) {
    const d = delivery as {
      id: string;
      endpoint_id: string;
      payload: Record<string, unknown>;
      attempt: number;
      webhook_endpoints: { url: string; secret: string };
    };

    const payloadStr = JSON.stringify(d.payload);
    const signature = signWebhookPayload(payloadStr, d.webhook_endpoints.secret);

    const result = await deliverOnce(
      d.webhook_endpoints.url,
      payloadStr,
      signature,
      d.id,
    );

    if (result.success) {
      await supabase
        .from('webhook_deliveries')
        .update({
          status: 'success',
          response_status_code: result.statusCode ?? null,
          response_body: result.responseBody ?? null,
          delivered_at: new Date().toISOString(),
        })
        .eq('id', d.id);
    } else {
      await scheduleRetry(d.id, d.attempt, result);
    }

    processed++;
  }

  return processed;
}
