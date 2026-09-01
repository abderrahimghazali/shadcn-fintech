import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { v4 as uuidv4 } from 'uuid';

import { supabase } from '../../config/supabase.js';
import { env } from '../../config/env.js';
import logger from '../../utils/logger.js';
import { AppError, type User, type UserProfile, type UserRole } from '../../types/index.js';
import type { SignupInput } from '../validators/auth.validators.js';

// ============================================================
// Helpers
// ============================================================

interface TokenPair {
  accessToken: string;
  refreshToken: string;
}

interface JwtAccessPayload {
  sub: string;
  email: string;
  role: UserRole;
}

interface JwtRefreshPayload {
  sub: string;
  sessionId: string;
  type: 'refresh';
}

interface SafeUser {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  isActive: boolean;
  isVerified: boolean;
  createdAt: string;
}

/**
 * Strip password_hash from a user row before sending to the client.
 */
function toSafeUser(user: User, profile?: UserProfile | null): SafeUser {
  return {
    id: user.id,
    email: user.email,
    name: profile?.full_name ?? '',
    role: user.role as UserRole,
    isActive: user.is_active,
    isVerified: user.is_verified,
    createdAt: user.created_at,
  };
}

/**
 * Generate a JWT access token (15 min) and refresh token (7 days).
 */
export function generateTokens(userId: string, email: string, role: UserRole): TokenPair {
  const accessPayload: JwtAccessPayload = { sub: userId, email, role };
  const refreshPayload: JwtRefreshPayload = { sub: userId, sessionId: '', type: 'refresh' };

  const accessToken = jwt.sign(accessPayload, env.JWT_SECRET, {
    expiresIn: env.JWT_ACCESS_EXPIRES_IN,
  } as jwt.SignOptions);

  const refreshToken = jwt.sign(refreshPayload, env.JWT_REFRESH_SECRET, {
    expiresIn: env.JWT_REFRESH_EXPIRES_IN,
  } as jwt.SignOptions);

  return { accessToken, refreshToken };
}

/**
 * Create a session row in the database and return the session ID.
 * The refresh payload's sessionId is set here and the token is re-signed.
 */
export async function createSession(
  userId: string,
  email: string,
  role: UserRole,
  req: { ip?: string; headers: Record<string, string | string[] | undefined> },
): Promise<{ tokenPair: TokenPair; sessionId: string }> {
  const sessionId = uuidv4();
  const ipAddress = (req.ip ?? req.headers['x-forwarded-for'] ?? 'unknown') as string;
  const userAgent = req.headers['user-agent'] ?? 'unknown';

  // Calculate refresh token expiry as a date for the DB
  const refreshMs = parseDuration(env.JWT_REFRESH_EXPIRES_IN);
  const expiresAt = new Date(Date.now() + refreshMs).toISOString();

  // Generate tokens — first pass gets refreshToken without sessionId
  const { refreshToken: unsignedRefresh } = generateTokens(userId, email, role);

  // Re-sign refresh token with the actual sessionId
  const refreshPayload: JwtRefreshPayload = { sub: userId, sessionId, type: 'refresh' };
  const refreshToken = jwt.sign(refreshPayload, env.JWT_REFRESH_SECRET, {
    expiresIn: env.JWT_REFRESH_EXPIRES_IN,
  } as jwt.SignOptions);

  const accessToken = jwt.sign(
    { sub: userId, email, role },
    env.JWT_SECRET,
    { expiresIn: env.JWT_ACCESS_EXPIRES_IN } as jwt.SignOptions,
  );

  // Hash the refresh token for storage
  const refreshTokenHash = await bcrypt.hash(refreshToken, 12);

  const { error } = await supabase.from('sessions').insert({
    id: sessionId,
    user_id: userId,
    token_hash: refreshTokenHash,
    ip_address: ipAddress,
    user_agent: userAgent,
    is_revoked: false,
    expires_at: expiresAt,
  });

  if (error) {
    logger.error({ error, userId }, 'Failed to create session');
    throw new AppError('Failed to create session', 500, 'SESSION_CREATE_FAILED');
  }

  return { tokenPair: { accessToken, refreshToken }, sessionId };
}

/**
 * Parse a duration string like '7d' or '15m' into milliseconds.
 */
