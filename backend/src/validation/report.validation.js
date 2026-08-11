import { z } from 'zod';

const LEAD_STATUSES = ['Non Contracted', 'Contracted'];

const dateField = z
  .union([z.string(), z.date()])
  .refine((v) => !Number.isNaN(new Date(v).getTime()), 'Invalid date');

export const reportQuerySchema = z.object({
  q: z.string().trim().optional(),
  status: z.enum(LEAD_STATUSES).optional(),
  city: z.string().trim().optional(),
  from: dateField.optional().or(z.literal('')),
  to: dateField.optional().or(z.literal('')),
});

export default { reportQuerySchema };
