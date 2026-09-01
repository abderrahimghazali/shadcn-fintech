import { env } from '../config/env.js';
import logger from '../utils/logger.js';
import { AppError, type GoatPayResponse } from '../types/index.js';

// ============================================================
// Goat Pay API Client
// Base URL: https://api.goatpay.com.br/v1
// Auth: X-API-Key header
// All monetary values in reais (100 = R$100,00)
// ============================================================

class GoatPayClient {
  private readonly baseUrl: string;
  private readonly apiKey: string;

  constructor() {
    this.baseUrl = env.GOATPAY_BASE_URL;
    this.apiKey = env.GOATPAY_API_KEY;
  }

  // --------------------------------------------------------
  // Core HTTP helpers
  // --------------------------------------------------------

  private async request<T>(
    method: string,
    path: string,
    body?: Record<string, unknown>,
  ): Promise<T> {
    const url = `${this.baseUrl}${path}`;
    const requestId = `gp-${Date.now()}`;

    const headers: Record<string, string> = {
      'X-API-Key': this.apiKey,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    };

    const options: RequestInit = {
      method,
      headers,
      ...(body && { body: JSON.stringify(body) }),
    };

    logger.debug(
      { method, url, body: body ?? undefined, requestId },
      'Goat Pay API request',
    );

    let res: Response;
    try {
      res = await fetch(url, options);
    } catch (err) {
      logger.error({ err, url, requestId }, 'Goat Pay API network error');
      throw new AppError('Failed to connect to payment provider', 502, 'UPSTREAM_ERROR');
    }

    const json = (await res.json()) as GoatPayResponse<T>;

    logger.debug(
      { status: res.status, gpRequestId: json.requestId, url, requestId },
      'Goat Pay API response',
    );

    // Handle rate limiting (429) — tell caller to retry later
    if (res.status === 429) {
      throw new AppError(
        'Goat Pay rate limit reached. Retry later.',
        429,
        'GOATPAY_RATE_LIMITED',
      );
    }

    if (!res.ok || !json.success) {
      const envelope = json as {
        success: false;
        error: { statusCode: number; code: string };
        message: string;
      };
      const statusCode = envelope.error?.statusCode ?? res.status;

      logger.warn(
        { statusCode, gpCode: envelope.error?.code, url, requestId },
        'Goat Pay API error',
      );

      throw new AppError(
        envelope.message || 'Goat Pay API error',
        statusCode,
        envelope.error?.code || 'GOATPAY_ERROR',
      );
    }

    return (json as { success: true; data: T }).data;
  }

  // --------------------------------------------------------
  // Account
  // --------------------------------------------------------

  /** GET /account/balance — available/pending balance on Padrao rail */
  async getBalance() {
    return this.request<{
      availablePadrao: number;
      pendingPadrao: number;
      lockedPadrao: number;
      spendablePadrao: number;
    }>('GET', '/account/balance');
  }

  /** GET /account/transactions — unified statement, paginated */
  async getTransactions(params?: {
    page?: number;
    pageSize?: number;
    subaccountId?: string;
    startDate?: string;
    endDate?: string;
  }) {
    const query = new URLSearchParams();
    if (params?.page) query.set('page', String(params.page));
    if (params?.pageSize) query.set('pageSize', String(params.pageSize));
    if (params?.subaccountId) query.set('subaccountId', params.subaccountId);
    if (params?.startDate) query.set('startDate', params.startDate);
    if (params?.endDate) query.set('endDate', params.endDate);
    const qs = query.toString();
    return this.request<unknown>(
      'GET',
      `/account/transactions${qs ? `?${qs}` : ''}`,
    );
  }

  // --------------------------------------------------------
  // Subaccounts
  // --------------------------------------------------------

  /**
   * POST /subaccount/create — Create a merchant subaccount (PF or PJ)
   * @param externalReference Our internal user ID (obligatory, used for idempotency)
   */
  async createSubaccount(data: {
    externalReference: string;
    // PF fields
    fullName?: string;
    cpf?: string;
    birthDate?: string;
    postalCode?: string;
    // PJ fields
    corporateName?: string;
    cnpj?: string;
    tradingName?: string;
    // Common
    email?: string;
    phone?: string;
  }) {
    return this.request<unknown>(
      'POST',
      '/subaccount/create',
      data as Record<string, unknown>,
    );
  }

  /** GET /subaccount/balance/:id — Subaccount balance (Padrao rail only) */
  async getSubaccountBalance(subaccountId: string) {
    return this.request<{
      availablePadrao: number;
      pendingPadrao: number;
      lockedPadrao: number;
      spendablePadrao: number;
    }>('GET', `/subaccount/balance/${subaccountId}`);
  }

