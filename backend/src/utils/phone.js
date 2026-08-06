/**
 * Phone-number helpers for admin phone sign-in.
 *
 * Numbers are compared on their last 10 digits so formatting (spaces, dashes,
 * brackets) and an optional country code on either side are tolerated:
 * "+91 98765 43210" matches "9876543210".
 */

/** Allowed characters for a phone-shaped identifier (digits plus formatting). */
export const PHONE_SHAPE_PATTERN = /^\+?[\d\s\-().]+$/;

/** Strip everything except digits. */
export function digitsOnly(value) {
  return String(value ?? '').replace(/\D/g, '');
}

/**
 * Canonical comparison key: the last 10 digits of the number.
 * Returns null when the value has fewer than 10 digits (no reliable match).
 * @param {string} value
 * @returns {string|null}
 */
export function phoneKey(value) {
  const digits = digitsOnly(value);
  return digits.length >= 10 ? digits.slice(-10) : null;
}

export default { PHONE_SHAPE_PATTERN, digitsOnly, phoneKey };
