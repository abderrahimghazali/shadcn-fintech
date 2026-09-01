import { RateLimiterMemory, RateLimiterRes } from 'rate-limiter-flexible';
import type { Request, Response, NextFunction } from 'express';
import { env } from '../config/env.js';
import { AppError } from '../types/index.js';

// ============================================================
// 3-Tier Rate Limiting
// 1. Global — all requests to the API
// 2. Per-user — JWT-authenticated requests
// 3. Per-api-key — API key authenticated requests
// ============================================================

/**
 * Global rate limiter — applies to every request.
 */
export const globalLimiter = new RateLimiterMemory({
  points: env.RATE_LIMIT_GLOBAL_MAX,
  duration: Math.ceil(env.RATE_LIMIT_GLOBAL_WINDOW_MS / 1000),
  blockDuration: 60, // block for 60 seconds if exceeded
});

/**
 * Per-user rate limiter — keyed by user ID from JWT.
 */
export const userLimiter = new RateLimiterMemory({
  points: env.RATE_LIMIT_USER_MAX,
  duration: Math.ceil(env.RATE_LIMIT_USER_WINDOW_MS / 1000),
  blockDuration: 60,
});

/**
 * Per-API-key rate limiter — keyed by API key ID.
 */
export const apiKeyLimiter = new RateLimiterMemory({
  points: env.RATE_LIMIT_API_KEY_MAX,
  duration: Math.ceil(env.RATE_LIMIT_API_KEY_WINDOW_MS / 1000),
  blockDuration: 60,
});

function getRequestId(req: Request): string {
  return (req as Record<string, unknown>).requestId as string ?? 'unknown';
}

function sendRateLimitError(res: Response, limiterRes: RateLimiterRes, requestId: string): void {
  const msBeforeNext = limiterRes.msBeforeNext;
  res.set({
    'Retry-After': Math.ceil(msBeforeNext / 1000).toString(),
    'X-RateLimit-Limit': limiterRes.limit.toString(),
    'X-RateLimit-Remaining': limiterRes.remainingPoints.toString(),
    'X-RateLimit-Reset': new Date(Date.now() + msBeforeNext).toISOString(),
  });

  res.status(429).json({
    success: false,
    message: 'Too many requests. Please retry later.',
    error: {
      code: 'RATE_LIMITED',
      statusCode: 429,
      retryAfterMs: msBeforeNext,
    },
    requestId,
  });
}

/**
 * Middleware: apply global rate limit to every request.
 */
export function globalRateLimitMiddleware(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  globalLimiter
    .consume(getRequestId(req))
    .then(() => next())
    .catch((limiterRes: RateLimiterRes) => {
      sendRateLimitError(res, limiterRes, getRequestId(req));
    });
}

/**
 * Middleware factory: apply per-user rate limit.
 * Call after requireAuth so req.user is populated.
 */
export function userRateLimitMiddleware(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  const user = (req as Record<string, unknown>).user as { id: string } | undefined;
  if (!user) {
    next();
    return;
  }

  userLimiter
    .consume(user.id)
    .then(() => next())
    .catch((limiterRes: RateLimiterRes) => {
      sendRateLimitError(res, limiterRes, getRequestId(req));
    });
}

/**
 * Middleware factory: apply per-API-key rate limit.
 * Call after requireApiKey so req.apiKey is populated.
 */
export function apiKeyRateLimitMiddleware(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  const apiKey = (req as Record<string, unknown>).apiKey as { id: string } | undefined;
  if (!apiKey) {
    next();
    return;
  }

  apiKeyLimiter
    .consume(apiKey.id)
    .then(() => next())
    .catch((limiterRes: RateLimiterRes) => {
      sendRateLimitError(res, limiterRes, getRequestId(req));
    });
}