  /** POST /subaccount/add-balance — Move balance from main account to subaccount */
  async addBalance(data: {
    subaccountId: string;
    amount: number;
    externalReference: string;
  }) {
    return this.request<unknown>('POST', '/subaccount/add-balance', data);
  }

  /** POST /subaccount/remove-balance — Move balance from subaccount to main account */
  async removeBalance(data: {
    subaccountId: string;
    amount: number;
    externalReference: string;
  }) {
    return this.request<unknown>('POST', '/subaccount/remove-balance', data);
  }

  /** POST /subaccount/transfer — Transfer between subaccounts */
  async transferBetweenSubaccounts(data: {
    fromSubaccountId: string;
    toSubaccountId: string;
    amount: number;
    externalReference: string;
  }) {
    return this.request<unknown>('POST', '/subaccount/transfer', data);
  }

  /** POST /subaccount/lock — Lock a subaccount (full | withdraw_only | deposit_only) */
  async lockSubaccount(data: {
    subaccountId: string;
    lockType: 'full' | 'withdraw_only' | 'deposit_only';
  }) {
    return this.request<unknown>('POST', '/subaccount/lock', data);
  }

  /** POST /subaccount/set-limits — Set daily/monthly/per-transaction limits */
  async setSubaccountLimits(data: {
    subaccountId: string;
    dailyLimit?: number;
    monthlyLimit?: number;
    transactionLimit?: number;
  }) {
    return this.request<unknown>('POST', '/subaccount/set-limits', data);
  }

  /** POST /subaccount/set-pricing — Set PIX in/out fee markup (profit for Monkey Pay) */
  async setSubaccountPricing(data: {
    subaccountId: string;
    pixInFee?: number;
    pixOutFee?: number;
  }) {
    return this.request<unknown>('POST', '/subaccount/set-pricing', data);
  }

  /** GET /subaccount/details/:id — Get subaccount details */
  async getSubaccountDetails(subaccountId: string) {
    return this.request<unknown>(
      'GET',
      `/subaccount/details/${subaccountId}`,
    );
  }

  /** DELETE /subaccount/delete/:id — Delete subaccount (requires zero Padrao balance) */
  async deleteSubaccount(subaccountId: string) {
    return this.request<unknown>(
      'DELETE',
      `/subaccount/delete/${subaccountId}`,
    );
  }

  // --------------------------------------------------------
  // Payment PIX (receive)
  // --------------------------------------------------------

  /**
   * POST /payment-pix/create — Create a PIX payment (QR code / copy-paste)
   * @param data.amount Amount in reais (100 = R$100,00)
   * @param data.externalReference Idempotency key
   */
  async createPaymentPix(data: {
    amount: number;
    externalReference: string;
    description?: string;
    subaccountId?: string;
    coverFee?: boolean;
  }) {
    return this.request<unknown>('POST', '/payment-pix/create', data);
  }

  /** GET /payment-pix/status/:id — Get PIX payment status */
  async getPaymentPixStatus(paymentId: string) {
    return this.request<unknown>(
      'GET',
      `/payment-pix/status/${paymentId}`,
    );
  }

  /** GET /payment-pix/list — List PIX payments, paginated */
  async listPaymentPix(params?: {
    page?: number;
    pageSize?: number;
    subaccountId?: string;
  }) {
    const query = new URLSearchParams();
    if (params?.page) query.set('page', String(params.page));
    if (params?.pageSize) query.set('pageSize', String(params.pageSize));
    if (params?.subaccountId)
      query.set('subaccountId', params.subaccountId);
    const qs = query.toString();
    return this.request<unknown>(
      'GET',
      `/payment-pix/list${qs ? `?${qs}` : ''}`,
    );
  }

  // --------------------------------------------------------
  // Transfer PIX (send / payout)
  // --------------------------------------------------------

  /**
   * POST /transfer-pix/create — Send a PIX transfer
   * @param data.amount Amount in reais (100 = R$100,00)
   * @param data.pixKey PIX key of the recipient
   * @param data.externalReference Idempotency key
   */
  async createTransferPix(data: {
    amount: number;
    pixKey: string;
    externalReference: string;
    description?: string;
    subaccountId?: string;
    coverFee?: boolean;
  }) {
    return this.request<unknown>('POST', '/transfer-pix/create', data);
  }

  /** GET /transfer-pix/status/:id — Get PIX transfer status */
  async getTransferPixStatus(transferId: string) {
    return this.request<unknown>(
      'GET',
      `/transfer-pix/status/${transferId}`,
    );
  }

