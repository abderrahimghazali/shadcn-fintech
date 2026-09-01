import { v4 as uuidv4 } from 'uuid';
import type { Request, Response, NextFunction } from 'express';

/**
 * Middleware that generates a unique requestId for every request and attaches it to
 * the request object and the response header (X-Request-Id).
 * If a requestId is already provided via the X-Request-Id header, it is reused.
 */
export function requestIdMiddleware(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  const requestId = (req.headers['x-request-id'] as string | undefined) ?? uuidv4();
  (req as Record<string, unknown>).requestId = requestId;
  res.setHeader('X-Request-Id', requestId);
  next();
}
