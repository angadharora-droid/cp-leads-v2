/**
 * Role-aware password rules, shared by login-adjacent endpoints:
 *  - admins may use a 4-digit PIN, a 6-digit PIN, or a text password (8+ chars);
 *  - every other role must use a text password of at least 8 characters.
 * PINs are hashed and stored exactly like passwords.
 */

export const PIN_PATTERN = /^(\d{4}|\d{6})$/;

const MAX_LENGTH = 128;

/**
 * Validate a candidate password against the rules for `role`.
 * @param {string} password
 * @param {string} role
 * @returns {string|null} a human-readable error message, or null when valid.
 */
export function passwordPolicyError(password, role) {
  if (typeof password !== 'string' || password.length === 0) {
    return 'Password is required';
  }
  if (password.length > MAX_LENGTH) {
    return 'Password is too long';
  }
  if (role === 'admin') {
    if (PIN_PATTERN.test(password) || password.length >= 8) return null;
    return 'Admin passwords must be a 4-digit PIN, a 6-digit PIN, or at least 8 characters';
  }
  if (password.length < 8) {
    return 'Password must be at least 8 characters';
  }
  return null;
}

export default { PIN_PATTERN, passwordPolicyError };
