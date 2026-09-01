import { Router, type Request, type Response, type NextFunction } from 'express';

import { successResponse } from '../../../utils/apiResponse.js';
import { AppError } from '../../../types/index.js';
import logger from '../../../utils/logger.js';
import * as goatpayService from '../services/goatpay.service.js';

const router = Router();

// ============================================================
// Goat Pay Inbound Webhook Route
// NO auth — Goat Pay authenticates via HMAC-SHA256 signature.
// ============================================================

/**
 * POST /webhooks/goatpay — receive events from Goat Pay
 *
 * Critical: we need the raw body string for HMAC verification.
 * Express.json() parser converts body to object, so we must
 * re-serialize it carefully. The route handler expects rawBody
 * to be set by a custom body parser in app.ts (or falls back
 * to JSON.stringify(req.body)).
 */
router.post(
  '/',
  // IMPORTANT: This route needs express.json({ verify }) to capture rawBody.
  // The caller must ensure rawBody is available on req.
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      // Get raw body — set by express.json({ verify }) middleware
      const rawBody = (req as unknown as { rawBody?: string }).rawBody
        ?? JSON.stringify(req.body);

      const signature = req.headers['x-goatpay-signature'] as string | undefined;
      const deliveryId = req.headers['x-webhook-delivery-id'] as string | undefined;

      // Process asynchronously — always return 200 immediately
      // so Goat Pay doesn't retry.
      goatpayService.processWebhookEvent(rawBody, signature, deliveryId).catch((err) => {
        logger.error({ err }, 'Unhandled error in webhook processing');
      });

      successResponse({ res, message: 'Webhook received', requestId: deliveryId ?? 'webhook' });
    } catch (err) {
      // Signature verification failures should return 401
      if (err instanceof AppError) {
        next(err);
      } else {
        logger.error({ err }, 'Unexpected error processing Goat Pay webhook');
        // Still return 200 to avoid Goat Pay retries on our internal errors
        successResponse({ res, message: 'Webhook received', requestId: 'webhook' });
      }
    }
  },
);

export default router;
