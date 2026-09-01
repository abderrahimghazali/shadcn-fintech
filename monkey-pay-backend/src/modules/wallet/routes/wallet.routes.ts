import { Router } from 'express';

import { requireAuth } from '../../middleware/auth.js';
import { validate } from '../../middleware/validate.js';
import { successResponse, paginatedResponse } from '../../utils/apiResponse.js';
import type { AuthenticatedRequest } from '../../types/index.js';
import {
  syncBalanceSchema,
  setLockSchema,
  setLimitsSchema,
  listTransactionsQuerySchema,
} from '../validators/wallet.validators.js';
import * as walletService from '../services/wallet.service.js';

const router = Router();

// ============================================================
// Wallet Routes
// All require authentication.
// ============================================================

/**
 * GET /wallet/balance
 */
router.get(
  '/balance',
  requireAuth,
  async (req, res, next) => {
    try {
      const requestId = (req as Record<string, unknown>).requestId as string;
      const authReq = req as unknown as AuthenticatedRequest;
      const balance = await walletService.getBalance(authReq.user.id);
      successResponse({ res, data: balance, requestId });
    } catch (err) {
      next(err);
    }
  },
);

/**
 * POST /wallet/sync
 * Syncs balance from Goat Pay and caches locally.
 */
router.post(
  '/sync',
  requireAuth,
  validate({ body: syncBalanceSchema }),
  async (req, res, next) => {
    try {
      const requestId = (req as Record<string, unknown>).requestId as string;
      const authReq = req as unknown as AuthenticatedRequest;
      const balance = await walletService.syncBalance(authReq.user.id);
      successResponse({ res, message: 'Balance synced', data: balance, requestId });
    } catch (err) {
      next(err);
    }
  },
);

/**
 * GET /wallet/details
 */
router.get(
  '/details',
  requireAuth,
  async (req, res, next) => {
    try {
      const requestId = (req as Record<string, unknown>).requestId as string;
      const authReq = req as unknown as AuthenticatedRequest;
      const details = await walletService.getWalletDetails(authReq.user.id);
      successResponse({ res, data: details, requestId });
    } catch (err) {
      next(err);
    }
  },
);

/**
 * POST /wallet/lock
 */
router.post(
  '/lock',
  requireAuth,
  validate({ body: setLockSchema }),
  async (req, res, next) => {
    try {
      const requestId = (req as Record<string, unknown>).requestId as string;
      const authReq = req as unknown as AuthenticatedRequest;
      await walletService.lockWallet(authReq.user.id, req.body.lockType);
      successResponse({ res, message: `Wallet locked (${req.body.lockType})`, requestId });
    } catch (err) {
      next(err);
    }
  },
);

/**
 * POST /wallet/limits
 */
router.post(
  '/limits',
  requireAuth,
  validate({ body: setLimitsSchema }),
  async (req, res, next) => {
    try {
      const requestId = (req as Record<string, unknown>).requestId as string;
      const authReq = req as unknown as AuthenticatedRequest;
      await walletService.setLimits(authReq.user.id, {
        dailyLimit: req.body.dailyLimit,
        monthlyLimit: req.body.monthlyLimit,
        transactionLimit: req.body.transactionLimit,
      });
      successResponse({ res, message: 'Wallet limits updated', requestId });
    } catch (err) {
      next(err);
    }
  },
);

/**
 * GET /wallet/transactions
 */
router.get(
  '/transactions',
  requireAuth,
  validate({ query: listTransactionsQuerySchema }),
  async (req, res, next) => {
    try {
      const requestId = (req as Record<string, unknown>).requestId as string;
      const authReq = req as unknown as AuthenticatedRequest;
      const query = req.query as {
        page: number;
        pageSize: number;
        status?: string;
        type?: string;
        startDate?: string;
        endDate?: string;
      };
      const result = await walletService.getTransactionHistory(authReq.user.id, query);
      paginatedResponse({
        res,
        data: result.transactions,
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

export default router;
