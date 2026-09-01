import { Router } from 'express';

import { requireAuth } from '../../middleware/auth.js';
import { validate } from '../../middleware/validate.js';
import { successResponse, createdResponse, paginatedResponse } from '../../utils/apiResponse.js';
import type { AuthenticatedRequest } from '../../types/index.js';
import {
  createApiKeySchema,
  listApiKeysSchema,
  updateApiKeySchema,
  rotateApiKeySchema,
  apiKeyIdParamSchema,
} from '../validators/api-keys.validators.js';
import * as apiKeysService from '../services/api-keys.service.js';

const router = Router();

// ============================================================
// API Key Routes
// ============================================================

/**
 * POST /api-keys — create a new API key
 */
router.post(
  '/',
  requireAuth,
  validate({ body: createApiKeySchema }),
  async (req, res, next) => {
    try {
      const requestId = (req as Record<string, unknown>).requestId as string;
      const authReq = req as unknown as AuthenticatedRequest;
      const result = await apiKeysService.createApiKey(authReq.user.id, {
        name: req.body.name,
        scopes: req.body.scopes,
      });
      createdResponse({ res, message: 'API key created. Save the key — it will not be shown again.', data: result, requestId });
    } catch (err) {
      next(err);
    }
  },
);

/**
 * GET /api-keys — list user's API keys
 */
router.get(
  '/',
  requireAuth,
  validate({ query: listApiKeysSchema }),
  async (req, res, next) => {
    try {
      const requestId = (req as Record<string, unknown>).requestId as string;
      const authReq = req as unknown as AuthenticatedRequest;
      const query = req.query as { page: number; pageSize: number };
      const result = await apiKeysService.listApiKeys(authReq.user.id, query);
      paginatedResponse({
        res,
        data: result.keys,
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
 * PATCH /api-keys/:id — update API key name or active status
 */
router.patch(
  '/:id',
  requireAuth,
  validate({ params: apiKeyIdParamSchema, body: updateApiKeySchema }),
  async (req, res, next) => {
    try {
      const requestId = (req as Record<string, unknown>).requestId as string;
      const authReq = req as unknown as AuthenticatedRequest;
      const result = await apiKeysService.updateApiKey(authReq.user.id, req.params.id, {
        name: req.body.name,
        active: req.body.active,
      });
      successResponse({ res, message: 'API key updated', data: result, requestId });
    } catch (err) {
      next(err);
    }
  },
);

/**
 * POST /api-keys/:id/rotate — rotate (deactivate old, generate new)
 */
router.post(
  '/:id/rotate',
  requireAuth,
  validate({ params: apiKeyIdParamSchema, body: rotateApiKeySchema }),
  async (req, res, next) => {
    try {
      const requestId = (req as Record<string, unknown>).requestId as string;
      const authReq = req as unknown as AuthenticatedRequest;
      const result = await apiKeysService.rotateApiKey(authReq.user.id, req.params.id);
      createdResponse({ res, message: 'API key rotated. Save the new key — it will not be shown again.', data: result, requestId });
    } catch (err) {
      next(err);
    }
  },
);

/**
 * DELETE /api-keys/:id — revoke an API key
 */
router.delete(
  '/:id',
  requireAuth,
  validate({ params: apiKeyIdParamSchema }),
  async (req, res, next) => {
    try {
      const requestId = (req as Record<string, unknown>).requestId as string;
      const authReq = req as unknown as AuthenticatedRequest;
      await apiKeysService.revokeApiKey(authReq.user.id, req.params.id);
      successResponse({ res, message: 'API key revoked', requestId });
    } catch (err) {
      next(err);
    }
  },
);

export default router;