function parseDuration(duration: string): number {
  const match = duration.match(/^(\d+)([smhd])$/);
  if (!match) return 7 * 24 * 60 * 60 * 1000; // default 7d
  const num = parseInt(match[1]!, 10);
  const unit = match[2]!;
  switch (unit) {
    case 's': return num * 1000;
    case 'm': return num * 60 * 1000;
    case 'h': return num * 60 * 60 * 1000;
    case 'd': return num * 24 * 60 * 60 * 1000;
    default: return 7 * 24 * 60 * 60 * 1000;
  }
}

// ============================================================
// Service methods
// ============================================================

export interface SignupResult {
  accessToken: string;
  refreshToken: string;
  user: SafeUser;
}

/**
 * Register a new merchant account.
 */
export async function signup(
  data: SignupInput,
  req: { ip?: string; headers: Record<string, string | string[] | undefined> },
): Promise<SignupResult> {
  // Check if email already exists
  const { data: existingUser } = await supabase
    .from('users')
    .select('id')
    .eq('email', data.email)
    .single();

  if (existingUser) {
    throw new AppError('Email already registered', 409, 'EMAIL_ALREADY_EXISTS');
  }

  const userId = uuidv4();

  // Hash password
  const passwordHash = await bcrypt.hash(data.password, 12);

  // Create user
  const { error: userError } = await supabase.from('users').insert({
    id: userId,
    email: data.email,
    password_hash: passwordHash,
    role: 'merchant',
    is_active: true,
    is_verified: false,
  });

  if (userError) {
    logger.error({ error: userError, email: data.email }, 'Failed to create user');
    throw new AppError('Failed to create account', 500, 'USER_CREATE_FAILED');
  }

  // Create user profile
  const { error: profileError } = await supabase.from('user_profiles').insert({
    id: uuidv4(),
    user_id: userId,
    full_name: data.name,
  });

  if (profileError) {
    logger.error({ error: profileError, userId }, 'Failed to create user profile');
    // Best effort — don't fail signup
  }

  // Create session
  const { tokenPair } = await createSession(userId, data.email, 'merchant' as UserRole, req);

  // Fetch created user for response
  const { data: user } = await supabase
    .from('users')
    .select('*')
    .eq('id', userId)
    .single();

  const { data: profile } = await supabase
    .from('user_profiles')
    .select('*')
    .eq('user_id', userId)
    .single();

  logger.info({ userId, email: data.email }, 'User signed up');

  return {
    accessToken: tokenPair.accessToken,
    refreshToken: tokenPair.refreshToken,
    user: toSafeUser(user!, profile),
  };
}

export interface LoginResult {
  accessToken: string;
  refreshToken: string;
  user: SafeUser;
}

/**
 * Authenticate with email and password.
 */
export async function login(
  email: string,
  password: string,
  req: { ip?: string; headers: Record<string, string | string[] | undefined> },
): Promise<LoginResult> {
  // Find user by email
  const { data: user, error: findError } = await supabase
    .from('users')
    .select('*')
    .eq('email', email)
    .single();

  if (findError || !user) {
    throw new AppError('Invalid email or password', 401, 'INVALID_CREDENTIALS');
  }

  // Compare password
  const isMatch = await bcrypt.compare(password, user.password_hash);
  if (!isMatch) {
    throw new AppError('Invalid email or password', 401, 'INVALID_CREDENTIALS');
  }

  // Check account status — note: users table uses is_active boolean
  // The spec mentions 'suspended'/'banned' which maps to is_active = false
  if (!user.is_active) {
    throw new AppError('Account is suspended or banned', 403, 'ACCOUNT_SUSPENDED');
  }

  // Create session
  const { tokenPair } = await createSession(
    user.id,
    user.email,
    user.role as UserRole,
    req,
  );

  // Fetch profile
  const { data: profile } = await supabase
    .from('user_profiles')
    .select('*')
    .eq('user_id', user.id)
    .single();

  logger.info({ userId: user.id, email }, 'User logged in');

  return {
    accessToken: tokenPair.accessToken,
    refreshToken: tokenPair.refreshToken,
    user: toSafeUser(user, profile),
  };
}

/**
 * Refresh an access token using a valid refresh token.
 */
