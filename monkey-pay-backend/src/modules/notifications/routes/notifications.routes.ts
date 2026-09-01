import { Router } from 'express';

import { requireAuth } from '../../middleware/auth.js';
import { successResponse, paginatedResponse } from '../../utils/apiResponse.js';
import type { AuthenticatedRequest } from '../../types/index.js';
import * as notificationsService from '../services/notifications.service.js';

import { z } from 'zod';

const listNotificationsSchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(100).default(20),
});

const notificationIdParamSchema = z.object({
  id: z.string().uuid('Invalid notification ID'),
});

const router = Router();

// ============================================================
// Notification Routes
// ============================================================

/**
 * GET /notifications — list user's notifications
 */
router.get(
  '/',
  requireAuth,
  async (req, res, next) => {
    try {
      const requestId = (req as Record<string, unknown>).requestId as string;
      const authReq = req as unknown as AuthenticatedRequest;
      const query = listNotificationsSchema.parse(req.query);
      const result = await notificationsService.getNotifications(authReq.user.id, query);
      paginatedResponse({
        res,
        data: result.notifications,
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
 * GET /notifications/unread-count — get unread notification count
 */
router.get(
  '/unread-count',
  requireAuth,
  async (req, res, next) => {
    try {
      const requestId = (req as Record<string, unknown>).requestId as string;
      const authReq = req as unknown as AuthenticatedRequest;
      const count = await notificationsService.getUnreadCount(authReq.user.id);
      successResponse({ res, data: { count }, requestId });
    } catch (err) {
      next(err);
    }
  },
);

/**
 * PATCH /notifications/:id/read — mark single notification as read
 */
router.patch(
  '/:id/read',
  requireAuth,
  async (req, res, next) => {
    try {
      const requestId = (req as Record<string, unknown>).requestId as string;
      const authReq = req as unknown as AuthenticatedRequest;
      const params = notificationIdParamSchema.parse(req.params);
      await notificationsService.markAsRead(authReq.user.id, params.id);
      successResponse({ res, message: 'Notification marked as read', requestId });
    } catch (err) {
      next(err);
    }
  },
);

/**
 * POST /notifications/read-all — mark all notifications as read
 */
router.post(
  '/read-all',
  requireAuth,
  async (req, res, next) => {
    try {
      const requestId = (req as Record<string, unknown>).requestId as string;
      const authReq = req as unknown as AuthenticatedRequest;
      const count = await notificationsService.markAllAsRead(authReq.user.id);
      successResponse({ res, message: `${count} notifications marked as read`, data: { count }, requestId });
    } catch (err) {
      next(err);
    }
  },
);

export default router;
