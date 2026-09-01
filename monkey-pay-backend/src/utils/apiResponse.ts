import type { Response } from 'express';

/**
 * Standard response envelope matching Goat Pay's format.
 * Every API response uses this shape for consistency.
 */

interface SuccessResponseOptions<T> {
  res: Response;
  message?: string;
  data?: T;
  statusCode?: number;
  requestId: string;
}

interface ErrorResponseOptions {
  res: Response;
  message: string;
  statusCode?: number;
  code?: string;
  details?: unknown;
  requestId: string;
}

interface PaginatedResponseOptions<T> {
  res: Response;
  message?: string;
  data: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
  statusCode?: number;
  requestId: string;
}

/**
 * Success response — { success: true, message, data, requestId }
 */
export function successResponse<T>({
  res,
  message = 'Success',
  data,
  statusCode = 200,
  requestId,
}: SuccessResponseOptions<T>): Response {
  return res.status(statusCode).json({
    success: true,
    message,
    data: data ?? null,
    requestId,
  });
}

/**
 * Created response — 201 with data.
 */
export function createdResponse<T>({
  res,
  message = 'Resource created successfully',
  data,
  requestId,
}: SuccessResponseOptions<T>): Response {
  return successResponse({ res, message, data, statusCode: 201, requestId });
}

/**
 * Error response — { success: false, message, error, requestId }
 */
export function errorResponse({
  res,
  message,
  statusCode = 500,
  code = 'INTERNAL_ERROR',
  details,
  requestId,
}: ErrorResponseOptions): Response {
  return res.status(statusCode).json({
    success: false,
    message,
    error: {
      code,
      statusCode,
      ...(details !== undefined && { details }),
    },
    requestId,
  });
}

/**
 * Paginated response — includes pagination metadata.
 */
export function paginatedResponse<T>({
  res,
  message = 'Success',
  data,
  total,
  page,
  pageSize,
  totalPages,
  statusCode = 200,
  requestId,
}: PaginatedResponseOptions<T>): Response {
  return res.status(statusCode).json({
    success: true,
    message,
    data,
    pagination: {
      total,
      page,
      pageSize,
      totalPages,
      hasNext: page < totalPages,
      hasPrev: page > 1,
    },
    requestId,
  });
}
