import { format, formatDistanceToNow, isValid, parseISO } from 'date-fns';

/**
 * Coerce a value (Date, ISO string, or timestamp) to a valid Date or null.
 * @param {Date|string|number|null|undefined} value
 * @returns {Date|null}
 */
function toDate(value) {
  if (value == null || value === '') return null;
  if (value instanceof Date) return isValid(value) ? value : null;
  if (typeof value === 'number') {
    const d = new Date(value);
    return isValid(d) ? d : null;
  }
  // String: try ISO first, then a permissive Date parse.
  const iso = parseISO(value);
  if (isValid(iso)) return iso;
  const d = new Date(value);
  return isValid(d) ? d : null;
}

/**
 * Format a date as e.g. "30 Jun 2026".
 * @param {Date|string|number|null|undefined} value
 * @param {string} [pattern='dd MMM yyyy']
 * @returns {string} formatted date, or an em dash when invalid
 */
export function formatDate(value, pattern = 'dd MMM yyyy') {
  const d = toDate(value);
  return d ? format(d, pattern) : '—';
}

/**
 * Format a date with time, e.g. "30 Jun 2026, 4:08 PM".
 * @param {Date|string|number|null|undefined} value
 * @returns {string}
 */
export function formatDateTime(value) {
  const d = toDate(value);
  return d ? format(d, "dd MMM yyyy, h:mm a") : '—';
}

/**
 * Relative time from now, e.g. "3 hours ago".
 * @param {Date|string|number|null|undefined} value
 * @returns {string}
 */
export function formatRelative(value) {
  const d = toDate(value);
  return d ? formatDistanceToNow(d, { addSuffix: true }) : '—';
}

const inrFormatter = new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  maximumFractionDigits: 0,
});

/**
 * Format a number as Indian Rupees, e.g. "₹1,50,000".
 * @param {number|string|null|undefined} value
 * @returns {string}
 */
export function formatCurrency(value) {
  const num = typeof value === 'string' ? Number(value) : value;
  if (num == null || Number.isNaN(num)) return '₹0';
  return inrFormatter.format(num);
}

/**
 * Compact number formatter, e.g. 12000 -> "12K".
 * @param {number|null|undefined} value
 * @returns {string}
 */
export function formatCompactNumber(value) {
  if (value == null || Number.isNaN(value)) return '0';
  return new Intl.NumberFormat('en-IN', {
    notation: 'compact',
    maximumFractionDigits: 1,
  }).format(value);
}

/**
 * Build initials from a name, e.g. "Ravi Sharma" -> "RS".
 * @param {string|null|undefined} name
 * @returns {string}
 */
export function getInitials(name) {
  if (!name) return '?';
  const parts = String(name).trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}
