import { z } from 'zod';

const objectId = z.string().trim().regex(/^[0-9a-fA-F]{24}$/, 'Invalid id');
const money = z.coerce.number().min(0).max(1000000000);
const MODES = ['cash', 'upi', 'neft', 'cheque', 'card', 'other', ''];

export const updateScheduleSchema = z
  .object({
    milestones: z
      .array(
        z.object({
          _id: objectId.optional(),
          label: z.string().trim().min(1, 'Name each payment').max(80),
          amount: money,
          dueDate: z.coerce.date().optional(),
        })
      )
      .max(12)
      .optional(),
    autoRequest: z.boolean().optional(),
  })
  .refine((obj) => obj.milestones !== undefined || obj.autoRequest !== undefined, {
    message: 'Nothing to update',
  });

export const receiptSchema = z.object({
  amount: money.optional(),
  date: z.coerce.date().optional(),
  mode: z.enum(MODES).optional().default(''),
  reference: z.string().trim().max(200).optional().default(''),
});

export const paymentRequestSchema = z.object({
  to: z.string().trim().email('Invalid email').optional().or(z.literal('')),
  cc: z.string().trim().max(500).optional().or(z.literal('')),
  subject: z.string().trim().max(300).optional().or(z.literal('')),
  message: z.string().trim().max(5000).optional().or(z.literal('')),
});

export const creditLineSchema = z.object({
  enabled: z.boolean(),
  limit: money.optional().default(0),
  days: z.coerce.number().int().min(0).max(365).optional().default(0),
  notes: z.string().trim().max(1000).optional().default(''),
});

export const ledgerEntrySchema = z.object({
  kind: z.enum(['invoice', 'credit_note', 'adjustment']),
  direction: z.enum(['debit', 'credit']).optional(),
  amount: money.refine((v) => v > 0, 'Enter an amount'),
  date: z.coerce.date().optional(),
  description: z.string().trim().max(300).optional().default(''),
  reference: z.string().trim().max(100).optional().default(''),
});
