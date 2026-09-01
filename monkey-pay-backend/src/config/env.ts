import { z } from 'zod';
import 'dotenv/config';

const envSchema = z.object({
  // General
  NODE_ENV: z
    .enum(['development', 'staging', 'production'])
    .default('development'),
  PORT: z.coerce.number().int().positive().default(4000),

  // JWT
  JWT_SECRET: z.string().min(32, 'JWT_SECRET must be at least 32 characters'),
  JWT_REFRESH_SECRET: z
    .string()
    .min(32, 'JWT_REFRESH_SECRET must be at least 32 characters'),
  JWT_ACCESS_EXPIRES_IN: z.string().default('15m'),
  JWT_REFRESH_EXPIRES_IN: z.string().default('7d'),

  // Supabase
  SUPABASE_URL: z.string().url('SUPABASE_URL must be a valid URL'),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1, 'SUPABASE_SERVICE_ROLE_KEY is required'),

  // Goat Pay
  GOATPAY_API_KEY: z.string().min(1, 'GOATPAY_API_KEY is required'),
  GOATPAY_BASE_URL: z.string().url().default('https://api.goatpay.com.br/v1'),
  GOATPAY_WEBHOOK_SECRET: z.string().min(1, 'GOATPAY_WEBHOOK_SECRET is required'),

  // CORS
  CORS_ALLOWED_ORIGINS: z.string().default('http://localhost:3000'),
  FRONTEND_URL: z.string().url().default('http://localhost:3000'),
  BACKEND_PUBLIC_URL: z.string().default('http://localhost:4000'),

  // Rate Limiting
  RATE_LIMIT_GLOBAL_MAX: z.coerce.number().int().positive().default(100),
  RATE_LIMIT_GLOBAL_WINDOW_MS: z.coerce.number().int().positive().default(60000),
  RATE_LIMIT_USER_MAX: z.coerce.number().int().positive().default(60),
  RATE_LIMIT_USER_WINDOW_MS: z.coerce.number().int().positive().default(60000),
  RATE_LIMIT_API_KEY_MAX: z.coerce.number().int().positive().default(200),
  RATE_LIMIT_API_KEY_WINDOW_MS: z.coerce.number().int().positive().default(60000),

  // Logging
  LOG_LEVEL: z
    .enum(['error', 'warn', 'info', 'http', 'verbose', 'debug', 'silly'])
    .default('info'),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error('❌ Invalid environment variables:');
  for (const issue of parsed.error.issues) {
    console.error(`  - ${issue.path.join('.')}: ${issue.message}`);
  }
  process.exit(1);
}

export const env = parsed.data;

export type Env = z.infer<typeof envSchema>;

export const isProduction = env.NODE_ENV === 'production';
export const isDevelopment = env.NODE_ENV === 'development';

/**
 * Parsed CORS origins as an array of strings.
 */
export const corsOrigins: string[] = env.CORS_ALLOWED_ORIGINS
  .split(',')
  .map((o) => o.trim())
  .filter(Boolean);
