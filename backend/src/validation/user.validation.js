import { z } from 'zod';

import { passwordPolicyError } from '../utils/passwordPolicy.js';
import { PHONE_SHAPE_PATTERN, digitsOnly } from '../utils/phone.js';

const ROLES = ['admin', 'sales_exec'];

const emailSchema = z
  .string({ required_error: 'Email is required' })
  .trim()
  .toLowerCase()
  .email('A valid email is required');

// Shape-only check; the role-aware policy (8+ chars, or a 4/6-digit PIN for
// admins) is applied where the target account's role is known.
const passwordShapeSchema = z
  .string({ required_error: 'Password is required' })
  .min(1, 'Password is required')
  .max(128, 'Password is too long');

const nameSchema = z
  .string({ required_error: 'Name is required' })
  .trim()
  .min(2, 'Name must be at least 2 characters')
  .max(120, 'Name is too long');

// Optional phone; empty string clears it. Must look like a phone number and
// carry 10-15 digits so the last-10-digits login match works.
const phoneSchema = z
  .string()
  .trim()
  .refine(
    (v) =>
      v === '' ||
      (PHONE_SHAPE_PATTERN.test(v) &&
        digitsOnly(v).length >= 10 &&
        digitsOnly(v).length <= 15),
    'Enter a valid phone number with at least 10 digits'
  )
  .transform((v) => (v === '' ? null : v))
  .optional();

export const listUsersQuerySchema = z.object({
  q: z.string().trim().optional(),
  role: z.enum(ROLES).optional(),
  isActive: z
    .enum(['true', 'false'])
    .transform((v) => v === 'true')
    .optional(),
});

export const createUserSchema = z
  .object({
    name: nameSchema,
    email: emailSchema,
    password: passwordShapeSchema,
    role: z.enum(ROLES).optional().default('sales_exec'),
    phone: phoneSchema,
  })
  .superRefine((data, ctx) => {
    const message = passwordPolicyError(data.password, data.role);
    if (message) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['password'], message });
    }
  });

export const updateUserSchema = z
  .object({
    name: nameSchema.optional(),
    role: z.enum(ROLES).optional(),
    isActive: z.boolean().optional(),
    phone: phoneSchema,
  })
  .refine((data) => Object.keys(data).length > 0, {
    message: 'At least one field must be provided',
  });

export const resetPasswordSchema = z.object({
  newPassword: passwordShapeSchema,
});

export const userIdParamsSchema = z.object({
  id: z
    .string({ required_error: 'User id is required' })
    .regex(/^[0-9a-fA-F]{24}$/, 'Invalid user id'),
});

export default {
  listUsersQuerySchema,
  createUserSchema,
  updateUserSchema,
  resetPasswordSchema,
  userIdParamsSchema,
};
