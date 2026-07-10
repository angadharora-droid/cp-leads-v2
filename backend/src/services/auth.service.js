import crypto from 'crypto';
import bcrypt from 'bcryptjs';

import env from '../config/env.js';
import { AppError } from '../utils/apiResponse.js';
import { signAccessToken } from '../utils/jwt.js';
import {
  generateRefreshToken,
  hashToken,
  refreshExpiryDate,
} from '../utils/tokens.js';
import { writeAudit } from '../utils/audit.js';
import User from '../models/User.js';
import RefreshToken from '../models/RefreshToken.js';

/**
 * Derive request context (ip + userAgent) used for storing refresh-token metadata.
 */
function reqContext(req) {
  const ip =
    req?.headers?.['x-forwarded-for']?.split(',')[0]?.trim() ||
    req?.ip ||
    req?.socket?.remoteAddress ||
    '';
  const userAgent = req?.headers?.['user-agent'] || '';
  return { ip, userAgent };
}

/**
 * Mint an access token for a user document.
 */
function issueAccessToken(user) {
  return signAccessToken({ sub: String(user._id), role: user.role });
}

/**
 * Persist a brand-new refresh token (new family) for the given user and return
 * the raw token (to be set as a cookie) plus the stored document.
 */
async function createRefreshTokenRecord({ user, family, req }) {
  const { token, tokenHash } = generateRefreshToken();
  const { ip, userAgent } = reqContext(req);

  const doc = await RefreshToken.create({
    user: user._id,
    tokenHash,
    family,
    expiresAt: refreshExpiryDate(),
    userAgent,
    ip,
  });

  return { token, doc };
}

/**
 * Authenticate a user with email + password.
 * On success: update lastLoginAt, mint access token + a fresh refresh-token family.
 * Returns { user, accessToken, refreshToken } where refreshToken is the RAW value
 * the controller must place in the cph_rt cookie.
 */
export async function login({ email, password, req }) {
  const user = await User.findOne({ email });

  if (!user || !user.isActive) {
    await writeAudit({
      req,
      actor: user || null,
      action: 'login_failed',
      entityType: 'User',
      entityId: user?._id,
      summary: `Failed login attempt for ${email}`,
      meta: { email, reason: !user ? 'no_such_user' : 'inactive' },
    });
    throw new AppError('Invalid email or password', 401, 'INVALID_CREDENTIALS');
  }

  const passwordOk = await user.comparePassword(password);
  if (!passwordOk) {
    await writeAudit({
      req,
      actor: user,
      action: 'login_failed',
      entityType: 'User',
      entityId: user._id,
      summary: `Failed login attempt for ${email}`,
      meta: { email, reason: 'bad_password' },
    });
    throw new AppError('Invalid email or password', 401, 'INVALID_CREDENTIALS');
  }

  user.lastLoginAt = new Date();
  await user.save();

  const family = crypto.randomUUID();
  const { token: refreshToken } = await createRefreshTokenRecord({
    user,
    family,
    req,
  });
  const accessToken = issueAccessToken(user);

  await writeAudit({
    req,
    actor: user,
    action: 'login_success',
    entityType: 'User',
    entityId: user._id,
    summary: `${user.email} logged in`,
  });

  return { user, accessToken, refreshToken };
}

/**
 * Rotate a refresh token. Implements reuse detection:
 *  - No cookie / unknown token -> 401.
 *  - Token already rotated or revoked -> REUSE: revoke entire family, audit, 401.
 *  - Token expired -> revoke it, 401.
 *  - Valid -> rotate (mark rotatedAt + replacedByHash), mint a new token in the
 *    same family, return new access token + new raw refresh token.
 *
 * Returns { accessToken, refreshToken } on success. On any failure the controller
 * is expected to clear the cookie (it does so on the thrown AppError).
 */
