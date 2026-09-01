import { z, type ZodSchema, type ZodError } from 'zod';
import type { Request, Response, NextFunction } from 'express';
import { AppError } from '../types/index.js';

interface ValidateOptions {
  body?: ZodSchema;
  params?: ZodSchema;
  query?: ZodSchema;
}

function formatZodErrors(error: ZodError): Array<{ field: string; message: string }> {
  return error.issues.map((issue) => ({
    field: issue.path.join('.'),
    message: issue.message,
  }));
}

/**
 * Generic Zod validation middleware.
 * Validates req.body, req.params, and/or req.query against provided schemas.
 * On failure, returns 400 with structured error details.
 */
export function validate(options: ValidateOptions) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    try {
      if (options.body) {
        req.body = options.body.parse(req.body);
      }
      if (options.params) {
        req.params = options.params.parse(req.params);
      }
      if (options.query) {
        req.query = options.query.parse(req.query);
      }
      next();
    } catch (err) {
      if (err instanceof z.ZodError) {
        const details = formatZodErrors(err);
        next(
          new AppError(
            'Validation failed',
            400,
            'VALIDATION_ERROR',
            true,
            details,
          ),
        );
      } else {
        next(err);
      }
    }
  };
}
