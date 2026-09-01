import { Router } from 'express';

import { requireAuth } from '../../middleware/auth.js';
import { validate } from '../../middleware/validate.js';
import { successResponse } from '../../utils/apiResponse.js';
import { AppError } from '../../types/index.js';
import type { AuthenticatedRequest } from '../../types/index.js';
import {
  enable2faSchema,
  verify2faSchema,
  disable2faSchema,
} from '../validators/security.validators.js';
import * as securityService from '../services/security.service.js';

const router = Router();

// ============================================================
// Session management
// ============================================================

/**
 * GET /security/sessions
 */
router.get(
  '/sessions',
  requireAuth,
  async (req, res, next) => {
    try {
      const requestId = (req as Record<string, unknown>).requestId as string;
      const authReq = req as unknown as AuthenticatedRequest;
      const sessions = await securityService.getSessions(authReq.user.id);
      successResponse({ res, data: sessions, requestId });
    } catch (err) {
      next(err);
    }
  },
);

/**
 * DELETE /security/sessions/:id
 */
router.delete(
  '/sessions/:id',
  requireAuth,
  async (req, res, next) => {
    try {
      const requestId = (req as Record<string, unknown>).requestId as string;
      const authReq = req as unknown as AuthenticatedRequest;
      await securityService.revokeSession(authReq.user.id, req.params.id);
      successResponse({ res, message: 'Session revoked', requestId });
    } catch (err) {
      next(err);
    }
  },
);

/**
 * DELETE /security/sessions
 * Revoke all sessions except the current one.
 * Requires the current session ID in the body.
 */
router.delete(
  '/sessions',
  requireAuth,
  async (req, res, next) => {
    try {
      const requestId = (req as Record<string, unknown>).requestId as string;
      const authReq = req as unknown as AuthenticatedRequest;
      const currentSessionId = req.body?.sessionId as string | undefined;
      if (!currentSessionId) {
        throw new AppError('Current session ID is required', 400, 'SESSION_ID_REQUIRED');
      }
      const count = await securityService.revokeAllOtherSessions(
        authReq.user.id,
        currentSessionId,
      );
      successResponse({ res, message: `${count} other sessions revoked`, requestId });
    } catch (err) {
      next(err);
    }
  },
);

// ============================================================
// 2FA management
// ============================================================

/**
 * POST /security/2fa/enable
 * Generates a TOTP secret for the user to add to their authenticator app.
 */
router.post(
  '/2fa/enable',
  requireAuth,
  async (req, res, next) => {
    try {
      const requestId = (req as Record<string, unknown>).requestId as string;
      const authReq = req as unknown as AuthenticatedRequest;
      const result = await securityService.enable2fa(authReq.user.id);
      successResponse({ res, message: '2FA setup initiated. Scan QR code and verify.', data: result, requestId });
    } catch (err) {
      next(err);
    }
  },
);

/**
 * POST /security/2fa/verify
 * Verifies the TOTP code and permanently enables 2FA.
 */
router.post(
  '/2fa/verify',
  requireAuth,
  validate({ body: verify2faSchema }),
  async (req, res, next) => {
    try {
      const requestId = (req as Record<string, unknown>).requestId as string;
      const authReq = req as unknown as AuthenticatedRequest;
      await securityService.verifyAndEnable2fa(authReq.user.id, req.body.code);
      successResponse({ res, message: '2FA enabled successfully', requestId });
    } catch (err) {
      next(err);
    }
  },
);

/**
 * POST /security/2fa/disable
 * Verifies current 2FA code and disables 2FA.
 */
router.post(
  '/2fa/disable',
  requireAuth,
  validate({ body: disable2faSchema }),
  async (req, res, next) => {
    try {
      const requestId = (req as Record<string, unknown>).requestId as string;
      const authReq = req as unknown as AuthenticatedRequest;
      await securityService.disable2fa(authReq.user.id, req.body.code);
      successResponse({ res, message: '2FA disabled', requestId });
    } catch (err) {
      next(err);
    }
  },
);

export default router;
