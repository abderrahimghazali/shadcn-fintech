import type { Request } from 'express';

// ============================================================
// Enums
// ============================================================

export enum UserRole {
  ADMIN = 'admin',
  MERCHANT = 'merchant',
  SUPPORT = 'support',
}

export enum KYCStatus {
  PENDING = 'pending',
  SUBMITTED = 'submitted',
  UNDER_REVIEW = 'under_review',
  APPROVED = 'approved',
  REJECTED = 'rejected',
}

export enum KYCType {
  PF = 'PF',
  PJ = 'PJ',
}

export enum TransactionStatus {
  REQUESTED = 'requested',
  PENDING = 'pending',
  PROCESSING = 'processing',
  COMPLETED = 'completed',
  FAILED = 'failed',
  CANCELED = 'canceled',
  REVERSED = 'reversed',
}

export enum TransactionType {
  PIX_IN = 'pix_in',
  PIX_OUT = 'pix_out',
  REFUND = 'refund',
  TRANSFER_INTERNAL = 'transfer_internal',
  TRANSFER_SCHEDULED = 'transfer_scheduled',
  SUBACCOUNT_PROFIT = 'subaccount_profit',
}

export enum RefundStatus {
  REQUESTED = 'requested',
  PROCESSING = 'processing',
  COMPLETED = 'completed',
  FAILED = 'failed',
}

export enum MEDStatus {
  OPEN = 'OPEN',
  UNDER_REVIEW = 'UNDER_REVIEW',
  ACCEPTED = 'ACCEPTED',
  REJECTED = 'REJECTED',
  CANCELED = 'CANCELED',
  EXPIRED = 'EXPIRED',
}

// ============================================================
// Database row types (matching Supabase tables)
// ============================================================

export interface User {
  id: string;
  email: string;
  password_hash: string;
  role: UserRole;
  is_active: boolean;
  is_verified: boolean;
  created_at: string;
  updated_at: string;
}

export interface UserProfile {
  id: string;
  user_id: string;
  full_name: string | null;
  phone: string | null;
  avatar_url: string | null;
  business_name: string | null;
  document: string | null;
  postal_code: string | null;
  city: string | null;
  state: string | null;
  country: string | null;
  created_at: string;
  updated_at: string;
}

export interface KYCSubmission {
  id: string;
  user_id: string;
  type: KYCType;
  status: KYCStatus;
  submitted_at: string | null;
  reviewed_at: string | null;
  reviewed_by: string | null;
  rejection_reason: string | null;
  goatpay_subaccount_id: string | null;
  external_reference: string | null;
  created_at: string;
  updated_at: string;
}

export interface KYCDocument {
  id: string;
  submission_id: string;
  user_id: string;
  document_type: string;
  file_url: string;
  status: 'pending' | 'approved' | 'rejected';
  rejection_reason: string | null;
  created_at: string;
  updated_at: string;
}

