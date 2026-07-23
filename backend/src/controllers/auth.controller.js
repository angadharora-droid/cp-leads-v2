import asyncHandler from '../utils/asyncHandler.js';
import { sendOk } from '../utils/apiResponse.js';
import { REFRESH_COOKIE_NAME, refreshCookieOptions } from '../utils/tokens.js';
import * as authService from '../services/auth.service.js';

/**
 * Set the refresh-token cookie with the configured options.
 */
function setRefreshCookie(res, token) {
  res.cookie(REFRESH_COOKIE_NAME, token, refreshCookieOptions());
}

/**
 * Clear the refresh-token cookie. Must use the same path/options the cookie was
 * set with so the browser actually removes it.
 */
function clearRefreshCookie(res) {
  const { maxAge, ...opts } = refreshCookieOptions();
  res.clearCookie(REFRESH_COOKIE_NAME, opts);
}

/**
 * Resolve the raw refresh token: httpOnly cookie first, then a string
 * `refreshToken` in the body (cross-origin clients that can't use cookies).
 */
function readRefreshToken(req) {
  const cookieToken = req.cookies?.[REFRESH_COOKIE_NAME];
  if (cookieToken) return cookieToken;
  const bodyToken = req.body?.refreshToken;
  return typeof bodyToken === 'string' && bodyToken ? bodyToken : undefined;
}

export const login = asyncHandler(async (req, res) => {
  const { email, password } = req.body;
  const { user, accessToken, refreshToken } = await authService.login({
    email,
    password,
    req,
  });

  setRefreshCookie(res, refreshToken);
  // The refresh token is also returned in the body so cross-origin clients
  // (where third-party cookies may be blocked) can store and resend it.
  return sendOk(res, { user, accessToken, refreshToken });
});

export const refresh = asyncHandler(async (req, res) => {
  const rawToken = readRefreshToken(req);

  try {
    const { accessToken, refreshToken } = await authService.refresh({
      refreshToken: rawToken,
      req,
    });
    setRefreshCookie(res, refreshToken);
    return sendOk(res, { accessToken, refreshToken });
  } catch (err) {
    // Any refresh failure invalidates the session: clear the cookie.
    clearRefreshCookie(res);
    throw err;
  }
});

export const logout = asyncHandler(async (req, res) => {
  const rawToken = readRefreshToken(req);
  await authService.logout({ refreshToken: rawToken, req });
  clearRefreshCookie(res);
  return sendOk(res, {});
});

export const changePassword = asyncHandler(async (req, res) => {
  const { currentPassword, newPassword } = req.body;
  await authService.changePassword({
    user: req.user.user,
    currentPassword,
    newPassword,
    req,
  });
  return sendOk(res, {});
});

export const me = asyncHandler(async (req, res) => {
  return sendOk(res, { user: req.user.user });
});

export default { login, refresh, logout, changePassword, me };
