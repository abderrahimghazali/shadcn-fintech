import crypto from 'node:crypto';
import { supabase } from '../config/supabase.js';
import { AppError } from '../types/index.js';

// ============================================================
// Idempotency Helper
// For financial operations using externalReference.
// Before creating a new financial operation, check if an
// operation with the same externalReference already exists.
// If it does, return the existing record instead of creating a duplicate.
// ============================================================

/**
 * Check idempotency for a given externalReference in a given table.
 * Returns the existing record if found, or null if this is a new operation.
 *
 * @param table - The Supabase table to check (e.g. 'transactions', 'refunds')
 * @param externalReference - The idempotency key
 * @param select - Columns to select (default: '*')
 */
export async function checkIdempotency<T = Record<string, unknown>>(
  table: string,
  externalReference: string,
  select: string = '*',
): Promise<T | null> {
  const { data, error } = await supabase
    .from(table)
    .select(select)
    .eq('external_reference', externalReference)
    .maybeSingle();

  if (error) {
    // Log but don't throw — we don't want a DB error to block the operation
    // The caller should still proceed and handle the idempotency at the
    // Goat Pay level (which is the source of truth for idempotency)
    return null;
  }

  return data as T | null;
}

/**
 * Assert that no operation with this externalReference exists.
 * Throws AppError 409 if a duplicate is found.
 * Returns void if clear to proceed.
 */
export async function assertUniqueExternalReference(
  table: string,
  externalReference: string,
): Promise<void> {
  const existing = await checkIdempotency(table, externalReference, 'id');
  if (existing) {
    throw new AppError(
      'An operation with this reference already exists',
      409,
      'DUPLICATE_EXTERNAL_REFERENCE',
      true,
      { existingId: (existing as { id: string }).id },
    );
  }
}

/**
 * Generate a prefixed externalReference for idempotent operations.
 * Format: {prefix}_{userId}_{uuid}
 */
export function generateExternalReference(
  prefix: string,
  userId: string,
): string {
  const uuid = crypto.randomUUID();
  return `${prefix}_${userId}_${uuid}`;
}
