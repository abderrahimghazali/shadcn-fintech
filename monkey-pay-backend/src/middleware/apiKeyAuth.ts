import crypto from 'node:crypto';
import type { Request, Response, NextFunction } from 'express';
import { supabase } from '../config/supabase.js';
import { AppError, type ApiKeyAuthenticatedRequest } from '../types/index.js';
import logger from '../utils/logger.js';

/**
 * API Key authentication middleware.
 * Extracts the raw key from X-API-Key header, hashes it with SHA-256,
 * looks up the hash in the api_keys table, checks scopes, and attaches
 * apiKey + user to the request.
 *
 * Usage: requireApiKey('payments:read', 'payments:write')
 */
export function requireApiKey(...requiredScopes: string[]) {
  return async (req: Request, _res: Response, next: NextFunction): Promise<void> => {
    try {
      const rawKey = req.headers['x-api-key'] as string | undefined;
      if (!rawKey) {
        throw new AppError('Missing X-API-Key header', 401, 'API_KEY_MISSING');
      }

      if (!rawKey.startsWith('mk_live_')) {
        throw new AppError('Invalid API key format', 401, 'API_KEY_INVALID');
      }

      // Hash the raw key for DB lookup
      const keyHash = crypto.createHash('sha256').update(rawKey).digest('hex');

      // Look up in database
      const { data: apiKeyRow, error: dbError } = await supabase
        .from('api_keys')
        .select('id, user_id, scopes, is_active, expires_at, users!inner(id, email, role, is_active)')
        .eq('key_hash', keyHash)
        .eq('is_active', true)
        .single();

      if (dbError || !apiKeyRow) {
        throw new AppError('Invalid or revoked API key', 401, 'API_KEY_INVALID');
      }

      // Check expiry
      if (apiKeyRow.expires_at && new Date(apiKeyRow.expires_at) < new Date()) {
        throw new AppError('API key expired', 401, 'API_KEY_EXPIRED');
      }

      // Check user is active
      const user = apiKeyRow.users as { id: string; email: string; role: string; is_active: boolean };
      if (!user.is_active) {
        throw new AppError('User account is disabled', 403, 'ACCOUNT_DISABLED');
      }

      // Check scopes
      const keyScopes: string[] = apiKeyRow.scopes ?? [];
      for (const scope of requiredScopes) {
        if (!keyScopes.includes(scope)) {
          throw new AppError(
            `API key lacks required scope: ${scope}`,
            403,
            'INSUFFICIENT_SCOPES',
          );
        }
      }

      // Update last_used_at asynchronously (fire-and-forget)
      supabase
        .from('api_keys')
        .update({ last_used_at: new Date().toISOString() })
        .eq('id', apiKeyRow.id)
        .then()
        .catch((err) => {
          logger.warn({ err }, 'Failed to update API key last_used_at');
        });

      // Attach to request
      const apiReq = req as unknown as ApiKeyAuthenticatedRequest;
      apiReq.apiKey = {
        id: apiKeyRow.id,
        userId: apiKeyRow.user_id,
        scopes: keyScopes,
      };
      apiReq.user = {
        id: user.id,
        email: user.email,
        role: user.role as ApiKeyAuthenticatedRequest['user']['role'],
      };

      next();
    } catch (err) {
      next(err);
    }
  };
}
