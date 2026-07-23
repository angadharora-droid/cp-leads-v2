import crypto from 'crypto';
import env from '../config/env.js';

export const REFRESH_COOKIE_NAME = 'cph_rt';

export function hashToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

export function generateRefreshToken() {
  const token = crypto.randomBytes(48).toString('hex');
  const tokenHash = hashToken(token);
  return { token, tokenHash };
}

export function refreshExpiryDate() {
  const ms = env.REFRESH_TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000;
  return new Date(Date.now() + ms);
}

export function refreshCookieOptions() {
  return {
    httpOnly: true,
    // In production the SPA and API live on different origins, so the cookie
    // must be SameSite=None (with Secure) to be sent at all. Browsers that
    // block third-party cookies fall back to the refresh token in the body.
    sameSite: env.isProduction ? 'none' : 'lax',
    secure: env.isProduction,
    path: '/api/auth',
    maxAge: env.REFRESH_TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000,
  };
}

export default {
  REFRESH_COOKIE_NAME,
  hashToken,
  generateRefreshToken,
  refreshExpiryDate,
  refreshCookieOptions,
};
