import { Router } from 'express';

import { requireAuth, requireRole } from '../../middleware/auth.js';
import { validate } from '../../middleware/validate.js';
import { successResponse, paginatedResponse } from '../../utils/apiResponse.js';
import { UserRole, type AuthenticatedRequest } from '../../types/index.js';
import {
  listSubaccountsSchema,
  setPricingSchema,
  subaccountIdParamSchema,
} from '../validators/subaccounts.validators.js';
import * as subaccountsService from '../services/subaccounts.service.js';

const router = Router();

// ============================================================
// Subaccount Admin Routes
// ============================================================

/**
 * GET /subaccounts — list all subaccounts with user info
 */
router.get(
  '/',
  requireAuth,
  requireRole(UserRole.ADMIN),
  validate({ query: listSubaccountsSchema }),
  async (req, res, next) => {
    try {
      const requestId = (req as Record<string, unknown>).requestId as string;
      const query = req.query as { page: number; pageSize: number; status?: string };
      const result = await subaccountsService.listSubaccounts(query);
      paginatedResponse({
        res,
        data: result.subaccounts,
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
 * GET /subaccounts/:id — get full subaccount details
 */
router.get(
  '/:id',
  requireAuth,
  requireRole(UserRole.ADMIN),
  validate({ params: subaccountIdParamSchema }),
  async (req, res, next) => {
    try {
      const requestId = (req as Record<string, unknown>).requestId as string;
      const detail = await subaccountsService.getSubaccountDetails(req.params.id);
      successResponse({ res, data: detail, requestId });
    } catch (err) {
      next(err);
    }
  },
);

/**
 * POST /subaccounts/:id/pricing — set subaccount pricing
 */
router.post(
  '/:id/pricing',
  requireAuth,
  requireRole(UserRole.ADMIN),
  validate({ params: subaccountIdParamSchema, body: setPricingSchema }),
  async (req, res, next) => {
    try {
      const requestId = (req as Record<string, unknown>).requestId as string;
      const authReq = req as unknown as AuthenticatedRequest;
      await subaccountsService.setSubaccountPricing(
        req.params.id,
        {
          pixInFeePercentage: req.body.pixInFeePercentage,
          pixOutFeePercentage: req.body.pixOutFeePercentage,
        },
        authReq.user.id,
      );
      successResponse({ res, message: 'Subaccount pricing updated', requestId });
    } catch (err) {
      next(err);
    }
  },
);

/**
 * DELETE /subaccounts/:id — delete a subaccount
 */
router.delete(
  '/:id',
  requireAuth,
  requireRole(UserRole.ADMIN),
  validate({ params: subaccountIdParamSchema }),
  async (req, res, next) => {
    try {
      const requestId = (req as Record<string, unknown>).requestId as string;
      const authReq = req as unknown as AuthenticatedRequest;
      await subaccountsService.deleteSubaccount(req.params.id, authReq.user.id);
      successResponse({ res, message: 'Subaccount deleted', requestId });
    } catch (err) {
      next(err);
    }
  },
);

export default router;
