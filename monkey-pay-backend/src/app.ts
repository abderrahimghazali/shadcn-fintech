import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import compression from 'compression';
import morgan from 'morgan';

import { corsOrigins, isProduction, env } from './config/env.js';
import logger, { childLogger } from './utils/logger.js';
import { requestIdMiddleware } from './utils/requestId.js';
import { globalRateLimitMiddleware } from './middleware/rateLimiter.js';
import { errorHandler } from './middleware/errorHandler.js';

import apiKeyRoutes from './modules/api-keys/routes/api-keys.routes.js';
import goatpayWebhookRoutes from './modules/webhooks/goatpay/routes/goatpay.routes.js';
import webhookOutboundRoutes from './modules/webhooks/outbound/routes/webhooks.routes.js';
import medRoutes from './modules/meds/routes/meds.routes.js';
import notificationRoutes from './modules/notifications/routes/notifications.routes.js';
import reportRoutes from './modules/reports/routes/reports.routes.js';
import auditRoutes from './modules/audit/routes/audit.routes.js';
import adminRoutes from './modules/admin/routes/admin.routes.js';
import subaccountRoutes from './modules/subaccounts/routes/subaccounts.routes.js';
import { UserRole } from './types/index.js';
import { requireRole } from './middleware/auth.js';

import authRoutes from './modules/auth/routes/auth.routes.js';
import userRoutes from './modules/users/routes/users.routes.js';
import kycRoutes from './modules/kyc/routes/kyc.routes.js';
import securityRoutes from './modules/security/routes/security.routes.js';
import walletRoutes from './modules/wallet/routes/wallet.routes.js';
import paymentRoutes from './modules/payments/routes/payments.routes.js';
import transferRoutes from './modules/transfers/routes/transfers.routes.js';
import refundRoutes from './modules/refunds/routes/refunds.routes.js';

// ============================================================
// Express Application
// ============================================================

const app = express();

// --------------------------------------------------------
// Security
// --------------------------------------------------------

app.use(helmet({
  contentSecurityPolicy: isProduction ? undefined : false,
  crossOriginEmbedderPolicy: false,
}));

// --------------------------------------------------------
// CORS
// --------------------------------------------------------

app.use(cors({
  origin: corsOrigins,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-API-Key', 'X-Request-Id'],
  exposedHeaders: ['X-Request-Id', 'X-RateLimit-Limit', 'X-RateLimit-Remaining', 'X-RateLimit-Reset'],
  credentials: true,
}));

// --------------------------------------------------------
// Body parsing
// --------------------------------------------------------

// Standard JSON body parser
app.use(express.json({ limit: '10mb' }));

// Raw body parser for webhook inbound routes (needed for HMAC verification)
// Applied ONLY to the Goat Pay webhook path via a route-specific middleware below.

// --------------------------------------------------------
// Compression
// --------------------------------------------------------

app.use(compression());

// --------------------------------------------------------
// Request ID
// --------------------------------------------------------

app.use(requestIdMiddleware);

// --------------------------------------------------------
// HTTP logging (Morgan -> Winston)
// --------------------------------------------------------

const morganStream = {
  write: (message: string) => {
    logger.http(message.trim());
  },
};

app.use(
  morgan(
    ':method :url :status :res[content-length] - :response-time ms',
    { stream: morganStream },
  ),
);

// --------------------------------------------------------
// Global rate limiting (tier 1 of 3)
// --------------------------------------------------------

app.use(globalRateLimitMiddleware);

// --------------------------------------------------------
// Health check
// --------------------------------------------------------

app.get('/health', (_req, res) => {
  res.status(200).json({
    success: true,
    message: 'Monkey Pay is running',
    data: {
      version: '1.0.0',
      environment: env.NODE_ENV,
      timestamp: new Date().toISOString(),
    },
    requestId: (_req as Record<string, unknown>).requestId ?? 'health',
  });
});

// --------------------------------------------------------
// Module routes
// Each module follows: routes -> validators -> service -> GoatPayClient/Supabase
// --------------------------------------------------------

// Auth routes (public — no requireAuth at mount level; individual routes handle auth)
app.use('/api/auth', authRoutes);

// User routes (requireAuth applied per-route in the router)
app.use('/api/users', userRoutes);

// KYC routes (requireAuth applied per-route in the router)
app.use('/api/kyc', kycRoutes);

// Security routes (requireAuth applied per-route in the router)
app.use('/api/security', securityRoutes);

// Financial module routes (requireAuth applied per-route in each router)
app.use('/api/wallet', walletRoutes);
app.use('/api/payments', paymentRoutes);
app.use('/api/transfers', transferRoutes);
app.use('/api/refunds', refundRoutes);

// API Keys (requireAuth per-route)
app.use('/api/api-keys', apiKeyRoutes);

// Webhooks outbound - merchant webhook CRUD (requireAuth per-route)
app.use('/api/webhooks', webhookOutboundRoutes);

// Webhooks inbound - Goat Pay → Backend (NO auth, signature-verified)
app.use('/api/webhooks/goatpay', goatpayWebhookRoutes);

// MED / Disputes (requireAuth per-route)
app.use('/api/meds', medRoutes);

// Notifications (requireAuth per-route)
app.use('/api/notifications', notificationRoutes);

// Reports / Analytics (requireAuth per-route)
app.use('/api/reports', reportRoutes);

// Audit logs (admin only)
app.use('/api/audit', requireRole(UserRole.ADMIN), auditRoutes);

// Admin operations (admin only)
app.use('/api/admin', requireRole(UserRole.ADMIN), adminRoutes);

// Subaccounts management (admin only)
app.use('/api/subaccounts', requireRole(UserRole.ADMIN), subaccountRoutes);

// --------------------------------------------------------
// 404 handler
// --------------------------------------------------------

app.use((_req, res) => {
  const requestId = (_req as Record<string, unknown>).requestId as string ?? 'unknown';
  res.status(404).json({
    success: false,
    message: 'Route not found',
    error: { code: 'NOT_FOUND', statusCode: 404 },
    requestId,
  });
});

// --------------------------------------------------------
// Global error handler (MUST be last)
// --------------------------------------------------------

app.use(errorHandler);

export default app;
