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

const objectId = z.string().regex(/^[a-f\d]{24}$/i, 'Invalid id');

/** Banquet report filters — function-date range plus stage / venue / exec / kind / department. */
export const banquetReportQuerySchema = z.object({
  q: z.string().trim().max(200).optional(),
  stage: z.enum(['enquiry', 'proposal', 'waitlist', 'provisional', 'won', 'lost', 'cancelled']).optional().or(z.literal('')),
  venue: objectId.optional().or(z.literal('')),
  executive: objectId.optional().or(z.literal('')),
  department: objectId.optional().or(z.literal('')),
  kind: z.enum(['banquet', 'room', 'both']).optional().or(z.literal('')),
  from: dateField.optional().or(z.literal('')),
  to: dateField.optional().or(z.literal('')),
});

/** Management reports: the period and, optionally, one executive. */
export const teamReportQuerySchema = z.object({
  executive: objectId.optional().or(z.literal('')),
  from: dateField.optional().or(z.literal('')),
  to: dateField.optional().or(z.literal('')),
});

export default { reportQuerySchema, banquetReportQuerySchema, teamReportQuerySchema };
