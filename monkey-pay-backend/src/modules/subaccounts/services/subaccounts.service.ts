import { v4 as uuidv4 } from 'uuid';

import { supabase } from '../../config/supabase.js';
import goatPayClient from '../../lib/goatPayClient.js';
import logger from '../../utils/logger.js';
import { AppError } from '../../types/index.js';
import * as auditService from '../audit/services/audit.service.js';

// ============================================================
// Types
// ============================================================

export interface SubaccountListItem {
  id: string;
  userId: string;
  userEmail: string | null;
  userName: string | null;
  goatpaySubaccountId: string;
  externalReference: string;
  lockStatus: string;
  isActive: boolean;
 pricingPixInFee: number | null;
  pricingPixOutFee: number | null;
  createdAt: string;
}

export interface SubaccountListResult {
  subaccounts: SubaccountListItem[];
  total: number;
  totalPages: number;
}

export interface SubaccountDetail {
  id: string;
  userId: string;
  userEmail: string | null;
  userName: string | null;
  goatpaySubaccountId: string;
  externalReference: string;
  lockStatus: string;
  dailyLimit: number | null;
  monthlyLimit: number | null;
  transactionLimit: number | null;
  pricingPixInFee: number | null;
  pricingPixOutFee: number | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  // Enriched from Goat Pay
  goatpayDetails: Record<string, unknown> | null;
}

export interface SetPricingData {
  pixInFeePercentage: number;
  pixOutFeePercentage: number;
}

// ============================================================
// Service methods
// ============================================================

/**
 * List all subaccounts with user info (admin).
 */
export async function listSubaccounts(
  filters: {
    page: number;
    pageSize: number;
    status?: string;
  },
): Promise<SubaccountListResult> {
  let query = supabase
    .from('subaccounts')
    .select(
      'id, user_id, goatpay_subaccount_id, external_reference, lock_status, is_active, pricing_pix_in_fee, pricing_pix_out_fee, created_at, users!inner(id, email, full_name)',
      { count: 'exact' },
    )
    .order('created_at', { ascending: false });

  if (filters.status === 'active') {
    query = query.eq('is_active', true);
  } else if (filters.status === 'inactive') {
    query = query.eq('is_active', false);
  }

  const offset = (filters.page - 1) * filters.pageSize;
  query = query.range(offset, offset + filters.pageSize - 1);

  const { data, error, count } = await query;

  if (error) {
    logger.error({ error }, 'Failed to list subaccounts');
    throw new AppError('Failed to list subaccounts', 500, 'SUBACCOUNTS_LIST_FAILED');
  }

  const subaccounts: SubaccountListItem[] = (data ?? []).map(
    (row: Record<string, unknown>) => {
      const user = row.users as Record<string, unknown> | undefined;
      return {
        id: row.id as string,
        userId: row.user_id as string,
        userEmail: (user?.email as string) ?? null,
        userName: (user?.full_name as string) ?? null,
        goatpaySubaccountId: row.goatpay_subaccount_id as string,
        externalReference: row.external_reference as string,
        lockStatus: row.lock_status as string,
        isActive: row.is_active as boolean,
        pricingPixInFee: row.pricing_pix_in_fee as number | null,
        pricingPixOutFee: row.pricing_pix_out_fee as number | null,
        createdAt: row.created_at as string,
      };
    },
  );

  const total = count ?? 0;
  const totalPages = Math.ceil(total / filters.pageSize);

  return { subaccounts, total, totalPages };
}

/**
 * Get full subaccount details from DB + Goat Pay (admin).
 */
export async function getSubaccountDetails(
  subaccountId: string,
): Promise<SubaccountDetail> {
  const { data: subaccount, error } = await supabase
    .from('subaccounts')
    .select(
      'id, user_id, goatpay_subaccount_id, external_reference, lock_status, daily_limit, monthly_limit, transaction_limit, pricing_pix_in_fee, pricing_pix_out_fee, is_active, created_at, updated_at, users!inner(id, email, full_name)',
    )
    .eq('id', subaccountId)
    .single();

  if (error || !subaccount) {
    throw new AppError('Subaccount not found', 404, 'SUBACCOUNT_NOT_FOUND');
  }

  const row = subaccount as Record<string, unknown>;
  const user = row.users as Record<string, unknown>;
  const gpSubaccountId = row.goatpay_subaccount_id as string;

  // Fetch from Goat Pay for enriched data
  let goatpayDetails: Record<string, unknown> | null = null;
  try {
    goatpayDetails = (await goatPayClient.getSubaccountDetails(gpSubaccountId)) as Record<string, unknown>;
  } catch (err) {
    logger.warn({ err, gpSubaccountId }, 'Failed to fetch Goat Pay subaccount details');
  }

  return {
    id: row.id as string,
    userId: row.user_id as string,
    userEmail: (user.email as string) ?? null,
    userName: (user.full_name as string) ?? null,
    goatpaySubaccountId: gpSubaccountId,
    externalReference: row.external_reference as string,
    lockStatus: row.lock_status as string,
    dailyLimit: row.daily_limit as number | null,
    monthlyLimit: row.monthly_limit as number | null,
    transactionLimit: row.transaction_limit as number | null,
    pricingPixInFee: row.pricing_pix_in_fee as number | null,
    pricingPixOutFee: row.pricing_pix_out_fee as number | null,
    isActive: row.is_active as boolean,
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
    goatpayDetails,
  };
}

