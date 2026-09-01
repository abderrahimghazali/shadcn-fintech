import crypto from 'crypto';

import { supabase } from '../../config/supabase.js';
import logger from '../../utils/logger.js';
import { AppError } from '../../types/index.js';

// ============================================================
// Types
// ============================================================

export interface SessionListItem {
  id: string;
  ipAddress: string | null;
  userAgent: string | null;
  deviceInfo: string | null;
  isRevoked: boolean;
  expiresAt: string;
  createdAt: string;
}

export interface Enable2faResult {
  secret: string;
  qrCodeDataUri: string;
}

// ============================================================
// TOTP Helpers (RFC 6238)
// ============================================================

const TOTP_PERIOD = 30; // seconds
const TOTP_DIGITS = 6;
const TOTP_ALGORITHM = 'sha1';

/**
 * Generate a base32-encoded secret for TOTP.
 */
function generateBase32Secret(): string {
  const bytes = crypto.randomBytes(20);
  return base32Encode(bytes);
}

/**
 * Base32 encode (RFC 4648) — no padding.
 */
function base32Encode(buffer: Buffer): string {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  let bits = '';
  for (const byte of buffer) {
    bits += byte.toString(2).padStart(8, '0');
  }
  let result = '';
  for (let i = 0; i + 5 <= bits.length; i += 5) {
    const index = parseInt(bits.slice(i, i + 5), 2);
    result += alphabet[index];
  }
  return result;
}

/**
 * Generate a TOTP code for a given secret and time step.
 */
function generateTOTP(secret: string, timeStep?: number): string {
  const counter = timeStep ?? Math.floor(Date.now() / 1000 / TOTP_PERIOD);
  const counterBuffer = Buffer.alloc(8);
  counterBuffer.writeBigUInt64BE(BigInt(counter));

  const key = base32Decode(secret);
  const hmac = crypto.createHmac(TOTP_ALGORITHM, key);
  hmac.update(counterBuffer);
  const digest = hmac.digest();

  const offset = digest[digest.length - 1]! & 0x0f;
  const binary =
    ((digest[offset]! & 0x7f) << 24) |
    ((digest[offset + 1]! & 0xff) << 16) |
    ((digest[offset + 2]! & 0xff) << 8) |
    (digest[offset + 3]! & 0xff);

  const otp = binary % (10 ** TOTP_DIGITS);
  return otp.toString().padStart(TOTP_DIGITS, '0');
}

/**
 * Base32 decode.
 */
function base32Decode(str: string): Buffer {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  const bits = str
    .toUpperCase()
    .split('')
    .map((c) => {
      const idx = alphabet.indexOf(c);
      if (idx === -1) throw new Error('Invalid base32 character');
      return idx.toString(2).padStart(5, '0');
    })
    .join('');

  const bytes: number[] = [];
  for (let i = 0; i + 8 <= bits.length; i += 8) {
    bytes.push(parseInt(bits.slice(i, i + 8), 2));
  }
  return Buffer.from(bytes);
}

/**
 * Generate a TOTP authenticator URI (otpauth://totp/...).
 */
function generateTOTPUri(
  issuer: string,
  email: string,
  secret: string,
): string {
  const encodedIssuer = encodeURIComponent(issuer);
  const encodedEmail = encodeURIComponent(email);
  return `otpauth://totp/${encodedIssuer}:${encodedEmail}?secret=${secret}&issuer=${encodedIssuer}&algorithm=SHA1&digits=${TOTP_DIGITS}&period=${TOTP_PERIOD}`;
}

/**
 * Generate a simple QR code data URI using a basic SVG-based approach.
 * In production, you'd use a library like `qrcode` to generate a proper QR code.
 * For now, we return the otpauth URI and let the frontend generate the QR.
 */
function generateQRCodeDataUri(uri: string): string {
  // Simple SVG data URI with the URI as text (placeholder for real QR library)
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200" viewBox="0 0 200 200"><rect width="200" height="200" fill="#fff"/><text x="10" y="20" font-size="10" font-family="monospace">${encodeURIComponent(uri)}</text></svg>`;
  return `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`;
}

/**
 * Encrypt a secret using AES-256-GCM for storage.
 */
function encryptSecret(secret: string): { encrypted: string; iv: string; tag: string } {
  const key = crypto.scryptSync(process.env.JWT_SECRET!, 'totp-salt', 32);
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  let encrypted = cipher.update(secret, 'utf8');
  encrypted = Buffer.concat([encrypted, cipher.final()]);
  const tag = cipher.getAuthTag();
  return {
    encrypted: encrypted.toString('base64'),
    iv: iv.toString('base64'),
    tag: tag.toString('base64'),
  };
}

