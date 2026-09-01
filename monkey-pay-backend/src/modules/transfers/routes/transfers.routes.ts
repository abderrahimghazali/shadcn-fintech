import { Router } from 'express';

import { requireAuth } from '../../middleware/auth.js';
import { validate } from '../../middleware/validate.js';
import { successResponse, createdResponse, paginatedResponse } from '../../utils/apiResponse.js';
import type { AuthenticatedRequest } from '../../types/index.js';
import {
  createTransferSchema,
  createInternalTransferSchema,
  listTransfersQuerySchema,
  createScheduledTransferSchema,
  listScheduledQuerySchema,
  deleteScheduledParamSchema,
  transferIdParamSchema,
} from '../validators/transfers.validators.js';
import * as transfersService from '../services/transfers.service.js';

const router = Router();

// ============================================================
// Transfer Routes
// ============================================================

/**
 * POST /transfers — create an external PIX transfer
 */
router.post(
  '/',
  requireAuth,
  validate({ body: createTransferSchema }),
  async (req, res, next) => {
    try {
      const requestId = (req as Record<string, unknown>).requestId as string;
      const authReq = req as unknown as AuthenticatedRequest;
      const result = await transfersService.createTransfer(authReq.user.id, {
        amount: req.body.amount,
        pixKey: req.body.pixKey,
        pixKeyType: req.body.pixKeyType,
        description: req.body.description,
        externalReference: req.body.externalReference,
        coverFee: req.body.coverFee,
      });
      createdResponse({ res, message: 'PIX transfer created', data: result, requestId });
    } catch (err) {
      next(err);
    }
  },
);

/**
 * POST /transfers/internal — internal transfer
 */
router.post(
  '/internal',
  requireAuth,
  validate({ body: createInternalTransferSchema }),
  async (req, res, next) => {
    try {
      const requestId = (req as Record<string, unknown>).requestId as string;
      const authReq = req as unknown as AuthenticatedRequest;
      const result = await transfersService.createInternalTransfer(authReq.user.id, {
        amount: req.body.amount,
        recipientEmail: req.body.recipientEmail,
        description: req.body.description,
        externalReference: req.body.externalReference,
      });
      createdResponse({ res, message: 'Internal transfer created', data: result, requestId });
    } catch (err) {
      next(err);
    }
  },
);

/**
 * GET /transfers — list transfers
 */
router.get(
  '/',
  requireAuth,
  validate({ query: listTransfersQuerySchema }),
  async (req, res, next) => {
    try {
      const requestId = (req as Record<string, unknown>).requestId as string;
      const authReq = req as unknown as AuthenticatedRequest;
      const query = req.query as {
        page: number;
        pageSize: number;
        status?: string;
        type?: string;
      };
      const result = await transfersService.listTransfers(authReq.user.id, query);
      paginatedResponse({
        res,
        data: result.transfers,
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
 * GET /transfers/:id/status — get latest transfer status
 */
router.get(
  '/:id/status',
  requireAuth,
  validate({ params: transferIdParamSchema }),
  async (req, res, next) => {
    try {
      const requestId = (req as Record<string, unknown>).requestId as string;
      const authReq = req as unknown as AuthenticatedRequest;
      const status = await transfersService.getTransferStatus(
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
 * POST /transfers/scheduled — schedule a transfer
 */
router.post(
  '/scheduled',
  requireAuth,
  validate({ body: createScheduledTransferSchema }),
  async (req, res, next) => {
    try {
      const requestId = (req as Record<string, unknown>).requestId as string;
      const authReq = req as unknown as AuthenticatedRequest;
      const result = await transfersService.createScheduledTransfer(authReq.user.id, {
        amount: req.body.amount,
        pixKey: req.body.pixKey,
        pixKeyType: req.body.pixKeyType,
        scheduleType: req.body.scheduleType,
        scheduledDate: req.body.scheduledDate,
        recurrence: req.body.recurrence,
        triggerBalanceThreshold: req.body.triggerBalanceThreshold,
        description: req.body.description,
      });
      createdResponse({ res, message: 'Scheduled transfer created', data: result, requestId });
    } catch (err) {
      next(err);
    }
  },
);

/**
 * GET /transfers/scheduled — list scheduled transfers
 */
router.get(
  '/scheduled',
  requireAuth,
  validate({ query: listScheduledQuerySchema }),
  async (req, res, next) => {
    try {
      const requestId = (req as Record<string, unknown>).requestId as string;
      const authReq = req as unknown as AuthenticatedRequest;
      const query = req.query as { page: number; pageSize: number };
      const result = await transfersService.listScheduledTransfers(authReq.user.id, query);
      paginatedResponse({
        res,
        data: result.scheduled,
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
 * DELETE /transfers/scheduled/:id — delete a scheduled transfer
 */
router.delete(
  '/scheduled/:id',
  requireAuth,
  validate({ params: deleteScheduledParamSchema }),
  async (req, res, next) => {
    try {
      const requestId = (req as Record<string, unknown>).requestId as string;
      const authReq = req as unknown as AuthenticatedRequest;
      await transfersService.deleteScheduledTransfer(authReq.user.id, req.params.id);
      successResponse({ res, message: 'Scheduled transfer deleted', requestId });
    } catch (err) {
      next(err);
    }
  },
);

export default router;