export async function refresh({ refreshToken: rawToken, req }) {
  if (!rawToken) {
    throw new AppError('Refresh token missing', 401, 'REFRESH_INVALID');
  }

  const tokenHash = hashToken(rawToken);
  const existing = await RefreshToken.findOne({ tokenHash });

  if (!existing) {
    throw new AppError('Invalid refresh token', 401, 'REFRESH_INVALID');
  }

  // Reuse detection: a token that has already been rotated or revoked must
  // never be presented again. If it is, the whole family is compromised.
  if (existing.rotatedAt || existing.revokedAt) {
    const now = new Date();
    await RefreshToken.updateMany(
      { family: existing.family, revokedAt: null },
      { $set: { revokedAt: now } }
    );

    await writeAudit({
      req,
      actor: existing.user ? { _id: existing.user } : null,
      action: 'token_reuse_detected',
      entityType: 'RefreshToken',
      entityId: existing._id,
      summary: 'Refresh token reuse detected; family revoked',
      meta: { family: existing.family },
    });

    throw new AppError(
      'Refresh token reuse detected',
      401,
      'REFRESH_REUSE'
    );
  }

  if (existing.expiresAt.getTime() <= Date.now()) {
    existing.revokedAt = new Date();
    await existing.save();
    throw new AppError('Refresh token expired', 401, 'REFRESH_EXPIRED');
  }

  const user = await User.findById(existing.user);
  if (!user || !user.isActive) {
    existing.revokedAt = new Date();
    await existing.save();
    throw new AppError('User no longer active', 401, 'USER_INACTIVE');
  }

  // Mint the replacement token in the SAME family.
  const { token: newRawToken, tokenHash: newTokenHash } = generateRefreshToken();
  const { ip, userAgent } = reqContext(req);

  const replacement = await RefreshToken.create({
    user: user._id,
    tokenHash: newTokenHash,
    family: existing.family,
    expiresAt: refreshExpiryDate(),
    userAgent,
    ip,
  });

  existing.rotatedAt = new Date();
  existing.replacedByHash = newTokenHash;
  await existing.save();

  const accessToken = issueAccessToken(user);

  return {
    accessToken,
    refreshToken: newRawToken,
    replacementId: replacement._id,
  };
}

/**
 * Logout: revoke the current refresh token (if present/known). Always succeeds
 * so the controller can clear the cookie regardless.
 */
export async function logout({ refreshToken: rawToken, req }) {
  if (rawToken) {
    const tokenHash = hashToken(rawToken);
    const existing = await RefreshToken.findOne({ tokenHash });
    if (existing && !existing.revokedAt) {
      existing.revokedAt = new Date();
      await existing.save();

      await writeAudit({
        req,
        actor: existing.user ? { _id: existing.user } : req?.user?.user,
        action: 'logout',
        entityType: 'RefreshToken',
        entityId: existing._id,
        summary: 'User logged out',
        meta: { family: existing.family },
      });
    }
  }
  return {};
}

/**
 * Change the password of the authenticated user.
 */
export async function changePassword({ user, currentPassword, newPassword, req }) {
  const fresh = await User.findById(user._id || user.id);
  if (!fresh) {
    throw new AppError('User not found', 404, 'NOT_FOUND');
  }

  const ok = await fresh.comparePassword(currentPassword);
  if (!ok) {
    throw new AppError(
      'Current password is incorrect',
      400,
      'INVALID_CURRENT_PASSWORD'
    );
  }

  fresh.passwordHash = await bcrypt.hash(newPassword, env.BCRYPT_ROUNDS);
  await fresh.save();

  // Invalidate all existing refresh tokens for this user as a security measure.
  await RefreshToken.updateMany(
    { user: fresh._id, revokedAt: null },
    { $set: { revokedAt: new Date() } }
  );

  await writeAudit({
    req,
    actor: fresh,
    action: 'password_changed',
    entityType: 'User',
    entityId: fresh._id,
    summary: `${fresh.email} changed their password`,
  });

  return { user: fresh };
}

export default { login, refresh, logout, changePassword };