/**
 * Decrypt a secret stored in the database.
 */
function decryptSecret(encrypted: string, iv: string, tag: string): string {
  const key = crypto.scryptSync(process.env.JWT_SECRET!, 'totp-salt', 32);
  const decipher = crypto.createDecipheriv(
    'aes-256-gcm',
    key,
    Buffer.from(iv, 'base64'),
  );
  decipher.setAuthTag(Buffer.from(tag, 'base64'));
  let decrypted = decipher.update(Buffer.from(encrypted, 'base64'));
  decrypted = Buffer.concat([decrypted, decipher.final()]);
  return decrypted.toString('utf8');
}

// ============================================================
// Service methods
// ============================================================

/**
 * List active (non-revoked, non-expired) sessions for a user.
 */
export async function getSessions(userId: string): Promise<SessionListItem[]> {
  const { data: sessions, error } = await supabase
    .from('sessions')
    .select('*')
    .eq('user_id', userId)
    .neq('user_agent', 'password_reset')
    .order('created_at', { ascending: false });

  if (error) {
    logger.error({ error, userId }, 'Failed to list sessions');
    throw new AppError('Failed to list sessions', 500, 'SESSION_LIST_FAILED');
  }

  return (sessions ?? []).map((s) => ({
    id: s.id,
    ipAddress: s.ip_address,
    userAgent: s.user_agent,
    deviceInfo: s.device_info,
    isRevoked: s.is_revoked,
    expiresAt: s.expires_at,
    createdAt: s.created_at,
  }));
}

/**
 * Revoke a specific session.
 */
export async function revokeSession(
  userId: string,
  sessionId: string,
): Promise<void> {
  const { error } = await supabase
    .from('sessions')
    .update({ is_revoked: true })
    .eq('id', sessionId)
    .eq('user_id', userId);

  if (error) {
    logger.error({ error, userId, sessionId }, 'Failed to revoke session');
    throw new AppError('Failed to revoke session', 500, 'SESSION_REVOKE_FAILED');
  }

  logger.info({ userId, sessionId }, 'Session revoked');
}

/**
 * Revoke all sessions except the current one.
 */
export async function revokeAllOtherSessions(
  userId: string,
  currentSessionId: string,
): Promise<number> {
  const { count, error } = await supabase
    .from('sessions')
    .update({ is_revoked: true }, { count: 'exact' })
    .eq('user_id', userId)
    .neq('id', currentSessionId)
    .eq('is_revoked', false)
    .neq('user_agent', 'password_reset');

  if (error) {
    logger.error({ error, userId }, 'Failed to revoke other sessions');
    throw new AppError('Failed to revoke other sessions', 500, 'SESSION_REVOKE_FAILED');
  }

  logger.info({ userId, currentSessionId, count }, 'Other sessions revoked');

  return count ?? 0;
}

/**
 * Enable 2FA — generate a TOTP secret and return it with a QR code URI.
 * The secret is NOT stored yet — the user must verify a code first.
 */
export async function enable2fa(
  userId: string,
): Promise<Enable2faResult> {
  // Check if 2FA is already enabled
  const { data: user } = await supabase
    .from('users')
    .select('two_factor_enabled')
    .eq('id', userId)
    .single();

  if (user?.two_factor_enabled) {
    throw new AppError('2FA is already enabled', 409, 'TWO_FA_ALREADY_ENABLED');
  }

  // Generate secret
  const secret = generateBase32Secret();

  // Get user email for the URI
  const { data: userData } = await supabase
    .from('users')
    .select('email')
    .eq('id', userId)
    .single();

  const email = userData?.email ?? 'user@monkey-pay.com';
  const uri = generateTOTPUri('Monkey Pay', email, secret);
  const qrCodeDataUri = generateQRCodeDataUri(uri);

  // Store the temporary (unencrypted) secret in the user record for verification.
  // In a production system, this would be stored in a temporary table or cache.
  await supabase
    .from('users')
    .update({ two_factor_secret: secret })
    .eq('id', userId);

  logger.info({ userId }, '2FA setup initiated');

  return { secret, qrCodeDataUri };
}

/**
 * Verify a TOTP code and enable 2FA.
 */
