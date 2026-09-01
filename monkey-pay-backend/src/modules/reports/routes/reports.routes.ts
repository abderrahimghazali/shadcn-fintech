import { Router } from 'express';

import { requireAuth } from '../../middleware/auth.js';
import { validate } from '../../middleware/validate.js';
import { successResponse, paginatedResponse } from '../../utils/apiResponse.js';
import type { AuthenticatedRequest } from '../../types/index.js';
import * as reportsService from '../services/reports.service.js';
import type { ReportPeriod } from '../services/reports.service.js';

import { z } from 'zod';

const volumeQuerySchema = z.object({
  period: z.enum(['7d', '30d', '90d', '12m']).default('30d'),
});

const transactionReportQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(200).default(50),
  type: z.string().optional(),
  status: z.string().optional(),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
});

const router = Router();

// ============================================================
// Reports / Analytics Routes
// ============================================================

/**
 * GET /reports/dashboard — dashboard stats
 */
router.get(
  '/dashboard',
  requireAuth,
  async (req, res, next) => {
    try {
      const requestId = (req as Record<string, unknown>).requestId as string;
      const authReq = req as unknown as AuthenticatedRequest;
      const stats = await reportsService.getDashboardStats(authReq.user.id);
      successResponse({ res, data: stats, requestId });
    } catch (err) {
      next(err);
    }
  },
);

/**
 * GET /reports/volume — volume report grouped by period
 */
router.get(
  '/volume',
  requireAuth,
  validate({ query: volumeQuerySchema }),
  async (req, res, next) => {
    try {
      const requestId = (req as Record<string, unknown>).requestId as string;
      const authReq = req as unknown as AuthenticatedRequest;
      const query = req.query as { period: ReportPeriod };
      const report = await reportsService.getVolumeReport(authReq.user.id, query.period);
      successResponse({ res, data: report, requestId });
    } catch (err) {
      next(err);
    }
  },
);

/**
 * GET /reports/revenue — revenue report (subaccount profit)
 */
router.get(
  '/revenue',
  requireAuth,
  validate({ query: volumeQuerySchema }),
  async (req, res, next) => {
    try {
      const requestId = (req as Record<string, unknown>).requestId as string;
      const authReq = req as unknown as AuthenticatedRequest;
      const query = req.query as { period: ReportPeriod };
      const report = await reportsService.getRevenueReport(authReq.user.id, query.period);
      successResponse({ res, data: report, requestId });
    } catch (err) {
      next(err);
    }
  },
);

/**
 * GET /reports/transactions — detailed transaction report
 */
router.get(
  '/transactions',
  requireAuth,
  validate({ query: transactionReportQuerySchema }),
  async (req, res, next) => {
    try {
      const requestId = (req as Record<string, unknown>).requestId as string;
      const authReq = req as unknown as AuthenticatedRequest;
      const query = req.query as {
        page: number;
        pageSize: number;
        type?: string;
        status?: string;
        startDate?: string;
        endDate?: string;
      };
      const result = await reportsService.getTransactionReport(authReq.user.id, query);
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
