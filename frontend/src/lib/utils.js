import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

/**
 * Merge conditional class names and de-duplicate conflicting Tailwind utilities.
 * @param  {...any} inputs clsx-compatible class values
 * @returns {string}
 */
export function cn(...inputs) {
  return twMerge(clsx(inputs));
}
