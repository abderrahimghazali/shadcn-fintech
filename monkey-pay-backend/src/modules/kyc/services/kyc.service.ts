import { v4 as uuidv4 } from 'uuid';

import { supabase } from '../../config/supabase.js';
import goatPayClient from '../../lib/goatPayClient.js';
import logger from '../../utils/logger.js';
import { AppError, type KYCSubmission, type KYCDocument, KYCType, KYCStatus } from '../../types/index.js';

// ============================================================
// Types
// ============================================================

export interface KycStatusResponse {
  submission: {
    id: string;
    type: string;
    status: string;
    submittedAt: string | null;
    reviewedAt: string | null;
    rejectionReason: string | null;
    createdAt: string;
  };
  documents: Array<{
    id: string;
    documentType: string;
    status: string;
    createdAt: string;
  }>;
}

export interface PendingKycReview {
  id: string;
  userId: string;
  type: string;
  status: string;
  submittedAt: string;
  user: {
    id: string;
    email: string;
    name: string | null;
  };
}

// ============================================================
// Service methods
// ============================================================

/**
 * Start a new KYC submission.
 */
export async function startKyc(
  userId: string,
  type: 'pf' | 'pj',
): Promise<KYCSubmission> {
  // Check if user already has a non-terminal KYC submission
  const { data: existing } = await supabase
    .from('kyc_submissions')
    .select('*')
    .eq('user_id', userId)
    .in('status', ['pending', 'submitted', 'under_review'])
    .single();

  if (existing) {
    throw new AppError(
      'You already have an active KYC submission',
      409,
      'KYC_ALREADY_IN_PROGRESS',
    );
  }

  const submissionId = uuidv4();

  const { data: submission, error } = await supabase
    .from('kyc_submissions')
    .insert({
      id: submissionId,
      user_id: userId,
      type: type.toUpperCase() as KYCType,
      status: KYCStatus.PENDING,
    })
    .select('*')
    .single();

  if (error || !submission) {
    logger.error({ error, userId, type }, 'Failed to create KYC submission');
    throw new AppError('Failed to start KYC', 500, 'KYC_START_FAILED');
  }

  logger.info({ userId, submissionId, type }, 'KYC submission started');

  return submission;
}

/**
 * Submit KYC data for PF (individual) and create Goat Pay subaccount.
 */
export async function submitKycPF(
  userId: string,
  submissionId: string,
  data: {
    fullName: string;
    cpf: string;
    birthDate: string;
    postalCode: string;
    phone: string;
  },
): Promise<KYCSubmission> {
  // Verify submission exists and belongs to user
  const submission = await getAndValidateSubmission(userId, submissionId, KYCStatus.PENDING);

  // Fetch user email for Goat Pay
  const { data: user } = await supabase
    .from('users')
    .select('email')
    .eq('id', userId)
    .single();

  if (!user) {
    throw new AppError('User not found', 404, 'USER_NOT_FOUND');
  }

  // Update submission to 'submitted'
  const { error: updateError } = await supabase
    .from('kyc_submissions')
    .update({
      status: KYCStatus.SUBMITTED,
      submitted_at: new Date().toISOString(),
      external_reference: userId,
    })
    .eq('id', submissionId);

  if (updateError) {
    logger.error({ error: updateError, submissionId }, 'Failed to update KYC submission');
    throw new AppError('Failed to submit KYC', 500, 'KYC_SUBMIT_FAILED');
  }

  // Update or create user profile with KYC data
  const { error: profileError } = await supabase
    .from('user_profiles')
    .update({
      full_name: data.fullName,
      document: data.cpf,
      postal_code: data.postalCode,
      phone: data.phone,
      updated_at: new Date().toISOString(),
    })
    .eq('user_id', userId);

  if (profileError) {
    logger.error({ error: profileError, userId }, 'Failed to update user profile from KYC data');
  }

  // Call Goat Pay subaccount/create for PF
  let gpSubaccountId: string | undefined;
  try {
    const gpResult = await goatPayClient.createSubaccount({
      externalReference: userId,
      fullName: data.fullName,
      cpf: data.cpf,
      birthDate: data.birthDate,
      postalCode: data.postalCode,
      phone: data.phone,
      email: user.email,
    });

    gpSubaccountId = (gpResult as { id?: string; subaccountId?: string }).id
      ?? (gpResult as { id?: string; subaccountId?: string }).subaccountId
      ?? undefined;
  } catch (err) {
    logger.error({ err, userId, submissionId }, 'Goat Pay subaccount creation failed for PF');
    // Don't fail the submission — KYC goes to submitted, admin can retry
  }

  // If Goat Pay returned a subaccount ID, store it
  if (gpSubaccountId) {
    // Create subaccounts mapping
    await supabase.from('subaccounts').insert({
      id: uuidv4(),
      user_id: userId,
      goatpay_subaccount_id: gpSubaccountId,
      external_reference: userId,
      lock_status: 'none',
      is_active: true,
    });

    // Update KYC submission with Goat Pay subaccount ID
    await supabase
      .from('kyc_submissions')
      .update({ goatpay_subaccount_id: gpSubaccountId })
      .eq('id', submissionId);
  }

  // Move to under_review
  const kycStatus = gpSubaccountId ? KYCStatus.UNDER_REVIEW : KYCStatus.SUBMITTED;
  await supabase
    .from('kyc_submissions')
    .update({ status: kycStatus })
    .eq('id', submissionId);

  logger.info({ userId, submissionId, gpSubaccountId, kycStatus }, 'KYC PF submitted');

  // Return updated submission
  const { data: updated } = await supabase
    .from('kyc_submissions')
    .select('*')
    .eq('id', submissionId)
    .single();

  return updated!;
}

