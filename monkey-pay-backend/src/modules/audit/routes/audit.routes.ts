import { Router } from 'express';

import { requireAuth, requireRole } from '../../middleware/auth.js';
import { validate } from '../../middleware/validate.js';
import { paginatedResponse } from '../../utils/apiResponse.js';
import { UserRole } from '../../types/index.js';
import * as auditService from '../services/audit.service.js';

import { z } from 'zod';

const auditLogQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(200).default(50),
  userId: z.string().uuid().optional(),
  action: z.string().optional(),
  resourceType: z.string().optional(),
  resourceId: z.string().optional(),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
});

const router = Router();

// ============================================================
// Audit Log Routes (admin only)
// ============================================================

/**
 * GET /audit/logs — paginated audit log
 */
router.get(
  '/logs',
  requireAuth,
  requireRole(UserRole.ADMIN),
  validate({ query: auditLogQuerySchema }),
  async (req, res, next) => {
    try {
      const requestId = (req as Record<string, unknown>).requestId as string;
      const query = req.query as {
        page: number;
        pageSize: number;
        userId?: string;
        action?: string;
        resourceType?: string;
        resourceId?: string;
        startDate?: string;
        endDate?: string;
      };
      const result = await auditService.getAuditLog(query);
      paginatedResponse({
        res,
        data: result.logs,
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
