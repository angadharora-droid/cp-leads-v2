import { z } from 'zod';

import { PHONE_SHAPE_PATTERN, digitsOnly } from '../utils/phone.js';

/**
 * Single login identifier: an email (contains "@") for any user, or a phone
 * number (admins only). Phone-shaped values must carry at least 10 digits so
 * the last-10-digits match in the auth service is meaningful.
 */
export const loginSchema = z.object({
  identifier: z
    .string({ required_error: 'Email or phone number is required' })
    .trim()
    .min(1, 'Email or phone number is required')
    .superRefine((value, ctx) => {
      if (value.includes('@')) {
        if (!z.string().email().safeParse(value).success) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: 'A valid email is required',
          });
        }
      } else if (
        !PHONE_SHAPE_PATTERN.test(value) ||
        digitsOnly(value).length < 10 ||
        digitsOnly(value).length > 15
      ) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Enter a valid email address or phone number',
        });
      }
    })
    .transform((value) => (value.includes('@') ? value.toLowerCase() : value)),
  password: z
    .string({ required_error: 'Password is required' })
    .min(1, 'Password is required'),
});

export const changePasswordSchema = z
  .object({
    currentPassword: z
      .string({ required_error: 'Current password is required' })
      .min(1, 'Current password is required'),
    // Only shape-checked here: the role-aware rule (8+ chars, or a 4/6-digit
    // PIN for admins) is enforced in the auth service where the role is known.
    newPassword: z
      .string({ required_error: 'New password is required' })
      .min(1, 'New password is required')
      .max(128, 'New password is too long'),
  })
  .refine((data) => data.currentPassword !== data.newPassword, {
    message: 'New password must be different from the current password',
    path: ['newPassword'],
  });

export default { loginSchema, changePasswordSchema };
