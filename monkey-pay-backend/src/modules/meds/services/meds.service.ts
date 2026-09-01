import { supabase } from '../../config/supabase.js';
import goatPayClient from '../../lib/goatPayClient.js';
import logger from '../../utils/logger.js';
import { AppError } from '../../types/index.js';

// ============================================================
// Types
// ============================================================

export interface MedListItem {
  id: string;
  status: string;
  amount: number;
  pixKey: string | null;
  description: string | null;
  createdAt: string;
  updatedAt: string | null;
}

export interface MedDetail extends MedListItem {
  transactionId: string;
  evidence: string | null;
  evidenceDeadline: string | null;
}

export interface MedListResult {
  meds: MedListItem[];
  total: number;
  totalPages: number;
}

// ============================================================
// Service methods
// ============================================================

/**
 * List MED disputes for a user.
 * Calls goatPayClient.listMeds, also checks local DB for enriched data.
 */
export async function listMeds(
  userId: string,
  filters: {
    page: number;
    pageSize: number;
    status?: string;
  },
): Promise<MedListResult> {
  // Call Goat Pay for the official MED list
  const gpData = await goatPayClient.listMeds();
  const gpMeds = (gpData as Record<string, unknown>).data ?? gpData;
  const medArray = Array.isArray(gpMeds) ? gpMeds : [];

  // Filter by status if provided
  let filtered = medArray;
  if (filters.status) {
    filtered = medArray.filter(
      (m: Record<string, unknown>) => m.status === filters.status,
    );
  }

  // Paginate
  const total = filtered.length;
  const totalPages = Math.ceil(total / filters.pageSize);
  const offset = (filters.page - 1) * filters.pageSize;
  const paged = filtered.slice(offset, offset + filters.pageSize);

  const meds: MedListItem[] = paged.map((m: Record<string, unknown>) => ({
    id: (m.id ?? m.medId) as string,
    status: m.status as string,
    amount: m.amount as number,
    pixKey: m.pixKey as string | null,
    description: m.description as string | null,
    createdAt: (m.createdAt ?? m.created_at) as string,
    updatedAt: (m.updatedAt ?? m.updated_at) as string | null,
  }));

  return { meds, total, totalPages };
}

/**
 * Get MED detail by ID.
 * Calls goatPayClient.getMed.
 */
export async function getMed(
  _userId: string,
  medId: string,
): Promise<MedDetail> {
  const gpData = await goatPayClient.getMed(medId);
  const m = gpData as Record<string, unknown>;

  return {
    id: (m.id ?? m.medId) as string,
    transactionId: (m.transactionId ?? m.transaction_id) as string,
    status: m.status as string,
    amount: m.amount as number,
    pixKey: m.pixKey as string | null,
    description: m.description as string | null,
    evidence: m.evidence as string | null,
    evidenceDeadline: m.evidenceDeadline as string | null,
    createdAt: (m.createdAt ?? m.created_at) as string,
    updatedAt: (m.updatedAt ?? m.updated_at) as string | null,
  };
}

/**
 * Send evidence for a MED dispute.
 * Note: if auto-contestation is enabled (default), Goat Pay returns 403.
 * We catch this and return a clear error message.
 */
export async function sendEvidence(
  userId: string,
  medId: string,
  evidenceText: string,
): Promise<void> {
  try {
    await goatPayClient.sendMedEvidence({
      medId,
      evidence: evidenceText,
    });

    logger.info({ userId, medId }, 'MED evidence sent successfully');
  } catch (err) {
    if (err instanceof AppError) {
      // If Goat Pay returns 403, it's likely auto-contestation is active
      if (err.statusCode === 403) {
        throw new AppError(
          'Cannot send evidence: auto-contestation is enabled on your account. ' +
            'Contact Goat Pay support to disable auto-contestation if you want to handle disputes manually.',
          403,
          'AUTO_CONTESTATION_ENABLED',
        );
      }
    }
    throw err;
  }
}

/**
 * Process a MED webhook event.
 * Handles: med.created, med.evidence_sent, med.updated
 */
export async function processMedWebhook(
  eventData: Record<string, unknown>,
): Promise<void> {
  const eventType = eventData.event as string;
  const data = eventData.data as Record<string, unknown> | undefined;
  if (!data) {
    logger.warn({ eventData }, 'MED webhook missing data payload');
    return;
  }

  const medId = (data.id ?? data.medId) as string | undefined;
  if (!medId) {
    logger.warn({ data }, 'MED webhook missing med ID');
    return;
  }

  logger.info({ eventType, medId }, 'MED webhook processed');

  // Future: store MED data locally, trigger notifications, etc.
  // For now, we just log it. MED data is primarily managed via Goat Pay.
}