/**
 * Set subaccount pricing (admin).
 */
export async function setSubaccountPricing(
  subaccountId: string,
  pricing: SetPricingData,
  adminId: string,
): Promise<void> {
  // Verify subaccount exists
  const { data: subaccount, error: fetchError } = await supabase
    .from('subaccounts')
    .select('id, goatpay_subaccount_id, user_id')
    .eq('id', subaccountId)
    .single();

  if (fetchError || !subaccount) {
    throw new AppError('Subaccount not found', 404, 'SUBACCOUNT_NOT_FOUND');
  }

  const row = subaccount as Record<string, unknown>;
  const gpSubaccountId = row.goatpay_subaccount_id as string;

  // Call Goat Pay to set pricing
  await goatPayClient.setSubaccountPricing({
    subaccountId: gpSubaccountId,
    pixInFee: pricing.pixInFeePercentage,
    pixOutFee: pricing.pixOutFeePercentage,
  });

  // Update local DB
  const { error: updateError } = await supabase
    .from('subaccounts')
    .update({
      pricing_pix_in_fee: pricing.pixInFeePercentage,
      pricing_pix_out_fee: pricing.pixOutFeePercentage,
      updated_at: new Date().toISOString(),
    })
    .eq('id', subaccountId);

  if (updateError) {
    logger.error({ error: updateError, subaccountId }, 'Failed to update subaccount pricing locally');
  }

  // Audit log
  await auditService.log(
    'subaccount.pricing_updated',
    adminId,
    subaccountId,
    'subaccount',
    { pricing },
  );

  logger.info(
    { adminId, subaccountId, gpSubaccountId, pricing },
    'Subaccount pricing updated',
  );
}

/**
 * Delete a subaccount (admin).
 * Verifies zero balance before calling Goat Pay.
 */
export async function deleteSubaccount(
  subaccountId: string,
  adminId: string,
): Promise<void> {
  // Verify subaccount exists
  const { data: subaccount, error: fetchError } = await supabase
    .from('subaccounts')
    .select('id, goatpay_subaccount_id, user_id')
    .eq('id', subaccountId)
    .single();

  if (fetchError || !subaccount) {
    throw new AppError('Subaccount not found', 404, 'SUBACCOUNT_NOT_FOUND');
  }

  const row = subaccount as Record<string, unknown>;
  const gpSubaccountId = row.goatpay_subaccount_id as string;

  // Verify zero balance
  try {
    const balance = await goatPayClient.getSubaccountBalance(gpSubaccountId) as Record<string, unknown>;
    const availablePadrao = (balance.availablePadrao ?? 0) as number;
    const pendingPadrao = (balance.pendingPadrao ?? 0) as number;
    const lockedPadrao = (balance.lockedPadrao ?? 0) as number;

    if (availablePadrao > 0 || pendingPadrao > 0 || lockedPadrao > 0) {
      throw new AppError(
        'Cannot delete subaccount with non-zero balance. ' +
          `Available: ${availablePadrao}, Pending: ${pendingPadrao}, Locked: ${lockedPadrao}`,
        409,
        'SUBACCOUNT_HAS_BALANCE',
      );
    }
  } catch (err) {
    if (err instanceof AppError) throw err;
    logger.warn({ err, gpSubaccountId }, 'Failed to check subaccount balance');
    throw new AppError('Failed to verify subaccount balance', 502, 'BALANCE_CHECK_FAILED');
  }

  // Delete from Goat Pay
  await goatPayClient.deleteSubaccount(gpSubaccountId);

  // Deactivate local record
  const { error: updateError } = await supabase
    .from('subaccounts')
    .update({
      is_active: false,
      updated_at: new Date().toISOString(),
    })
    .eq('id', subaccountId);

  if (updateError) {
    logger.error({ error: updateError, subaccountId }, 'Failed to deactivate subaccount locally');
  }

  // Audit log
  await auditService.log(
    'subaccount.deleted',
    adminId,
    subaccountId,
    'subaccount',
    { gpSubaccountId },
  );

  logger.info(
    { adminId, subaccountId, gpSubaccountId },
    'Subaccount deleted',
  );
}