export async function refreshToken(token: string): Promise<{ accessToken: string; refreshToken: string }> {
  let payload: JwtRefreshPayload;

  try {
    payload = jwt.verify(token, env.JWT_REFRESH_SECRET) as JwtRefreshPayload;
  } catch (err) {
    if (err instanceof jwt.TokenExpiredError) {
      throw new AppError('Refresh token expired. Please log in again.', 401, 'REFRESH_TOKEN_EXPIRED');
    }
    throw new AppError('Invalid refresh token', 401, 'REFRESH_TOKEN_INVALID');
  }

  if (payload.type !== 'refresh' || !payload.sessionId) {
    throw new AppError('Invalid refresh token', 401, 'REFRESH_TOKEN_INVALID');
  }

  // Check session exists and is not revoked
  const { data: session, error: sessionError } = await supabase
    .from('sessions')
    .select('*')
    .eq('id', payload.sessionId)
    .eq('user_id', payload.sub)
    .single();

  if (sessionError || !session) {
    throw new AppError('Invalid refresh token', 401, 'REFRESH_TOKEN_INVALID');
  }

  if (session.is_revoked) {
    throw new AppError('Refresh token has been revoked', 401, 'REFRESH_TOKEN_REVOKED');
  }

  if (new Date(session.expires_at) < new Date()) {
    throw new AppError('Refresh token expired. Please log in again.', 401, 'REFRESH_TOKEN_EXPIRED');
  }

  // Verify the token hash matches
  const isMatch = await bcrypt.compare(token, session.token_hash);
  if (!isMatch) {
    throw new AppError('Invalid refresh token', 401, 'REFRESH_TOKEN_INVALID');
  }

  // Fetch user for role/email
  const { data: user } = await supabase
    .from('users')
    .select('id, email, role, is_active')
    .eq('id', payload.sub)
    .single();

  if (!user || !user.is_active) {
    throw new AppError('User not found or inactive', 401, 'USER_INACTIVE');
  }

  // Issue new access token
  const accessToken = jwt.sign(
    { sub: user.id, email: user.email, role: user.role },
    env.JWT_SECRET,
    { expiresIn: env.JWT_ACCESS_EXPIRES_IN } as jwt.SignOptions,
  );

  // Issue new refresh token (rotation)
  const newRefreshPayload: JwtRefreshPayload = {
    sub: payload.sub,
    sessionId: session.id,
    type: 'refresh',
  };
  const newRefreshToken = jwt.sign(newRefreshPayload, env.JWT_REFRESH_SECRET, {
    expiresIn: env.JWT_REFRESH_EXPIRES_IN,
  } as jwt.SignOptions);

  // Update session with new token hash
  const newTokenHash = await bcrypt.hash(newRefreshToken, 12);
  await supabase
    .from('sessions')
    .update({ token_hash: newTokenHash })
    .eq('id', session.id);

  logger.info({ userId: user.id, sessionId: session.id }, 'Token refreshed');

  return { accessToken, refreshToken: newRefreshToken };
}

/**
 * Logout — mark a session as revoked.
 */
export async function logout(userId: string, sessionId: string): Promise<void> {
  const { error } = await supabase
    .from('sessions')
    .update({ is_revoked: true })
    .eq('id', sessionId)
    .eq('user_id', userId);

  if (error) {
    logger.error({ error, userId, sessionId }, 'Failed to revoke session');
    throw new AppError('Failed to logout', 500, 'LOGOUT_FAILED');
  }

  logger.info({ userId, sessionId }, 'User logged out');
}

/**
 * Forgot password — generate a reset token and store it.
 * Always returns success to avoid revealing if the email exists.
 */
export async function forgotPassword(email: string): Promise<void> {
  const { data: user } = await supabase
    .from('users')
    .select('id')
    .eq('email', email)
    .single();

  if (!user) {
    // Don't reveal whether the email exists
    logger.info({ email }, 'Forgot password requested for non-existent email');
    return;
  }

  // Generate reset token (JWT, 1h expiry)
  const resetToken = jwt.sign(
    { sub: user.id, type: 'password_reset' },
    env.JWT_SECRET,
    { expiresIn: '1h' } as jwt.SignOptions,
  );

  // Store hashed reset token in user record (via a generic column or password_reset_token_hash)
  // We store it in the user_profiles table's business_name as a temporary hack — or better,
  // we store the token hash. Since the schema doesn't have a dedicated column, we'll
  // just store the raw token hash in the sessions table as a special "reset" session.
  const tokenHash = await bcrypt.hash(resetToken, 12);
  const resetSessionId = uuidv4();

  const { error } = await supabase.from('sessions').insert({
    id: resetSessionId,
    user_id: user.id,
    token_hash: tokenHash,
    user_agent: 'password_reset',
    is_revoked: false,
    expires_at: new Date(Date.now() + 60 * 60 * 1000).toISOString(), // 1 hour
  });

  if (error) {
    logger.error({ error, userId: user.id }, 'Failed to store reset token');
    throw new AppError('Failed to process request', 500, 'PASSWORD_RESET_FAILED');
  }

  // TODO: Send email with reset token link
  // For now, the token is returned only for testing.
  // In production, this would be sent via email service.
  logger.info({ userId: user.id }, 'Password reset token generated');
}

