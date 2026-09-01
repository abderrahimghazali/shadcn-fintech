import jwt from 'jsonwebtoken';
import type { Request, Response, NextFunction } from 'express';
import { env } from '../config/env.js';
import { AppError, type AuthenticatedRequest, type OptionalAuthRequest, type UserRole } from '../types/index.js';

interface JwtPayload {
  sub: string;
  email: string;
  role: UserRole;
  iat?: number;
  exp?: number;
}

/**
 * Extract and verify JWT from Authorization: Bearer <token> header.
 * Attaches user object (id, email, role) to req.user.
 */
function extractUser(req: Request): JwtPayload {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    throw new AppError('Missing or invalid Authorization header', 401, 'UNAUTHORIZED');
  }

  const token = authHeader.slice(7);
  let payload: JwtPayload;

  try {
    payload = jwt.verify(token, env.JWT_SECRET) as JwtPayload;
  } catch (err) {
    if (err instanceof jwt.TokenExpiredError) {
      throw new AppError('Access token expired', 401, 'TOKEN_EXPIRED');
    }
    if (err instanceof jwt.JsonWebTokenError) {
      throw new AppError('Invalid access token', 401, 'TOKEN_INVALID');
    }
    throw new AppError('Authentication failed', 401, 'UNAUTHORIZED');
  }

  return payload;
}

/**
 * Required auth — rejects unauthenticated requests with 401.
 */
export function requireAuth(
  req: Request,
  _res: Response,
  next: NextFunction,
): void {
  try {
    const payload = extractUser(req);
    const authReq = req as unknown as AuthenticatedRequest;
    authReq.user = {
      id: payload.sub,
      email: payload.email,
      role: payload.role,
    };
    next();
  } catch (err) {
    next(err);
  }
}

/**
 * Optional auth — attaches user if token is present, continues without if not.
 */
export function optionalAuth(
  req: Request,
  _res: Response,
  next: NextFunction,
): void {
  try {
    const payload = extractUser(req);
    const optReq = req as unknown as OptionalAuthRequest;
    optReq.user = {
      id: payload.sub,
      email: payload.email,
      role: payload.role,
    };
  } catch {
    // No user attached — that's fine for optional auth
  }
  next();
}

/**
 * Role-based authorization middleware factory.
 * Usage: requireRole(UserRole.ADMIN, UserRole.SUPPORT)
 */
export function requireRole(...roles: UserRole[]) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    try {
      const payload = extractUser(req);
      if (!roles.includes(payload.role)) {
        throw new AppError('Insufficient permissions', 403, 'FORBIDDEN');
      }
      const authReq = req as unknown as AuthenticatedRequest;
      authReq.user = {
        id: payload.sub,
        email: payload.email,
        role: payload.role,
      };
      next();
    } catch (err) {
      next(err);
    }
  };
}
