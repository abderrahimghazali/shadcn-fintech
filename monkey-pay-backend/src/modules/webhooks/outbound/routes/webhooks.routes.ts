import { Router } from 'express';

import { requireAuth } from '../../../middleware/auth.js';
import { validate } from '../../../middleware/validate.js';
import { successResponse, createdResponse, paginatedResponse } from '../../../utils/apiResponse.js';
import type { AuthenticatedRequest } from '../../../types/index.js';
import {
  createWebhookSchema,
  updateWebhookSchema,
  listWebhooksSchema,
  webhookIdParamSchema,
} from '../validators/webhooks.validators.js';
import * as webhooksService from '../services/webhooks.service.js';

const router = Router();

// ============================================================
// Outbound Webhook Endpoint Routes (merchant's own webhooks)
// ============================================================

/**
 * POST /webhooks — create a webhook endpoint
 */
router.post(
  '/',
  requireAuth,
  validate({ body: createWebhookSchema }),
  async (req, res, next) => {
    try {
      const requestId = (req as Record<string, unknown>).requestId as string;
      const authReq = req as unknown as AuthenticatedRequest;
      const result = await webhooksService.createWebhookEndpoint(authReq.user.id, {
        url: req.body.url,
        events: req.body.events,
        secret: req.body.secret,
      });
      createdResponse({
        res,
        message: 'Webhook endpoint created. Save the secret — it will not be shown again.',
        data: result,
        requestId,
      });
    } catch (err) {
      next(err);
    }
  },
);

/**
 * GET /webhooks — list user's webhook endpoints
 */
router.get(
  '/',
  requireAuth,
  validate({ query: listWebhooksSchema }),
  async (req, res, next) => {
    try {
      const requestId = (req as Record<string, unknown>).requestId as string;
      const authReq = req as unknown as AuthenticatedRequest;
      const query = req.query as { page: number; pageSize: number };
      const result = await webhooksService.listWebhookEndpoints(authReq.user.id, query);
      paginatedResponse({
        res,
        data: result.endpoints,
        total: result.total,
        page: query.page,
        pageSize: query.pageSize,
        totalPages: result.totalPages,
        requestId,
      });
    } catch (err) {
      next(err);
    }
  },
);

/**
 * PATCH /webhooks/:id — update a webhook endpoint
 */
router.patch(
  '/:id',
  requireAuth,
  validate({ params: webhookIdParamSchema, body: updateWebhookSchema }),
  async (req, res, next) => {
    try {
      const requestId = (req as Record<string, unknown>).requestId as string;
      const authReq = req as unknown as AuthenticatedRequest;
      const result = await webhooksService.updateWebhookEndpoint(
        authReq.user.id,
        req.params.id,
        {
          url: req.body.url,
          events: req.body.events,
          active: req.body.active,
        },
      );
      successResponse({ res, message: 'Webhook endpoint updated', data: result, requestId });
    } catch (err) {
      next(err);
    }
  },
);

/**
 * DELETE /webhooks/:id — delete a webhook endpoint
 */
router.delete(
  '/:id',
  requireAuth,
  validate({ params: webhookIdParamSchema }),
  async (req, res, next) => {
    try {
      const requestId = (req as Record<string, unknown>).requestId as string;
      const authReq = req as unknown as AuthenticatedRequest;
      await webhooksService.deleteWebhookEndpoint(authReq.user.id, req.params.id);
      successResponse({ res, message: 'Webhook endpoint deleted', requestId });
    } catch (err) {
      next(err);
    }
  },
);

export default router;
