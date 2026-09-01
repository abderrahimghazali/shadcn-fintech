import { Router } from 'express';

import { requireAuth, requireRole } from '../../middleware/auth.js';
import { validate } from '../../middleware/validate.js';
import { successResponse, paginatedResponse } from '../../utils/apiResponse.js';
import { AppError, UserRole } from '../../types/index.js';
import type { AuthenticatedRequest } from '../../types/index.js';
import {
  startKycSchema,
  submitKycPFSchema,
  submitKycPJSchema,
  uploadDocumentSchema,
  reviewKycSchema,
  listKycReviewsQuerySchema,
} from '../validators/kyc.validators.js';
import * as kycService from '../services/kyc.service.js';

const router = Router();

// ============================================================
// User-facing routes
// ============================================================

/**
 * POST /kyc/start
 */
router.post(
  '/start',
  requireAuth,
  validate({ body: startKycSchema }),
  async (req, res, next) => {
    try {
      const requestId = (req as Record<string, unknown>).requestId as string;
      const authReq = req as unknown as AuthenticatedRequest;
      const submission = await kycService.startKyc(authReq.user.id, req.body.type);
      successResponse({ res, message: 'KYC submission started', data: submission, requestId });
    } catch (err) {
      next(err);
    }
  },
);

/**
 * POST /kyc/submit/pf
 */
router.post(
  '/submit/pf',
  requireAuth,
  validate({ body: submitKycPFSchema }),
  async (req, res, next) => {
    try {
      const requestId = (req as Record<string, unknown>).requestId as string;
      const authReq = req as unknown as AuthenticatedRequest;
      const submission = await kycService.submitKycPF(
        authReq.user.id,
        req.body.submissionId,
        {
          fullName: req.body.fullName,
          cpf: req.body.cpf,
          birthDate: req.body.birthDate,
          postalCode: req.body.postalCode,
          phone: req.body.phone,
        },
      );
      successResponse({ res, message: 'KYC PF submitted', data: submission, requestId });
    } catch (err) {
      next(err);
    }
  },
);

/**
 * POST /kyc/submit/pj
 */
router.post(
  '/submit/pj',
  requireAuth,
  validate({ body: submitKycPJSchema }),
  async (req, res, next) => {
    try {
      const requestId = (req as Record<string, unknown>).requestId as string;
      const authReq = req as unknown as AuthenticatedRequest;
      const submission = await kycService.submitKycPJ(
        authReq.user.id,
        req.body.submissionId,
        {
          legalName: req.body.legalName,
          cnpj: req.body.cnpj,
          tradeName: req.body.tradeName,
          postalCode: req.body.postalCode,
          phone: req.body.phone,
          website: req.body.website,
          responsibleName: req.body.responsibleName,
          responsibleCpf: req.body.responsibleCpf,
        },
      );
      successResponse({ res, message: 'KYC PJ submitted', data: submission, requestId });
    } catch (err) {
      next(err);
    }
  },
);

/**
 * POST /kyc/documents
 * Multipart form upload — file is in req.file, metadata in req.body.
 */
router.post(
  '/documents',
  requireAuth,
  async (req, res, next) => {
    try {
      const requestId = (req as Record<string, unknown>).requestId as string;
      const authReq = req as unknown as AuthenticatedRequest;

      // Parse and validate metadata from body (multipart form fields are strings)
      const parsed = uploadDocumentSchema.safeParse({
        submissionId: req.body.submissionId,
        type: req.body.type,
      });

      if (!parsed.success) {
        const details = parsed.error.issues.map((issue) => ({
          field: issue.path.join('.'),
          message: issue.message,
        }));
        throw new AppError('Validation failed', 400, 'VALIDATION_ERROR', true, details);
      }

      // Check file exists (uploaded via multer or similar — for now we expect
      // the file to be attached via express middleware)
      const file = req.file as {
        buffer: Buffer;
        mimetype: string;
        originalname: string;
        size: number;
      } | undefined;

      if (!file) {
        throw new AppError('No file uploaded', 400, 'FILE_REQUIRED');
      }

      const document = await kycService.uploadDocument(
        authReq.user.id,
        parsed.data.submissionId,
        {
          buffer: file.buffer,
          mimetype: file.mimetype,
          originalname: file.originalname,
          size: file.size,
        },
        parsed.data.type,
      );

      successResponse({ res, message: 'Document uploaded', data: document, requestId });
    } catch (err) {
      next(err);
    }
  },
);

/**
 * GET /kyc/status
 */
router.get(
  '/status',
  requireAuth,
  async (req, res, next) => {
    try {
      const requestId = (req as Record<string, unknown>).requestId as string;
      const authReq = req as unknown as AuthenticatedRequest;
      const status = await kycService.getKycStatus(authReq.user.id);
      successResponse({ res, data: status, requestId });
    } catch (err) {
      next(err);
    }
  },
);

// ============================================================
// Admin routes
// ============================================================

/**
 * GET /kyc/admin/reviews
 */
router.get(
  '/admin/reviews',
  requireAuth,
  requireRole(UserRole.ADMIN),
  validate({ query: listKycReviewsQuerySchema }),
  async (req, res, next) => {
    try {
      const requestId = (req as Record<string, unknown>).requestId as string;
      const query = req.query as { page: number; pageSize: number; type?: 'pf' | 'pj' };
      const result = await kycService.listPendingKycReviews(
        query.page,
        query.pageSize,
        query.type,
      );
      paginatedResponse({
        res,
        data: result.reviews,
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
 * POST /kyc/admin/review
 */
router.post(
  '/admin/review',
  requireAuth,
  requireRole(UserRole.ADMIN),
  validate({ body: reviewKycSchema }),
  async (req, res, next) => {
    try {
      const requestId = (req as Record<string, unknown>).requestId as string;
      const authReq = req as unknown as AuthenticatedRequest;
      await kycService.reviewKyc(
        authReq.user.id,
        req.body.submissionId,
        req.body.decision,
        req.body.reason,
      );
      successResponse({ res, message: `KYC ${req.body.decision}`, requestId });
    } catch (err) {
      next(err);
    }
  },
);

export default router;
