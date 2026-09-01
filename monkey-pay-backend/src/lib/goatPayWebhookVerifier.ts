import crypto from 'node:crypto';
import { AppError } from '../types/index.js';
import logger from '../utils/logger.js';

/**
 * Verify an inbound Goat Pay webhook signature.
 *
 * Goat Pay sends: x-goatpay-signature: sha256=<hmac_hex>
 * The HMAC is computed over the raw request body using the webhook secret.
 *
 * Uses timingSafeEqual to prevent timing attacks.
 */
export function verifyGoatPayWebhookSignature(
  rawBody: string,
  signatureHeader: string | undefined,
  secret: string,
): void {
  if (!signatureHeader) {
    throw new AppError(
      'Missing x-goatpay-signature header',
      401,
      'WEBHOOK_SIGNATURE_MISSING',
    );
  }

  // Expected format: "sha256=<hex>"
  const expectedPrefix = 'sha256=';
  if (!signatureHeader.startsWith(expectedPrefix)) {
    throw new AppError(
      'Invalid signature format',
      401,
      'WEBHOOK_SIGNATURE_INVALID',
    );
  }

  const providedSignature = signatureHeader.slice(expectedPrefix.length);

  // Compute HMAC-SHA256 of the raw body
  const hmac = crypto.createHmac('sha256', secret);
  hmac.update(rawBody);
  const computedSignature = hmac.digest('hex');

  // timingSafeEqual requires same-length buffers
  const providedBuf = Buffer.from(providedSignature, 'hex');
  const computedBuf = Buffer.from(computedSignature, 'hex');

  if (providedBuf.length !== computedBuf.length) {
    logger.warn(
      { providedLen: providedBuf.length, computedLen: computedBuf.length },
      'Webhook signature length mismatch',
    );
    throw new AppError(
      'Invalid webhook signature',
      401,
      'WEBHOOK_SIGNATURE_INVALID',
    );
  }

  const isValid = crypto.timingSafeEqual(providedBuf, computedBuf);

  if (!isValid) {
    logger.warn({}, 'Webhook signature verification failed');
    throw new AppError(
      'Invalid webhook signature',
      401,
      'WEBHOOK_SIGNATURE_INVALID',
    );
  }
}