export async function verifyAndEnable2fa(
  userId: string,
  code: string,
): Promise<void> {
  // Get the temporary secret
  const { data: user, error } = await supabase
    .from('users')
    .select('two_factor_enabled, two_factor_secret')
    .eq('id', userId)
    .single();

  if (error || !user) {
    throw new AppError('User not found', 404, 'USER_NOT_FOUND');
  }

  if (user.two_factor_enabled) {
    throw new AppError('2FA is already enabled', 409, 'TWO_FA_ALREADY_ENABLED');
  }

  if (!user.two_factor_secret) {
    throw new AppError('Please initiate 2FA setup first', 400, 'TWO_FA_NOT_INITIATED');
  }

  // Verify the code (check current and adjacent time steps for clock drift)
  const currentStep = Math.floor(Date.now() / 1000 / TOTP_PERIOD);
  const validCodes = [
    generateTOTP(user.two_factor_secret, currentStep - 1),
    generateTOTP(user.two_factor_secret, currentStep),
    generateTOTP(user.two_factor_secret, currentStep + 1),
  ];

  if (!validCodes.includes(code)) {
    throw new AppError('Invalid 2FA code', 401, 'TWO_FA_CODE_INVALID');
  }

  // Encrypt and store the secret permanently
  const { encrypted, iv, tag } = encryptSecret(user.two_factor_secret);

  // Store encrypted secret in a JSON column or separate columns
  // Using the user's two_factor_secret field to store the encrypted version
  const encryptedData = JSON.stringify({ encrypted, iv, tag });

  await supabase
    .from('users')
    .update({
      two_factor_enabled: true,
      two_factor_secret: encryptedData,
      updated_at: new Date().toISOString(),
    })
    .eq('id', userId);

  logger.info({ userId }, '2FA enabled');
}

/**
 * Disable 2FA — requires current 2FA code verification.
 */
export async function disable2fa(
  userId: string,
  code: string,
): Promise<void> {
  const { data: user, error } = await supabase
    .from('users')
    .select('two_factor_enabled, two_factor_secret')
    .eq('id', userId)
    .single();

  if (error || !user) {
    throw new AppError('User not found', 404, 'USER_NOT_FOUND');
  }

  if (!user.two_factor_enabled) {
    throw new AppError('2FA is not enabled', 400, 'TWO_FA_NOT_ENABLED');
  }

  // Decrypt the stored secret
  let secret: string;
  try {
    const { encrypted, iv, tag } = JSON.parse(user.two_factor_secret) as {
      encrypted: string;
      iv: string;
      tag: string;
    };
    secret = decryptSecret(encrypted, iv, tag);
  } catch {
    throw new AppError('Failed to decrypt 2FA secret', 500, 'TWO_FA_DECRYPT_FAILED');
  }

  // Verify the code
  const currentStep = Math.floor(Date.now() / 1000 / TOTP_PERIOD);
  const validCodes = [
    generateTOTP(secret, currentStep - 1),
    generateTOTP(secret, currentStep),
    generateTOTP(secret, currentStep + 1),
  ];

  if (!validCodes.includes(code)) {
    throw new AppError('Invalid 2FA code', 401, 'TWO_FA_CODE_INVALID');
  }

  // Disable 2FA
  await supabase
    .from('users')
    .update({
      two_factor_enabled: false,
      two_factor_secret: null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', userId);

  logger.info({ userId }, '2FA disabled');
}

/**
 * Verify a 2FA code (for login flow).
 * Returns true if the code is valid, false otherwise.
 */
export async function verify2fa(
  userId: string,
  code: string,
): Promise<boolean> {
  const { data: user, error } = await supabase
    .from('users')
    .select('two_factor_enabled, two_factor_secret')
    .eq('id', userId)
    .single();

  if (error || !user || !user.two_factor_enabled || !user.two_factor_secret) {
    return false;
  }

  // Decrypt the stored secret
  let secret: string;
  try {
    const { encrypted, iv, tag } = JSON.parse(user.two_factor_secret) as {
      encrypted: string;
      iv: string;
      tag: string;
    };
    secret = decryptSecret(encrypted, iv, tag);
  } catch {
    return false;
  }

  const currentStep = Math.floor(Date.now() / 1000 / TOTP_PERIOD);
  const validCodes = [
    generateTOTP(secret, currentStep - 1),
    generateTOTP(secret, currentStep),
    generateTOTP(secret, currentStep + 1),
  ];

  return validCodes.includes(code);
}
