import { Router } from 'express';

import { requireAuth } from '../../middleware/auth.js';
import { validate } from '../../middleware/validate.js';
import { successResponse, createdResponse, paginatedResponse } from '../../utils/apiResponse.js';
import type { AuthenticatedRequest } from '../../types/index.js';
import {
  createRefundSchema,
  listRefundsQuerySchema,
  refundIdParamSchema,
} from '../validators/refunds.validators.js';
import * as refundsService from '../services/refunds.service.js';

const router = Router();

// ============================================================
// Refund Routes
// ============================================================

/**
 * POST /refunds — create a refund
 */
router.post(
  '/',
  requireAuth,
  validate({ body: createRefundSchema }),
  async (req, res, next) => {
    try {
      const requestId = (req as Record<string, unknown>).requestId as string;
      const authReq = req as unknown as AuthenticatedRequest;
      const result = await refundsService.createRefund(authReq.user.id, {
        transactionId: req.body.transactionId,
        reason: req.body.reason,
      });
      createdResponse({ res, message: 'Refund created', data: result, requestId });
    } catch (err) {
      next(err);
    }
  },
);

/**
 * GET /refunds — list refunds
 */
router.get(
  '/',
  requireAuth,
  validate({ query: listRefundsQuerySchema }),
  async (req, res, next) => {
    try {
      const requestId = (req as Record<string, unknown>).requestId as string;
      const authReq = req as unknown as AuthenticatedRequest;
      const query = req.query as { page: number; pageSize: number; status?: string };
      const result = await refundsService.listRefunds(authReq.user.id, query);
      paginatedResponse({
        res,
        data: result.refunds,
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
 * GET /refunds/:id — get refund details (with status poll)
 */
router.get(
  '/:id',
  requireAuth,
  validate({ params: refundIdParamSchema }),
  async (req, res, next) => {
    try {
      const requestId = (req as Record<string, unknown>).requestId as string;
      const authReq = req as unknown as AuthenticatedRequest;
      const status = await refundsService.getRefundStatus(
        authReq.user.id,
        req.params.id,
      );
      successResponse({ res, data: status, requestId });
    } catch (err) {
      next(err);
    }
  },
);

export default router;