/**
 * Reset password using a token from forgot-password flow.
 */
export async function resetPassword(
  token: string,
  newPassword: string,
): Promise<void> {
  // Verify token
  let payload: { sub: string; type: string };

  try {
    payload = jwt.verify(token, env.JWT_SECRET) as { sub: string; type: string };
  } catch {
    throw new AppError('Invalid or expired reset token', 401, 'RESET_TOKEN_INVALID');
  }

  if (payload.type !== 'password_reset') {
    throw new AppError('Invalid reset token', 401, 'RESET_TOKEN_INVALID');
  }

  // Find the reset session (user_agent = 'password_reset')
  const { data: resetSessions, error: findError } = await supabase
    .from('sessions')
    .select('*')
    .eq('user_id', payload.sub)
    .eq('user_agent', 'password_reset')
    .eq('is_revoked', false);

  if (findError || !resetSessions || resetSessions.length === 0) {
    throw new AppError('Invalid or expired reset token', 401, 'RESET_TOKEN_INVALID');
  }

  // Verify the token hash against all non-revoked reset sessions
  let matchedSession = false;
  for (const session of resetSessions) {
    const isMatch = await bcrypt.compare(token, session.token_hash);
    if (isMatch) {
      matchedSession = true;
      break;
    }
  }

  if (!matchedSession) {
    throw new AppError('Invalid or expired reset token', 401, 'RESET_TOKEN_INVALID');
  }

  // Hash new password
  const passwordHash = await bcrypt.hash(newPassword, 12);

  // Update user password
  const { error: updateError } = await supabase
    .from('users')
    .update({ password_hash: passwordHash, updated_at: new Date().toISOString() })
    .eq('id', payload.sub);

  if (updateError) {
    logger.error({ error: updateError, userId: payload.sub }, 'Failed to update password');
    throw new AppError('Failed to reset password', 500, 'PASSWORD_UPDATE_FAILED');
  }

  // Revoke all other sessions (force re-login everywhere)
  await supabase
    .from('sessions')
    .update({ is_revoked: true })
    .eq('user_id', payload.sub)
    .neq('user_agent', 'password_reset');

  logger.info({ userId: payload.sub }, 'Password reset successfully');
}

/**
 * Update password for an authenticated user.
 */
export async function updatePassword(
  userId: string,
  currentPassword: string,
  newPassword: string,
  req: { ip?: string; headers: Record<string, string | string[] | undefined> },
): Promise<{ accessToken: string; refreshToken: string }> {
  // Fetch user with password hash
  const { data: user, error } = await supabase
    .from('users')
    .select('*')
    .eq('id', userId)
    .single();

  if (error || !user) {
    throw new AppError('User not found', 404, 'USER_NOT_FOUND');
  }

  // Verify current password
  const isMatch = await bcrypt.compare(currentPassword, user.password_hash);
  if (!isMatch) {
    throw new AppError('Current password is incorrect', 401, 'INVALID_CURRENT_PASSWORD');
  }

  // Hash new password
  const passwordHash = await bcrypt.hash(newPassword, 12);

  // Update password
  const { error: updateError } = await supabase
    .from('users')
    .update({ password_hash: passwordHash, updated_at: new Date().toISOString() })
    .eq('id', userId);

  if (updateError) {
    logger.error({ error: updateError, userId }, 'Failed to update password');
    throw new AppError('Failed to update password', 500, 'PASSWORD_UPDATE_FAILED');
  }

  // Revoke all existing sessions (force re-login)
  await supabase
    .from('sessions')
    .update({ is_revoked: true })
    .eq('user_id', userId);

  // Create a new session with fresh tokens
  const { tokenPair } = await createSession(userId, user.email, user.role as UserRole, req);

  logger.info({ userId }, 'Password updated');

  return tokenPair;
}
