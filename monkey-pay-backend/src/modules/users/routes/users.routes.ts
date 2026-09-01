import { Router } from 'express';

import { requireAuth, requireRole } from '../../middleware/auth.js';
import { validate } from '../../middleware/validate.js';
import { successResponse, paginatedResponse } from '../../utils/apiResponse.js';
import { UserRole } from '../../types/index.js';
import type { AuthenticatedRequest } from '../../types/index.js';
import {
  updateProfileSchema,
  updateUserStatusSchema,
  listUsersQuerySchema,
} from '../validators/users.validators.js';
import * as usersService from '../services/users.service.js';

const router = Router();

// ============================================================
// User's own profile
// ============================================================

/**
 * GET /users/me
 */
router.get(
  '/me',
  requireAuth,
  async (req, res, next) => {
    try {
      const requestId = (req as Record<string, unknown>).requestId as string;
      const authReq = req as unknown as AuthenticatedRequest;
      const profile = await usersService.getProfile(authReq.user.id);
      successResponse({ res, data: profile, requestId });
    } catch (err) {
      next(err);
    }
  },
);

/**
 * PUT /users/me
 */
router.put(
  '/me',
  requireAuth,
  validate({ body: updateProfileSchema }),
  async (req, res, next) => {
    try {
      const requestId = (req as Record<string, unknown>).requestId as string;
      const authReq = req as unknown as AuthenticatedRequest;
      const profile = await usersService.updateProfile(authReq.user.id, req.body);
      successResponse({ res, message: 'Profile updated', data: profile, requestId });
    } catch (err) {
      next(err);
    }
  },
);

// ============================================================
// Admin routes
// ============================================================

/**
 * GET /users
 */
router.get(
  '/',
  requireAuth,
  requireRole(UserRole.ADMIN),
  validate({ query: listUsersQuerySchema }),
  async (req, res, next) => {
    try {
      const requestId = (req as Record<string, unknown>).requestId as string;
      const result = await usersService.listUsers(req.query as Parameters<typeof usersService.listUsers>[0]);
      paginatedResponse({
        res,
        data: result.users,
        total: result.total,
        page: result.page,
        pageSize: result.pageSize,
        totalPages: result.totalPages,
        requestId,
      });
    } catch (err) {
      next(err);
    }
  },
);

/**
 * GET /users/:id
 */
router.get(
  '/:id',
  requireAuth,
  requireRole(UserRole.ADMIN),
  async (req, res, next) => {
    try {
      const requestId = (req as Record<string, unknown>).requestId as string;
      const profile = await usersService.getUserById(req.params.id);
      successResponse({ res, data: profile, requestId });
    } catch (err) {
      next(err);
    }
  },
);

/**
 * PATCH /users/:id/status
 */
router.patch(
  '/:id/status',
  requireAuth,
  requireRole(UserRole.ADMIN),
  validate({ body: updateUserStatusSchema }),
  async (req, res, next) => {
    try {
      const requestId = (req as Record<string, unknown>).requestId as string;
      const authReq = req as unknown as AuthenticatedRequest;
      await usersService.updateUserStatus(
        authReq.user.id,
        req.params.id,
        req.body.status,
      );
      successResponse({ res, message: 'User status updated', requestId });
    } catch (err) {
      next(err);
    }
  },
);

export default router;