/**
 * Submit KYC data for PJ (corporate) and create Goat Pay subaccount.
 */
export async function submitKycPJ(
  userId: string,
  submissionId: string,
  data: {
    legalName: string;
    cnpj: string;
    tradeName?: string;
    postalCode: string;
    phone: string;
    website?: string;
    responsibleName: string;
    responsibleCpf: string;
  },
): Promise<KYCSubmission> {
  // Verify submission exists and belongs to user
  const submission = await getAndValidateSubmission(userId, submissionId, KYCStatus.PENDING);

  // Fetch user email for Goat Pay
  const { data: user } = await supabase
    .from('users')
    .select('email')
    .eq('id', userId)
    .single();

  if (!user) {
    throw new AppError('User not found', 404, 'USER_NOT_FOUND');
  }

  // Update submission to 'submitted'
  const { error: updateError } = await supabase
    .from('kyc_submissions')
    .update({
      status: KYCStatus.SUBMITTED,
      submitted_at: new Date().toISOString(),
      external_reference: userId,
    })
    .eq('id', submissionId);

  if (updateError) {
    logger.error({ error: updateError, submissionId }, 'Failed to update KYC submission');
    throw new AppError('Failed to submit KYC', 500, 'KYC_SUBMIT_FAILED');
  }

  // Update user profile with KYC data
  await supabase
    .from('user_profiles')
    .update({
      full_name: data.responsibleName,
      business_name: data.legalName,
      document: data.cnpj,
      postal_code: data.postalCode,
      phone: data.phone,
      updated_at: new Date().toISOString(),
    })
    .eq('user_id', userId);

  // Call Goat Pay subaccount/create for PJ
  let gpSubaccountId: string | undefined;
  try {
    const gpResult = await goatPayClient.createSubaccount({
      externalReference: userId,
      corporateName: data.legalName,
      cnpj: data.cnpj,
      tradingName: data.tradeName,
      postalCode: data.postalCode,
      phone: data.phone,
      email: user.email,
    });

    gpSubaccountId = (gpResult as { id?: string; subaccountId?: string }).id
      ?? (gpResult as { id?: string; subaccountId?: string }).subaccountId
      ?? undefined;
  } catch (err) {
    logger.error({ err, userId, submissionId }, 'Goat Pay subaccount creation failed for PJ');
  }

  // Store subaccount mapping if Goat Pay returned an ID
  if (gpSubaccountId) {
    await supabase.from('subaccounts').insert({
      id: uuidv4(),
      user_id: userId,
      goatpay_subaccount_id: gpSubaccountId,
      external_reference: userId,
      lock_status: 'none',
      is_active: true,
    });

    await supabase
      .from('kyc_submissions')
      .update({ goatpay_subaccount_id: gpSubaccountId })
      .eq('id', submissionId);
  }

  // Move to under_review
  const kycStatus = gpSubaccountId ? KYCStatus.UNDER_REVIEW : KYCStatus.SUBMITTED;
  await supabase
    .from('kyc_submissions')
    .update({ status: kycStatus })
    .eq('id', submissionId);

  logger.info({ userId, submissionId, gpSubaccountId, kycStatus }, 'KYC PJ submitted');

  const { data: updated } = await supabase
    .from('kyc_submissions')
    .select('*')
    .eq('id', submissionId)
    .single();

  return updated!;
}