  /** GET /transfer-pix/list — List PIX transfers, paginated */
  async listTransferPix(params?: {
    page?: number;
    pageSize?: number;
    subaccountId?: string;
  }) {
    const query = new URLSearchParams();
    if (params?.page) query.set('page', String(params.page));
    if (params?.pageSize) query.set('pageSize', String(params.pageSize));
    if (params?.subaccountId)
      query.set('subaccountId', params.subaccountId);
    const qs = query.toString();
    return this.request<unknown>(
      'GET',
      `/transfer-pix/list${qs ? `?${qs}` : ''}`,
    );
  }

  // --------------------------------------------------------
  // Refunds
  // --------------------------------------------------------

  /**
   * POST /refunds/create — Refund a completed PIX payment
   * @param data.paymentId The original payment-pix ID to refund
   * @param data.externalReference Idempotency key
   */
  async createRefund(data: {
    paymentId: string;
    amount?: number;
    externalReference: string;
    reason?: string;
  }) {
    return this.request<unknown>('POST', '/refunds/create', data);
  }

  /** GET /refunds/status/:id — Get refund status */
  async getRefundStatus(refundId: string) {
    return this.request<unknown>('GET', `/refunds/status/${refundId}`);
  }

  /** GET /refunds/list — List refunds, paginated */
  async listRefunds(params?: {
    page?: number;
    pageSize?: number;
    paymentId?: string;
  }) {
    const query = new URLSearchParams();
    if (params?.page) query.set('page', String(params.page));
    if (params?.pageSize) query.set('pageSize', String(params.pageSize));
    if (params?.paymentId) query.set('paymentId', params.paymentId);
    const qs = query.toString();
    return this.request<unknown>(
      'GET',
      `/refunds/list${qs ? `?${qs}` : ''}`,
    );
  }

  // --------------------------------------------------------
  // Webhooks (Goat Pay -> us)
  // --------------------------------------------------------

  /** POST /webhooks/create — Register a webhook endpoint with Goat Pay */
  async createWebhook(data: { url: string; events: string[] }) {
    return this.request<unknown>('POST', '/webhooks/create', data);
  }

  /** GET /webhooks/list — List registered webhooks */
  async listWebhooks() {
    return this.request<unknown>('GET', '/webhooks/list');
  }

  /** DELETE /webhooks/delete/:id — Delete a webhook endpoint */
  async deleteWebhook(webhookId: string) {
    return this.request<unknown>(
      'DELETE',
      `/webhooks/delete/${webhookId}`,
    );
  }

  // --------------------------------------------------------
  // Transfer Internal (between Goat Pay accounts by email)
  // --------------------------------------------------------

  /**
   * POST /transfer-internal/create — Fee-free internal transfer
   * @param data.email Recipient's Goat Pay email
   * @param data.externalReference Idempotency key
   */
  async createTransferInternal(data: {
    email: string;
    amount: number;
    externalReference: string;
    description?: string;
  }) {
    return this.request<unknown>('POST', '/transfer-internal/create', data);
  }

  // --------------------------------------------------------
  // Transfer Scheduled
  // --------------------------------------------------------

  /**
   * POST /transfer-scheduled/create — Schedule a transfer (once/recurring/balance-trigger)
   * Max 20 active per account
   */
  async createTransferScheduled(data: {
    pixKey: string;
    amount: number;
    scheduleType: 'once' | 'recurring' | 'balance_trigger';
    externalReference: string;
    scheduledDate?: string;
    cronExpression?: string;
    balanceThreshold?: number;
    description?: string;
  }) {
    return this.request<unknown>(
      'POST',
      '/transfer-scheduled/create',
      data,
    );
  }

  /** GET /transfer-scheduled/list — List scheduled transfers */
  async listTransferScheduled() {
    return this.request<unknown>('GET', '/transfer-scheduled/list');
  }

  /** DELETE /transfer-scheduled/delete/:id — Delete a scheduled transfer */
  async deleteTransferScheduled(scheduledId: string) {
    return this.request<unknown>(
      'DELETE',
      `/transfer-scheduled/delete/${scheduledId}`,
    );
  }

  // --------------------------------------------------------
  // MEDs (PIX disputes)
  // --------------------------------------------------------

  /** GET /meds/list — List MED disputes */
  async listMeds() {
    return this.request<unknown>('GET', '/meds/list');
  }

  /** GET /meds/:id — Get MED details */
  async getMed(medId: string) {
    return this.request<unknown>('GET', `/meds/${medId}`);
  }

  /**
   * POST /meds/evidence — Send evidence for a MED dispute
   * Note: returns 403 if auto-contestation is enabled (default)
   */
  async sendMedEvidence(data: { medId: string; evidence: string }) {
    return this.request<unknown>('POST', '/meds/evidence', data);
  }
}

export const goatPayClient = new GoatPayClient();
export default goatPayClient;
