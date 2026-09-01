import { Router } from 'express';

import { requireAuth } from '../../middleware/auth.js';
import { validate } from '../../middleware/validate.js';
import { successResponse, paginatedResponse } from '../../utils/apiResponse.js';
import type { AuthenticatedRequest } from '../../types/index.js';
import {
  listMedsSchema,
  getMedSchema,
  sendEvidenceSchema,
} from '../validators/meds.validators.js';
import * as medsService from '../services/meds.service.js';

const router = Router();

// ============================================================
// MED (Disputes) Routes
// ============================================================

/**
 * GET /meds — list MED disputes
 */
router.get(
  '/',
  requireAuth,
  validate({ query: listMedsSchema }),
  async (req, res, next) => {
    try {
      const requestId = (req as Record<string, unknown>).requestId as string;
      const authReq = req as unknown as AuthenticatedRequest;
      const query = req.query as { page: number; pageSize: number; status?: string };
      const result = await medsService.listMeds(authReq.user.id, query);
      paginatedResponse({
        res,
        data: result.meds,
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
 * GET /meds/:id — get MED detail
 */
router.get(
  '/:id',
  requireAuth,
  validate({ params: getMedSchema }),
  async (req, res, next) => {
    try {
      const requestId = (req as Record<string, unknown>).requestId as string;
      const authReq = req as unknown as AuthenticatedRequest;
      const med = await medsService.getMed(authReq.user.id, req.params.id);
      successResponse({ res, data: med, requestId });
    } catch (err) {
      next(err);
    }
  },
);

/**
 * POST /meds/:id/evidence — send evidence for a MED dispute
 */
router.post(
  '/:id/evidence',
  requireAuth,
  validate({ params: getMedSchema, body: sendEvidenceSchema }),
  async (req, res, next) => {
    try {
      const requestId = (req as Record<string, unknown>).requestId as string;
      const authReq = req as unknown as AuthenticatedRequest;
      await medsService.sendEvidence(
        authReq.user.id,
        req.params.id,
        req.body.evidenceText,
      );
      successResponse({ res, message: 'Evidence submitted successfully', requestId });
    } catch (err) {
      next(err);
    }
  },
);

export default router;
