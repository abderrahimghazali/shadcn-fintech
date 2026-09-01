import { Router } from 'express';

import { requireAuth } from '../../middleware/auth.js';
import { validate } from '../../middleware/validate.js';
import { successResponse, createdResponse, paginatedResponse } from '../../utils/apiResponse.js';
import type { AuthenticatedRequest } from '../../types/index.js';
import {
  createPaymentSchema,
  listPaymentsQuerySchema,
  paymentIdParamSchema,
} from '../validators/payments.validators.js';
import * as paymentsService from '../services/payments.service.js';

const router = Router();

// ============================================================
// Payment Routes
// ============================================================

/**
 * POST /payments — create a PIX payment (receive money)
 */
router.post(
  '/',
  requireAuth,
  validate({ body: createPaymentSchema }),
  async (req, res, next) => {
    try {
      const requestId = (req as Record<string, unknown>).requestId as string;
      const authReq = req as unknown as AuthenticatedRequest;
      const result = await paymentsService.createPayment(authReq.user.id, {
        amount: req.body.amount,
        description: req.body.description,
        externalReference: req.body.externalReference,
        coverFee: req.body.coverFee,
        subaccountMode: req.body.subaccountMode,
      });
      createdResponse({ res, message: 'PIX payment created', data: result, requestId });
    } catch (err) {
      next(err);
    }
  },
);

/**
 * GET /payments — list user's PIX-in payments
 */
router.get(
  '/',
  requireAuth,
  validate({ query: listPaymentsQuerySchema }),
  async (req, res, next) => {
    try {
      const requestId = (req as Record<string, unknown>).requestId as string;
      const authReq = req as unknown as AuthenticatedRequest;
      const query = req.query as {
        page: number;
        pageSize: number;
        status?: string;
        startDate?: string;
        endDate?: string;
      };
      const result = await paymentsService.listPayments(authReq.user.id, query);
      paginatedResponse({
        res,
        data: result.payments,
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
 * GET /payments/:id/status — get latest payment status (polls if needed)
 */
router.get(
  '/:id/status',
  requireAuth,
  validate({ params: paymentIdParamSchema }),
  async (req, res, next) => {
    try {
      const requestId = (req as Record<string, unknown>).requestId as string;
      const authReq = req as unknown as AuthenticatedRequest;
      const status = await paymentsService.getPaymentStatus(
        authReq.user.id,
        req.params.id,
      );
      successResponse({ res, data: status, requestId });
    } catch (err) {
      next(err);
    }
  },
);

/**
 * GET /payments/:id — get a single payment
 */
router.get(
  '/:id',
  requireAuth,
  validate({ params: paymentIdParamSchema }),
  async (req, res, next) => {
    try {
      const requestId = (req as Record<string, unknown>).requestId as string;
      const authReq = req as unknown as AuthenticatedRequest;
      const payment = await paymentsService.getPayment(
        authReq.user.id,
        req.params.id,
      );
      successResponse({ res, data: payment, requestId });
    } catch (err) {
      next(err);
    }
  },
);

export default router;