/**
 * Upload a KYC document to Supabase Storage.
 */
export async function uploadDocument(
  userId: string,
  submissionId: string,
  file: { buffer: Buffer; mimetype: string; originalname: string; size: number },
  docType: string,
): Promise<KYCDocument> {
  // Verify submission exists and belongs to user
  await getAndValidateSubmission(userId, submissionId, KYCStatus.PENDING, KYCStatus.SUBMITTED);

  // Validate file size (max 10MB)
  if (file.size > 10 * 1024 * 1024) {
    throw new AppError('File too large. Maximum size is 10MB.', 400, 'FILE_TOO_LARGE');
  }

  // Validate file type
  const allowedTypes = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];
  if (!allowedTypes.includes(file.mimetype)) {
    throw new AppError(
      'Invalid file type. Allowed: JPEG, PNG, WebP, PDF',
      400,
      'INVALID_FILE_TYPE',
    );
  }

  // Generate storage path
  const ext = file.originalname.split('.').pop() ?? 'bin';
  const storagePath = `${userId}/${submissionId}/${docType}_${Date.now()}.${ext}`;

  // Upload to Supabase Storage (kyc-documents bucket)
 const { data: uploadData, error: uploadError } = await supabase.storage
    .from('kyc-documents')
    .upload(storagePath, file.buffer, {
      contentType: file.mimetype,
      upsert: false,
    });

  if (uploadError || !uploadData) {
    logger.error({ error: uploadError, userId, storagePath }, 'Failed to upload KYC document');
    throw new AppError('Failed to upload document', 500, 'DOCUMENT_UPLOAD_FAILED');
  }

  // Get public URL (or signed URL for private bucket)
  const { data: urlData } = supabase.storage
    .from('kyc-documents')
    .getPublicUrl(storagePath);
  const fileUrl = urlData.publicUrl;

  // Create kyc_documents record
  const docId = uuidv4();
  const { data: doc, error: docError } = await supabase
    .from('kyc_documents')
    .insert({
      id: docId,
      submission_id: submissionId,
      user_id: userId,
      document_type: docType,
      file_url: fileUrl,
      status: 'pending',
    })
    .select('*')
    .single();

  if (docError || !doc) {
    logger.error({ error: docError, submissionId, docType }, 'Failed to create document record');
    throw new AppError('Failed to save document record', 500, 'DOCUMENT_RECORD_FAILED');
  }

  logger.info({ userId, submissionId, docType, docId }, 'KYC document uploaded');

  return doc;
}

/**
 * Get the current KYC status for a user.
 */
export async function getKycStatus(userId: string): Promise<KycStatusResponse> {
  // Get the latest KYC submission for this user
  const { data: submission, error } = await supabase
    .from('kyc_submissions')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(1)
    .single();

  if (error || !submission) {
    return {
      submission: null as unknown as KycStatusResponse['submission'],
      documents: [],
    };
  }

  // Get documents for this submission
  const { data: documents } = await supabase
    .from('kyc_documents')
    .select('id, document_type, status, created_at')
    .eq('submission_id', submission.id)
    .order('created_at', { ascending: true });

  return {
    submission: {
      id: submission.id,
      type: submission.type,
      status: submission.status,
      submittedAt: submission.submitted_at,
      reviewedAt: submission.reviewed_at,
      rejectionReason: submission.rejection_reason,
      createdAt: submission.created_at,
    },
    documents: (documents ?? []).map((doc) => ({
      id: doc.id,
      documentType: doc.document_type,
      status: doc.status,
      createdAt: doc.created_at,
    })),
  };
}

/**
 * List pending KYC reviews (admin only).
 */
