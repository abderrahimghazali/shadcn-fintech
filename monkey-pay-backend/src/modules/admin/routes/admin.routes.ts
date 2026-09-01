import { Router } from 'express';

import { requireAuth, requireRole } from '../../middleware/auth.js';
import { successResponse } from '../../utils/apiResponse.js';
import { UserRole, AppError } from '../../types/index.js';
import * as adminService from '../services/admin.service.js';
import type { UserManagementAction } from '../services/admin.service.js';

import { z } from 'zod';

const userActionParamSchema = z.object({
  id: z.string().uuid('Invalid user ID'),
  action: z.enum(['suspend', 'ban', 'unsuspend', 'unban', 'promote', 'demote']),
});

const router = Router();

// ============================================================
// Admin Routes (admin only)
// ============================================================

/**
 * GET /admin/stats — system-wide statistics
 */
router.get(
  '/stats',
  requireAuth,
  requireRole(UserRole.ADMIN),
  async (req, res, next) => {
    try {
      const requestId = (req as Record<string, unknown>).requestId as string;
      const stats = await adminService.getSystemStats();
      successResponse({ res, data: stats, requestId });
    } catch (err) {
      next(err);
    }
  },
);

/**
 * GET /admin/health — system health check
 */
router.get(
  '/health',
  requireAuth,
  requireRole(UserRole.ADMIN),
  async (req, res, next) => {
    try {
      const requestId = (req as Record<string, unknown>).requestId as string;
      const health = await adminService.getSystemHealth();
      successResponse({ res, data: health, requestId });
    } catch (err) {
      next(err);
    }
  },
);

/**
 * POST /admin/users/:id/:action — manage a user
 * Actions: suspend, ban, unsuspend, unban, promote, demote
 */
router.post(
  '/users/:id/:action',
  requireAuth,
  requireRole(UserRole.ADMIN),
  async (req, res, next) => {
    try {
      const requestId = (req as Record<string, unknown>).requestId as string;
      const authReq = req as unknown as { user: { id: string } } & Record<string, unknown>;
      const params = userActionParamSchema.parse({
        id: req.params.id,
        action: req.params.action,
      });

      await adminService.manageUser(
        authReq.user.id,
        params.id,
        params.action as UserManagementAction,
        req.body as Record<string, unknown> | undefined,
      );

      successResponse({
        res,
        message: `User ${params.action} action performed successfully`,
        requestId,
      });
    } catch (err) {
      next(err);
    }
  },
);

export default router;
