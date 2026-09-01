-- =============================================================
-- Monkey Pay — Initial Schema Migration
-- Version: 001
-- Description: Creates all enums, tables, indexes, triggers,
--              and comments for the Monkey Pay gateway database.
-- =============================================================

BEGIN;

-- =============================================================
-- 1. ENUM TYPES
-- =============================================================

-- User roles
CREATE TYPE user_role AS ENUM (
  'admin',
  'merchant'
);

-- User account statuses
CREATE TYPE user_status AS ENUM (
  'active',
  'suspended',
  'banned',
  'pending_verification'
);

-- KYC submission types (PF = Pessoa Física, PJ = Pessoa Jurídica)
CREATE TYPE kyc_type AS ENUM (
  'pf',
  'pj'
);

-- KYC submission statuses
CREATE TYPE kyc_status AS ENUM (
  'pending',
  'submitted',
  'under_review',
  'approved',
  'rejected'
);

-- Transaction types
CREATE TYPE transaction_type AS ENUM (
  'pix_in',
  'pix_out',
  'internal',
  'refund',
  'fee',
  'subaccount_profit'
);

-- Transaction statuses
CREATE TYPE transaction_status AS ENUM (
  'requested',
  'pending',
  'processing',
  'completed',
  'failed',
  'canceled',
  'reversed'
);

-- Refund statuses
CREATE TYPE refund_status AS ENUM (
  'requested',
  'pending',
  'processing',
  'completed',
  'failed'
);

-- =============================================================
-- 2. HELPER: auto-update updated_at trigger
-- =============================================================

CREATE OR REPLACE FUNCTION trigger_set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- =============================================================
-- 3. TABLES
-- =============================================================

-- ---------------------------------------------------------------
-- 3.1  users
-- ---------------------------------------------------------------
CREATE TABLE users (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email                 TEXT NOT NULL,
  password_hash         TEXT NOT NULL,
  role                  user_role   NOT NULL DEFAULT 'merchant',
  status                user_status NOT NULL DEFAULT 'active',
  two_factor_enabled    BOOLEAN              DEFAULT false,
  two_factor_secret     TEXT,
  email_verified_at     TIMESTAMPTZ,
  reset_password_token  TEXT,
  reset_password_expires_at TIMESTAMPTZ,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT users_email_unique UNIQUE (email)
);

COMMENT ON TABLE  users            IS 'Monkey Pay user accounts — credentials, role, and status';
COMMENT ON COLUMN users.id          IS 'Internal primary key (UUID v4)';
COMMENT ON COLUMN users.email       IS 'Login e-mail — must be unique';
COMMENT ON COLUMN users.password_hash IS 'bcrypt hash of the user password';
COMMENT ON COLUMN users.role        IS 'admin can manage other users and review KYC; merchant is the default';
COMMENT ON COLUMN users.status      IS 'active | suspended | banned | pending_verification';
COMMENT ON COLUMN users.two_factor_secret IS 'TOTP secret — should be encrypted at rest';

-- ---------------------------------------------------------------
-- 3.2  user_profiles
-- ---------------------------------------------------------------
CREATE TABLE user_profiles (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  full_name     TEXT,
  phone         TEXT,
  avatar_url    TEXT,
  address       TEXT,
  city          TEXT,
  state         TEXT,
  postal_code   TEXT,
  country       TEXT        DEFAULT 'BR',
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT user_profiles_user_id_unique UNIQUE (user_id)
);

COMMENT ON TABLE  user_profiles            IS 'Extended profile data collected during onboarding';
COMMENT ON COLUMN user_profiles.user_id   IS '1:1 relationship with users — each user has at most one profile';
COMMENT ON COLUMN user_profiles.country   IS 'ISO 3166-1 alpha-2, defaults to Brazil';