export async function listPendingKycReviews(
  page: number,
  pageSize: number,
  type?: 'pf' | 'pj',
): Promise<{
  reviews: PendingKycReview[];
  total: number;
  totalPages: number;
}> {
  let query = supabase
    .from('kyc_submissions')
    .select('*, users!inner(id, email, user_profiles(full_name))', { count: 'exact' })
    .in('status', [KYCStatus.SUBMITTED, KYCStatus.UNDER_REVIEW])
    .order('submitted_at', { ascending: true });

  if (type) {
    query = query.eq('type', type.toUpperCase());
  }

  const offset = (page - 1) * pageSize;
  query = query.range(offset, offset + pageSize - 1);

  const { data, error, count } = await query;

  if (error) {
    logger.error({ error }, 'Failed to list pending KYC reviews');
    throw new AppError('Failed to list KYC reviews', 500, 'KYC_LIST_FAILED');
  }

  const reviews: PendingKycReview[] = (data ?? []).map((row: Record<string, unknown>) => {
    const userData = row.users as { id: string; email: string; user_profiles?: { full_name?: string } | null };
    return {
      id: row.id as string,
      userId: row.user_id as string,
      type: row.type as string,
      status: row.status as string,
      submittedAt: row.submitted_at as string,
      user: {
        id: userData.id,
        email: userData.email,
        name: userData.user_profiles?.full_name ?? null,
      },
    };
  });

  const total = count ?? 0;
  const totalPages = Math.ceil(total / pageSize);

  return { reviews, total, totalPages };
}

/**
 * Review (approve/reject) a KYC submission (admin only).
 */
export async function reviewKyc(
  adminUserId: string,
  submissionId: string,
  decision: 'approved' | 'rejected',
  reason?: string,
): Promise<void> {
  // Get the submission
  const { data: submission, error: findError } = await supabase
    .from('kyc_submissions')
    .select('*')
    .eq('id', submissionId)
    .single();

  if (findError || !submission) {
    throw new AppError('KYC submission not found', 404, 'KYC_NOT_FOUND');
  }

  if (submission.status !== KYCStatus.SUBMITTED && submission.status !== KYCStatus.UNDER_REVIEW) {
    throw new AppError(
      `Cannot review a KYC submission with status: ${submission.status}`,
      409,
      'KYC_INVALID_STATUS',
    );
  }

  const newStatus = decision === 'approved' ? KYCStatus.APPROVED : KYCStatus.REJECTED;

  // Update submission
  const { error: updateError } = await supabase
    .from('kyc_submissions')
    .update({
      status: newStatus,
      reviewed_at: new Date().toISOString(),
      reviewed_by: adminUserId,
      rejection_reason: decision === 'rejected' ? reason : null,
    })
    .eq('id', submissionId);

  if (updateError) {
    logger.error({ error: updateError, submissionId }, 'Failed to update KYC review');
    throw new AppError('Failed to review KYC', 500, 'KYC_REVIEW_FAILED');
  }

  // If approved, mark user as verified
  if (decision === 'approved') {
    await supabase
      .from('users')
      .update({ is_verified: true, updated_at: new Date().toISOString() })
      .eq('id', submission.user_id);
  }

  // Audit log
  await supabase.from('audit_logs').insert({
    id: crypto.randomUUID(),
    user_id: adminUserId,
    action: 'review_kyc',
    resource_type: 'kyc_submission',
    resource_id: submissionId,
    details: { decision, reason: reason ?? null, previousStatus: submission.status },
    ip_address: null,
    user_agent: null,
    created_at: new Date().toISOString(),
  });

  logger.info({ adminUserId, submissionId, decision, reason }, 'KYC reviewed');
}

// ============================================================
// Helpers
// ============================================================

/**
 * Get a KYC submission and validate it belongs to the user and has the expected status.
 */
async function getAndValidateSubmission(
  userId: string,
  submissionId: string,
  ...allowedStatuses: KYCStatus[]
): Promise<KYCSubmission> {
  const { data: submission, error } = await supabase
    .from('kyc_submissions')
    .select('*')
    .eq('id', submissionId)
    .eq('user_id', userId)
    .single();

  if (error || !submission) {
    throw new AppError('KYC submission not found', 404, 'KYC_NOT_FOUND');
  }

  if (!allowedStatuses.includes(submission.status as KYCStatus)) {
    throw new AppError(
      `KYC submission has invalid status: ${submission.status}. Expected: ${allowedStatuses.join(', ')}`,
      409,
      'KYC_INVALID_STATUS',
    );
  }

  return submission;
}
