import { z } from 'zod';

/**
 * CPF regex — Brazilian individual taxpayer ID (XXX.XXX.XXX-XX)
 */
const cpfRegex = /^\d{3}\.\d{3}\.\d{3}-\d{2}$/;

/**
 * CNPJ regex — Brazilian company ID (XX.XXX.XXX/XXXX-XX)
 */
const cnpjRegex = /^\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}$/;

export const startKycSchema = z.object({
  type: z.enum(['pf', 'pj']),
});

export type StartKycInput = z.infer<typeof startKycSchema>;

export const submitKycPFSchema = z.object({
  submissionId: z.string().uuid('Invalid submission ID'),
  fullName: z.string().min(2, 'Full name is required').max(255),
  cpf: z.string().regex(cpfRegex, 'Invalid CPF format (XXX.XXX.XXX-XX)'),
  birthDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Birth date must be in ISO format (YYYY-MM-DD)'),
  postalCode: z.string().min(1, 'Postal code is required').max(20),
  phone: z.string().min(10, 'Phone is required').max(20),
});

export type SubmitKycPFInput = z.infer<typeof submitKycPFSchema>;

export const submitKycPJSchema = z.object({
  submissionId: z.string().uuid('Invalid submission ID'),
  legalName: z.string().min(2, 'Legal name is required').max(255),
  cnpj: z.string().regex(cnpjRegex, 'Invalid CNPJ format (XX.XXX.XXX/XXXX-XX)'),
  tradeName: z.string().max(255).optional(),
  postalCode: z.string().min(1, 'Postal code is required').max(20),
  phone: z.string().min(10, 'Phone is required').max(20),
  website: z.string().url('Invalid website URL').max(2048).optional(),
  responsibleName: z.string().min(2, 'Responsible name is required').max(255),
  responsibleCpf: z.string().regex(cpfRegex, 'Invalid responsible CPF format (XXX.XXX.XXX-XX)'),
});

export type SubmitKycPJInput = z.infer<typeof submitKycPJSchema>;

export const uploadDocumentSchema = z.object({
  submissionId: z.string().uuid('Invalid submission ID'),
  type: z.enum([
    'identity_front',
    'identity_back',
    'proof_of_address',
    'selfie',
    'company_document',
    'proof_of_legal_representative',
  ]),
});

export type UploadDocumentInput = z.infer<typeof uploadDocumentSchema>;

export const reviewKycSchema = z.object({
  submissionId: z.string().uuid('Invalid submission ID'),
  decision: z.enum(['approved', 'rejected']),
  reason: z.string().optional(),
}).refine(
  (data) => data.decision === 'approved' || (data.reason && data.reason.length > 0),
  {
    message: 'Rejection reason is required when decision is "rejected"',
    path: ['reason'],
  },
);

export type ReviewKycInput = z.infer<typeof reviewKycSchema>;

export const listKycReviewsQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(100).default(20),
  type: z.enum(['pf', 'pj']).optional(),
});

export type ListKycReviewsQuery = z.infer<typeof listKycReviewsQuerySchema>;