export interface Subaccount {
  id: string;
  user_id: string;
  goatpay_subaccount_id: string;
  external_reference: string;
  lock_status: 'none' | 'full' | 'withdraw_only' | 'deposit_only';
  daily_limit: number | null;
  monthly_limit: number | null;
  transaction_limit: number | null;
  pricing_pix_in_fee: number | null;
  pricing_pix_out_fee: number | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface Transaction {
  id: string;
  user_id: string;
  subaccount_id: string | null;
  goatpay_transaction_id: string;
  external_reference: string;
  type: TransactionType;
  status: TransactionStatus;
  amount: number;
  fee: number;
  net_amount: number;
  description: string | null;
  pix_key: string | null;
  destination_email: string | null;
  cover_fee: boolean;
  metadata: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
  completed_at: string | null;
}

export interface TransactionEvent {
  id: string;
  transaction_id: string;
  from_status: TransactionStatus | null;
  to_status: TransactionStatus;
  source: 'webhook' | 'poll' | 'system';
  payload: Record<string, unknown> | null;
  created_at: string;
}

export interface Refund {
  id: string;
  user_id: string;
  transaction_id: string;
  goatpay_refund_id: string;
  external_reference: string;
  amount: number;
  status: RefundStatus;
  reason: string | null;
  created_at: string;
  updated_at: string;
  completed_at: string | null;
}

export interface TransferScheduled {
  id: string;
  user_id: string;
  subaccount_id: string | null;
  goatpay_scheduled_id: string;
  external_reference: string;
  amount: number;
  pix_key: string;
  schedule_type: 'once' | 'recurring' | 'balance_trigger';
  cron_expression: string | null;
  balance_threshold: number | null;
  next_execution: string | null;
  status: 'active' | 'paused' | 'canceled';
  created_at: string;
  updated_at: string;
}

export interface ApiKey {
  id: string;
  user_id: string;
  name: string;
  key_prefix: string;
  key_hash: string;
  scopes: string[];
  last_used_at: string | null;
  is_active: boolean;
  expires_at: string | null;
  created_at: string;
  revoked_at: string | null;
}

export interface WebhookEndpoint {
  id: string;
  user_id: string;
  url: string;
  secret: string;
  events: string[];
  is_active: boolean;
  last_delivery_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface WebhookDelivery {
  id: string;
  endpoint_id: string;
  event_type: string;
  payload: Record<string, unknown>;
  status: 'pending' | 'success' | 'failed' | 'retrying';
  response_status_code: number | null;
  response_body: string | null;
  attempt: number;
  next_retry_at: string | null;
  created_at: string;
  delivered_at: string | null;
}

export interface GoatPayWebhookEvent {
  id: string;
  delivery_id: string;
  event_type: string;
  payload: Record<string, unknown>;
  processed: boolean;
  created_at: string;
}

export interface AuditLog {
  id: string;
  user_id: string | null;
  action: string;
  resource_type: string;
  resource_id: string | null;
  details: Record<string, unknown> | null;
  ip_address: string | null;
  user_agent: string | null;
  created_at: string;
}

export interface Session {
  id: string;
  user_id: string;
  token_hash: string;
  ip_address: string | null;
  user_agent: string | null;
  device_info: string | null;
  is_revoked: boolean;
  expires_at: string;
  created_at: string;
}

// ============================================================
// Express request extensions
// ============================================================

export interface AuthenticatedRequest extends Request {
  user: {
    id: string;
    email: string;
    role: UserRole;
  };
  requestId: string;
}

export interface OptionalAuthRequest extends Request {
  user?: {
    id: string;
    email: string;
    role: UserRole;
  };
  requestId: string;
}

export interface ApiKeyAuthenticatedRequest extends Request {
  apiKey: {
    id: string;
    userId: string;
    scopes: string[];
  };
  user: {
    id: string;
    email: string;
    role: UserRole;
  };
  requestId: string;
}

// ============================================================
// Goat Pay API response envelopes
// ============================================================

export interface GoatPaySuccessEnvelope<T = unknown> {
  success: true;
  message: string;
  data: T;
  requestId: string;
}

export interface GoatPayErrorEnvelope {
  success: false;
  message: string;
  error: {
    code: string;
    statusCode: number;
  };
  requestId: string;
}

export type GoatPayResponse<T = unknown> =
  | GoatPaySuccessEnvelope<T>
  | GoatPayErrorEnvelope;

// ============================================================
// App-level error
// ============================================================

export class AppError extends Error {
  public readonly statusCode: number;
  public readonly code: string;
  public readonly isOperational: boolean;
  public readonly details?: unknown;

  constructor(
    message: string,
    statusCode: number = 500,
    code: string = 'INTERNAL_ERROR',
    isOperational: boolean = true,
    details?: unknown,
  ) {
    super(message);
    Object.setPrototypeOf(this, new.target.prototype);
    this.statusCode = statusCode;
    this.code = code;
    this.isOperational = isOperational;
    this.details = details;
    this.name = 'AppError';
  }

  withDetails(details: unknown): AppError {
    return new AppError(this.message, this.statusCode, this.code, this.isOperational, details);
  }
}
