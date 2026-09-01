import { Router } from 'express';
import { RateLimiterMemory } from 'rate-limiter-flexible';

import { validate } from '../../middleware/validate.js';
import { requireAuth } from '../../middleware/auth.js';
import { successResponse, createdResponse } from '../../utils/apiResponse.js';
import { AppError } from '../../types/index.js';
import type { AuthenticatedRequest } from '../../types/index.js';
import {
  signupSchema,
  loginSchema,
  refreshTokenSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
  updatePasswordSchema,
} from '../validators/auth.validators.js';
import * as authService from '../services/auth.service.js';

const router = Router();

// ============================================================
// Route-specific rate limiters
// ============================================================

const signupLimiter = new RateLimiterMemory({
  points: 3,
  duration: 60,
  blockDuration: 300,
});

const loginLimiter = new RateLimiterMemory({
  points: 5,
  duration: 60,
  blockDuration: 300,
});

const forgotPasswordLimiter = new RateLimiterMemory({
  points: 2,
  duration: 60,
  blockDuration: 300,
});

function rateLimit(limiter: RateLimiterMemory, res: import('express').Response, key: string): Promise<void> {
  return limiter.consume(key).catch((limiterRes) => {
    const msBeforeNext = limiterRes.msBeforeNext;
    res.set({
      'Retry-After': Math.ceil(msBeforeNext / 1000).toString(),
      'X-RateLimit-Limit': limiterRes.limit.toString(),
      'X-RateLimit-Remaining': limiterRes.remainingPoints.toString(),
      'X-RateLimit-Reset': new Date(Date.now() + msBeforeNext).toISOString(),
    });
    throw new AppError('Too many requests. Please retry later.', 429, 'RATE_LIMITED');
  });
}

// ============================================================
// Routes
// ============================================================

/**
 * POST /auth/signup
 */
router.post(
  '/signup',
  validate({ body: signupSchema }),
  async (req, res, next) => {
    try {
      const requestId = (req as Record<string, unknown>).requestId as string;
      await rateLimit(signupLimiter, res, req.body.email);
      const result = await authService.signup(req.body, req);
      createdResponse({ res, message: 'Account created successfully', data: result, requestId });
    } catch (err) {
      next(err);
    }
  },
);

/**
 * POST /auth/login
 */
router.post(
  '/login',
  validate({ body: loginSchema }),
  async (req, res, next) => {
    try {
      const requestId = (req as Record<string, unknown>).requestId as string;
      await rateLimit(loginLimiter, res, req.body.email);
      const result = await authService.login(req.body.email, req.body.password, req);
      successResponse({ res, message: 'Login successful', data: result, requestId });
    } catch (err) {
      next(err);
    }
  },
);

/**
 * POST /auth/refresh
 */
router.post(
  '/refresh',
  validate({ body: refreshTokenSchema }),
  async (req, res, next) => {
    try {
      const requestId = (req as Record<string, unknown>).requestId as string;
      const tokens = await authService.refreshToken(req.body.refreshToken);
      successResponse({ res, message: 'Token refreshed', data: tokens, requestId });
    } catch (err) {
      next(err);
    }
  },
);

/**
 * POST /auth/logout
 */
router.post(
  '/logout',
  requireAuth,
  async (req, res, next) => {
    try {
      const requestId = (req as Record<string, unknown>).requestId as string;
      const authReq = req as unknown as AuthenticatedRequest;
      // We need a session identifier. We'll use the authorization header token's jti or
      // require the client to send the refresh token in body. For simplicity, we'll
      // extract from the Authorization header and attempt to revoke the latest session.
      // A more robust approach would require the refresh token or session ID in the body.
      const authHeader = req.headers.authorization;
      const sessionId = req.body?.sessionId as string | undefined;
      if (!sessionId) {
        throw new AppError('Session ID is required for logout', 400, 'SESSION_ID_REQUIRED');
      }
      await authService.logout(authReq.user.id, sessionId);
      successResponse({ res, message: 'Logged out successfully', requestId });
    } catch (err) {
      next(err);
    }
  },
);

/**
 * POST /auth/forgot-password
 */
router.post(
  '/forgot-password',
  validate({ body: forgotPasswordSchema }),
  async (req, res, next) => {
    try {
      const requestId = (req as Record<string, unknown>).requestId as string;
      await rateLimit(forgotPasswordLimiter, res, req.body.email);
      await authService.forgotPassword(req.body.email);
      successResponse({
        res,
        message: 'If an account with this email exists, a reset link has been sent.',
        requestId,
      });
    } catch (err) {
      next(err);
    }
  },
);

/**
 * POST /auth/reset-password
 */
router.post(
  '/reset-password',
  validate({ body: resetPasswordSchema }),
  async (req, res, next) => {
    try {
      const requestId = (req as Record<string, unknown>).requestId as string;
      await authService.resetPassword(req.body.token, req.body.newPassword);
      successResponse({ res, message: 'Password reset successfully', requestId });
    } catch (err) {
      next(err);
    }
  },
);

/**
 * PUT /auth/password
 */
router.put(
  '/password',
  requireAuth,
  validate({ body: updatePasswordSchema }),
  async (req, res, next) => {
    try {
      const requestId = (req as Record<string, unknown>).requestId as string;
      const authReq = req as unknown as AuthenticatedRequest;
      const tokens = await authService.updatePassword(
        authReq.user.id,
        req.body.currentPassword,
        req.body.newPassword,
        req,
      );
      successResponse({ res, message: 'Password updated successfully', data: tokens, requestId });
    } catch (err) {
      next(err);
    }
  },
);

export default router;
