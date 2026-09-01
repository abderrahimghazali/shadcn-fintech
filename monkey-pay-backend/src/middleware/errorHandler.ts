import type { Request, Response, NextFunction } from 'express';
import { ZodError } from 'zod';
import jwt from 'jsonwebtoken';
import { isProduction } from '../config/env.js';
import { AppError } from '../types/index.js';
import logger from '../utils/logger.js';

/**
 * Global error handler middleware.
 * Must be the last middleware in the chain (after all routes).
 * Handles known error types and never leaks stack traces in production.
 */
export function errorHandler(
  err: Error,
  req: Request,
  res: Response,
  _next: NextFunction,
): void {
  const requestId = (req as Record<string, unknown>).requestId as string ?? 'unknown';

  // --- AppError (our own operational errors) ---
  if (err instanceof AppError) {
    logger.warn({ requestId, code: err.code, statusCode: err.statusCode }, err.message);
    res.status(err.statusCode).json({
      success: false,
      message: err.message,
      error: {
        code: err.code,
        statusCode: err.statusCode,
        ...(err.details !== undefined && { details: err.details }),
      },
      requestId,
    });
    return;
  }

  // --- ZodError (validation from middleware not caught earlier) ---
  if (err instanceof ZodError) {
    const details = err.issues.map((issue) => ({
      field: issue.path.join('.'),
      message: issue.message,
    }));
    logger.warn({ requestId, details }, 'Validation error (unhandled)');
    res.status(400).json({
      success: false,
      message: 'Validation failed',
      error: {
        code: 'VALIDATION_ERROR',
        statusCode: 400,
        details,
      },
      requestId,
    });
    return;
  }

  // --- JWT errors ---
  if (err instanceof jwt.TokenExpiredError) {
    res.status(401).json({
      success: false,
      message: 'Token expired',
      error: { code: 'TOKEN_EXPIRED', statusCode: 401 },
      requestId,
    });
    return;
  }
  if (err instanceof jwt.JsonWebTokenError) {
    res.status(401).json({
      success: false,
      message: 'Invalid token',
      error: { code: 'TOKEN_INVALID', statusCode: 401 },
      requestId,
    });
    return;
  }

  // --- SyntaxError (malformed JSON body) ---
  if (err instanceof SyntaxError && 'body' in err) {
    res.status(400).json({
      success: false,
      message: 'Malformed JSON in request body',
      error: { code: 'INVALID_JSON', statusCode: 400 },
      requestId,
    });
    return;
  }

  // --- Unknown / unexpected errors ---
  logger.error(
    { requestId, err, stack: err.stack },
    'Unhandled error',
  );

  res.status(500).json({
    success: false,
    message: isProduction
      ? 'An internal error occurred. Please try again later.'
      : err.message,
    error: {
      code: 'INTERNAL_ERROR',
      statusCode: 500,
      ...(isProduction
        ? undefined
        : { stack: err.stack }),
    },
    requestId,
  });
}
