import { z } from 'zod';

const ROLES = ['admin', 'sales_exec'];

const emailSchema = z
  .string({ required_error: 'Email is required' })
  .trim()
  .toLowerCase()
  .email('A valid email is required');

const passwordSchema = z
  .string({ required_error: 'Password is required' })
  .min(6, 'Password must be at least 6 characters')
  .max(128, 'Password is too long');

const nameSchema = z
  .string({ required_error: 'Name is required' })
  .trim()
  .min(2, 'Name must be at least 2 characters')
  .max(120, 'Name is too long');

export const listUsersQuerySchema = z.object({
  q: z.string().trim().optional(),
  role: z.enum(ROLES).optional(),
  isActive: z
    .enum(['true', 'false'])
    .transform((v) => v === 'true')
    .optional(),
});

export const createUserSchema = z.object({
  name: nameSchema,
  email: emailSchema,
  password: passwordSchema,
  role: z.enum(ROLES).optional().default('sales_exec'),
});

export const updateUserSchema = z
  .object({
    name: nameSchema.optional(),
    role: z.enum(ROLES).optional(),
    isActive: z.boolean().optional(),
  })
  .refine((data) => Object.keys(data).length > 0, {
    message: 'At least one field must be provided',
  });

export const resetPasswordSchema = z.object({
  newPassword: passwordSchema,
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