-- ---------------------------------------------------------------
-- 3.3  kyc_submissions
-- ---------------------------------------------------------------
CREATE TABLE kyc_submissions (
  id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type                   kyc_type    NOT NULL,
  status                 kyc_status  NOT NULL DEFAULT 'pending',
  submitted_at           TIMESTAMPTZ,
  reviewed_at            TIMESTAMPTZ,
  reviewed_by            UUID REFERENCES users(id) ON DELETE SET NULL,
  rejection_reason       TEXT,
  goatpay_subaccount_id  TEXT,
  created_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at             TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE  kyc_submissions              IS 'KYC onboarding flow — tracks PF/PJ verification state';
COMMENT ON COLUMN kyc_submissions.type        IS 'pf (individual) or pj (corporate)';
COMMENT ON COLUMN kyc_submissions.status      IS 'pending → submitted → under_review → approved | rejected';
COMMENT ON COLUMN kyc_submissions.reviewed_by IS 'Admin user who performed the review';
COMMENT ON COLUMN kyc_submissions.goatpay_subaccount_id IS 'Populated after successful subaccount creation on Goat Pay';

CREATE INDEX idx_kyc_submissions_user_id   ON kyc_submissions(user_id);
CREATE INDEX idx_kyc_submissions_status     ON kyc_submissions(status);

-- ---------------------------------------------------------------
-- 3.4  kyc_documents
-- ---------------------------------------------------------------
CREATE TABLE kyc_documents (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  submission_id    UUID NOT NULL REFERENCES kyc_submissions(id) ON DELETE CASCADE,
  user_id          UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  document_type    TEXT NOT NULL,
  storage_path     TEXT NOT NULL,
  file_name        TEXT,
  file_size        INTEGER,
  mime_type        TEXT,
  status           TEXT NOT NULL DEFAULT 'pending',
  verification_note TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE  kyc_documents              IS 'Uploaded documents for KYC verification';
COMMENT ON COLUMN kyc_documents.document_type IS 'identity_front | identity_back | proof_of_address | selfie | company_document | proof_of_legal_representative';
COMMENT ON COLUMN kyc_documents.storage_path  IS 'Path in Supabase Storage bucket';
COMMENT ON COLUMN kyc_documents.status       IS 'pending | approved | rejected';

CREATE INDEX idx_kyc_documents_submission_id ON kyc_documents(submission_id);
CREATE INDEX idx_kyc_documents_user_id       ON kyc_documents(user_id);

-- ---------------------------------------------------------------
-- 3.5  subaccounts
-- ---------------------------------------------------------------
CREATE TABLE subaccounts (
  id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                  UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  goatpay_subaccount_id    TEXT NOT NULL,
  external_reference       TEXT NOT NULL,
  status                   TEXT        NOT NULL DEFAULT 'active',
  lock_type                TEXT,
  cached_balance           BIGINT      NOT NULL DEFAULT 0,
  cached_pending_balance   BIGINT      NOT NULL DEFAULT 0,
  cached_locked_balance    BIGINT      NOT NULL DEFAULT 0,
  cached_spendable_balance BIGINT      NOT NULL DEFAULT 0,
  daily_limit              BIGINT,
  monthly_limit            BIGINT,
  transaction_limit        BIGINT,
  pricing_pix_in_fee       NUMERIC(5,2) DEFAULT 0,
  pricing_pix_out_fee      NUMERIC(5,2) DEFAULT 0,
  portal_wallet_enabled    BOOLEAN              DEFAULT false,
  created_at               TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at               TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT subaccounts_user_id_unique            UNIQUE (user_id),
  CONSTRAINT subaccounts_goatpay_id_unique        UNIQUE (goatpay_subaccount_id),
  CONSTRAINT subaccounts_external_reference_unique UNIQUE (external_reference),

  CONSTRAINT subaccounts_status_check CHECK (status IN ('active', 'locked', 'closed')),
  CONSTRAINT subaccounts_lock_type_check CHECK (lock_type IS NULL OR lock_type IN ('full', 'withdraw_only', 'deposit_only'))
);

COMMENT ON TABLE  subaccounts                       IS 'Maps a Monkey Pay user to a Goat Pay merchant subaccount';
COMMENT ON COLUMN subaccounts.cached_balance          IS 'Available balance in cents — synced from Goat Pay';
COMMENT ON COLUMN subaccounts.cached_pending_balance  IS 'Pending (incoming) balance in cents';
COMMENT ON COLUMN subaccounts.cached_locked_balance   IS 'Locked balance in cents';
COMMENT ON COLUMN subaccounts.cached_spendable_balance IS 'Spendable balance in cents';
COMMENT ON COLUMN subaccounts.pricing_pix_in_fee      IS 'Markup fee (percentage) added on PIX-in — profit for Monkey Pay';
COMMENT ON COLUMN subaccounts.pricing_pix_out_fee     IS 'Markup fee (percentage) added on PIX-out — profit for Monkey Pay';
COMMENT ON COLUMN subaccounts.portal_wallet_enabled   IS 'Whether the merchant has access to wallet.goatpay.com.br';

-- ---------------------------------------------------------------
-- 3.6  transactions
-- ---------------------------------------------------------------
CREATE TABLE transactions (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                 UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  subaccount_id           UUID REFERENCES subaccounts(id) ON DELETE SET NULL,
  type                    transaction_type  NOT NULL,
  status                  transaction_status NOT NULL DEFAULT 'pending',
  amount                  BIGINT NOT NULL,
  fee                     BIGINT NOT NULL DEFAULT 0,
  net_amount              BIGINT,
  description             TEXT,
  external_reference      TEXT,
  goatpay_payment_id      TEXT,
  goatpay_transfer_id     TEXT,
  pix_key                 TEXT,
  pix_key_type            TEXT,
  recipient_name          TEXT,
  cover_fee               BOOLEAN    NOT NULL DEFAULT false,
  correlation_id          TEXT,
  metadata                JSONB      NOT NULL DEFAULT '{}',
  created_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at            TIMESTAMPTZ,

  CONSTRAINT transactions_external_reference_unique UNIQUE (external_reference)
);

COMMENT ON TABLE  transactions                    IS 'Local mirror of all financial operations — status synced via Goat Pay webhooks';
COMMENT ON COLUMN transactions.amount              IS 'Amount in cents';
COMMENT ON COLUMN transactions.fee                 IS 'Fee in cents';
COMMENT ON COLUMN transactions.net_amount           IS 'Final amount after fees (in cents)';
COMMENT ON COLUMN transactions.external_reference  IS 'Idempotency key sent to Goat Pay';
COMMENT ON COLUMN transactions.goatpay_payment_id   IS 'Payment ID returned by Goat Pay (for pix_in)';
COMMENT ON COLUMN transactions.goatpay_transfer_id  IS 'Transfer ID returned by Goat Pay (for pix_out / internal)';
COMMENT ON COLUMN transactions.cover_fee            IS 'If true, amount is gross and fee is deducted from it';
COMMENT ON COLUMN transactions.correlation_id       IS 'PIX correlation ID for reconciliation';

CREATE INDEX idx_transactions_user_id            ON transactions(user_id);
CREATE INDEX idx_transactions_subaccount_id      ON transactions(subaccount_id);
CREATE INDEX idx_transactions_status             ON transactions(status);
CREATE INDEX idx_transactions_type               ON transactions(type);
CREATE INDEX idx_transactions_external_reference ON transactions(external_reference);
CREATE INDEX idx_transactions_created_at         ON transactions(created_at);

-- ---------------------------------------------------------------
-- 3.7  transaction_events
-- ---------------------------------------------------------------
CREATE TABLE transaction_events (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  transaction_id  UUID NOT NULL REFERENCES transactions(id) ON DELETE CASCADE,
  status          TEXT NOT NULL,
  metadata        JSONB,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE  transaction_events              IS 'Append-only log of status changes per transaction';
COMMENT ON COLUMN transaction_events.status      IS 'The status value at this point in time';
COMMENT ON COLUMN transaction_events.metadata    IS 'Raw webhook payload or poll response that triggered the event';

CREATE INDEX idx_transaction_events_transaction_id ON transaction_events(transaction_id);

-- ---------------------------------------------------------------
-- 3.8  refunds
-- ---------------------------------------------------------------
CREATE TABLE refunds (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id             UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  transaction_id      UUID NOT NULL REFERENCES transactions(id) ON DELETE CASCADE,
  status              refund_status NOT NULL DEFAULT 'requested',
  amount              BIGINT NOT NULL,
  reason              TEXT,
  external_reference  TEXT,
  goatpay_refund_id   TEXT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at        TIMESTAMPTZ,

  CONSTRAINT refunds_external_reference_unique UNIQUE (external_reference)
);

COMMENT ON TABLE  refunds                       IS 'Refund requests — mirrors Goat Pay refund objects';
COMMENT ON COLUMN refunds.amount                IS 'Refund amount in cents';
COMMENT ON COLUMN refunds.external_reference    IS 'Idempotency key for the refund';
COMMENT ON COLUMN refunds.goatpay_refund_id     Is 'Refund ID returned by Goat Pay';

CREATE INDEX idx_refunds_user_id        ON refunds(user_id);
CREATE INDEX idx_refunds_transaction_id ON refunds(transaction_id);
CREATE INDEX idx_refunds_status         ON refunds(status);

-- ---------------------------------------------------------------
-- 3.9  transfers_scheduled
-- ---------------------------------------------------------------
CREATE TABLE transfers_scheduled (
  id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                  UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  subaccount_id            UUID REFERENCES subaccounts(id) ON DELETE SET NULL,
  amount                   BIGINT NOT NULL,
  pix_key                  TEXT NOT NULL,
  pix_key_type             TEXT NOT NULL,
  schedule_type            TEXT,
  scheduled_date           TIMESTAMPTZ,
  recurrence               TEXT,
  trigger_balance_threshold BIGINT,
  description              TEXT,
  external_reference       TEXT,
  goatpay_scheduled_id     TEXT,
  status                   TEXT NOT NULL DEFAULT 'active',
  next_execution_at        TIMESTAMPTZ,
  last_execution_at        TIMESTAMPTZ,
  created_at               TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at               TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT transfers_scheduled_schedule_type_check CHECK (schedule_type IS NULL OR schedule_type IN ('once', 'recurring', 'balance_trigger')),
  CONSTRAINT transfers_scheduled_recurrence_check   CHECK (recurrence IS NULL OR recurrence IN ('daily', 'weekly', 'monthly')),
  CONSTRAINT transfers_scheduled_status_check       CHECK (status IN ('active', 'paused', 'completed', 'canceled'))
);

COMMENT ON TABLE  transfers_scheduled                        IS 'Scheduled/recurring PIX transfers configured by merchants';
COMMENT ON COLUMN transfers_scheduled.schedule_type          IS 'once | recurring | balance_trigger';
COMMENT ON COLUMN transfers_scheduled.recurrence             Is 'daily | weekly | monthly (only when schedule_type = recurring)';
COMMENT ON COLUMN transfers_scheduled.trigger_balance_threshold IS 'Fire when balance exceeds this amount (in cents)';
COMMENT ON COLUMN transfers_scheduled.goatpay_scheduled_id   IS 'Scheduled transfer ID returned by Goat Pay';

CREATE INDEX idx_transfers_scheduled_user_id ON transfers_scheduled(user_id);
CREATE INDEX idx_transfers_scheduled_status  ON transfers_scheduled(status);

-- ---------------------------------------------------------------
-- 3.10 api_keys
-- ---------------------------------------------------------------
CREATE TABLE api_keys (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name          TEXT NOT NULL,
  key_prefix    TEXT NOT NULL,
  key_hash      TEXT NOT NULL,
  scopes        TEXT[] NOT NULL,
  last_used_at  TIMESTAMPTZ,
  active        BOOLEAN NOT NULL DEFAULT true,
  expires_at    TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE  api_keys                 IS 'API keys issued by Monkey Pay to merchants for programmatic access';
COMMENT ON COLUMN api_keys.key_prefix     IS 'First 12 chars of the key, e.g. mk_live_abc... — shown once to the user';
COMMENT ON COLUMN api_keys.key_hash       IS 'SHA-256 hash of the full API key — never stored in plain text';
COMMENT ON COLUMN api_keys.scopes         IS 'Array of permission scopes, e.g. {payments:read, payments:write}';

CREATE INDEX idx_api_keys_key_hash ON api_keys(key_hash);
CREATE INDEX idx_api_keys_user_id  ON api_keys(user_id);

-- ---------------------------------------------------------------
-- 3.11 webhook_endpoints
-- ---------------------------------------------------------------
CREATE TABLE webhook_endpoints (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  url               TEXT NOT NULL,
  events            TEXT[] NOT NULL,
  secret            TEXT NOT NULL,
  active            BOOLEAN NOT NULL DEFAULT true,
  last_delivery_at  TIMESTAMPTZ,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at        TIMESTAMPTZ
);

COMMENT ON TABLE  webhook_endpoints              Is 'Outbound webhook endpoints registered by merchants';
COMMENT ON COLUMN webhook_endpoints.events        Is 'Array of event types to deliver, e.g. {payment.paid, transfer.completed}';
COMMENT ON COLUMN webhook_endpoints.secret        Is 'HMAC-SHA256 signing secret — shown once to the user';
COMMENT ON COLUMN webhook_endpoints.deleted_at     Is 'Soft-delete timestamp — null means the endpoint is not deleted';

CREATE INDEX idx_webhook_endpoints_user_id ON webhook_endpoints(user_id);

-- ---------------------------------------------------------------
-- 3.12 webhook_deliveries
-- ---------------------------------------------------------------
CREATE TABLE webhook_deliveries (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  endpoint_id          UUID NOT NULL REFERENCES webhook_endpoints(id) ON DELETE CASCADE,
  user_id              UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  event_type           TEXT NOT NULL,
  payload              JSONB NOT NULL,
  status               TEXT NOT NULL DEFAULT 'pending',
  response_status_code INTEGER,
  response_body        TEXT,
  attempts             INTEGER NOT NULL DEFAULT 0,
  max_attempts         INTEGER NOT NULL DEFAULT 5,
  next_retry_at        TIMESTAMPTZ,
  last_attempt_at      TIMESTAMPTZ,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT webhook_deliveries_status_check CHECK (status IN ('pending', 'success', 'failed'))
);

COMMENT ON TABLE  webhook_deliveries                    Is 'Log of every outbound webhook delivery attempt';
COMMENT ON COLUMN webhook_deliveries.payload              Is 'Full JSON payload sent to the merchant endpoint';
COMMENT ON COLUMN webhook_deliveries.response_body        Is 'Raw response body from the merchant endpoint';
COMMENT ON COLUMN webhook_deliveries.next_retry_at        Is 'When to retry next (exponential backoff)';

CREATE INDEX idx_webhook_deliveries_endpoint_id ON webhook_deliveries(endpoint_id);
CREATE INDEX idx_webhook_deliveries_status      ON webhook_deliveries(status);

-- ---------------------------------------------------------------
-- 3.13 goatpay_webhook_events
-- ---------------------------------------------------------------
CREATE TABLE goatpay_webhook_events (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  delivery_id      TEXT NOT NULL,
  event_type       TEXT NOT NULL,
  payload          JSONB NOT NULL,
  processed        BOOLEAN NOT NULL DEFAULT false,
  processing_error TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT goatpay_webhook_events_delivery_id_unique UNIQUE (delivery_id)
);

COMMENT ON TABLE  goatpay_webhook_events            Is 'Idempotent log of inbound events received from Goat Pay';
COMMENT ON COLUMN goatpay_webhook_events.delivery_id Is 'Unique delivery ID from the Goat Pay webhook payload — prevents duplicate processing';
COMMENT ON COLUMN goatpay_webhook_events.processed   Is 'Whether this event has been processed by our internal dispatch';

CREATE INDEX idx_goatpay_webhook_events_event_type ON goatpay_webhook_events(event_type);
CREATE INDEX idx_goatpay_webhook_events_processed  ON goatpay_webhook_events(processed);

-- ---------------------------------------------------------------
-- 3.14 sessions
-- ---------------------------------------------------------------
CREATE TABLE sessions (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  refresh_token_hash TEXT NOT NULL,
  ip_address        TEXT,
  user_agent        TEXT,
  device_info       JSONB,
  is_revoked        BOOLEAN NOT NULL DEFAULT false,
  expires_at        TIMESTAMPTZ NOT NULL,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_activity_at  TIMESTAMPTZ
);

COMMENT ON TABLE  sessions                      Is 'Active user sessions — supports refresh token rotation and device tracking';
COMMENT ON COLUMN sessions.refresh_token_hash   Is 'SHA-256 hash of the refresh token — never stored in plain text';
COMMENT ON COLUMN sessions.device_info          Is 'Parsed device/browser information stored as JSON';

CREATE INDEX idx_sessions_user_id            ON sessions(user_id);
CREATE INDEX idx_sessions_refresh_token_hash ON sessions(refresh_token_hash);

-- ---------------------------------------------------------------
-- 3.15 audit_logs
-- ---------------------------------------------------------------
CREATE TABLE audit_logs (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID REFERENCES users(id) ON DELETE SET NULL,
  action        TEXT NOT NULL,
  resource_type TEXT,
  resource_id   UUID,
  details       JSONB,
  ip_address    TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE  audit_logs              Is 'Immutable audit trail for all sensitive operations';
COMMENT ON COLUMN audit_logs.action       Is 'Verb describing the operation, e.g. user.login, kyc.approve, api_key.create';
COMMENT ON COLUMN audit_logs.resource_type Is 'Type of the affected resource, e.g. user, transaction, subaccount';
COMMENT ON COLUMN audit_logs.details      Is 'Additional context — request body, changed fields, etc.';

CREATE INDEX idx_audit_logs_user_id       ON audit_logs(user_id);
CREATE INDEX idx_audit_logs_action        ON audit_logs(action);
CREATE INDEX idx_audit_logs_resource_type ON audit_logs(resource_type);
CREATE INDEX idx_audit_logs_created_at    ON audit_logs(created_at);

-- ---------------------------------------------------------------
-- 3.16 notifications
-- ---------------------------------------------------------------
CREATE TABLE notifications (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type       TEXT NOT NULL,
  title      TEXT NOT NULL,
  message    TEXT NOT NULL,
  data       JSONB,
  is_read    BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE  notifications              Is 'In-app notification feed for users';
COMMENT ON COLUMN notifications.type       Is 'Notification category, e.g. payment.received, kyc.approved, security.alert';
COMMENT ON COLUMN notifications.data       Is 'Structured extra data — link, transaction ID, etc.';

CREATE INDEX idx_notifications_user_id    ON notifications(user_id);
CREATE INDEX idx_notifications_is_read    ON notifications(is_read);
CREATE INDEX idx_notifications_created_at ON notifications(created_at);

-- =============================================================
-- 4. UPDATED_AT TRIGGERS
-- =============================================================

CREATE TRIGGER trg_users_updated_at
  BEFORE UPDATE ON users
  FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

CREATE TRIGGER trg_user_profiles_updated_at
  BEFORE UPDATE ON user_profiles
  FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

CREATE TRIGGER trg_kyc_submissions_updated_at
  BEFORE UPDATE ON kyc_submissions
  FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

CREATE TRIGGER trg_subaccounts_updated_at
  BEFORE UPDATE ON subaccounts
  FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

CREATE TRIGGER trg_transactions_updated_at
  BEFORE UPDATE ON transactions
  FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

CREATE TRIGGER trg_refunds_updated_at
  BEFORE UPDATE ON refunds
  FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

CREATE TRIGGER trg_transfers_scheduled_updated_at
  BEFORE UPDATE ON transfers_scheduled
  FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

CREATE TRIGGER trg_api_keys_updated_at
  BEFORE UPDATE ON api_keys
  FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

CREATE TRIGGER trg_webhook_endpoints_updated_at
  BEFORE UPDATE ON webhook_endpoints
  FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

COMMIT;
