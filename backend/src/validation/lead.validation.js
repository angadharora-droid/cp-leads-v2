import { z } from 'zod';

const LEAD_STATUSES = ['Non Contracted', 'Contracted'];
const CONTACTED_FOR_OPTIONS = ['CPA', 'CPH', 'CPNM'];

const objectIdRegex = /^[0-9a-fA-F]{24}$/;
const objectId = z
  .string()
  .trim()
  .regex(objectIdRegex, 'Invalid id');

const trimmedString = (max = 5000) => z.string().trim().max(max);
const optionalText = (max = 5000) =>
  z.string().trim().max(max).optional().or(z.literal(''));

const emailField = z
  .string()
  .trim()
  .email('Invalid email')
  .or(z.literal(''))
  .optional();

const dateField = z
  .union([z.string(), z.date()])
  .refine(
    (v) => !Number.isNaN(new Date(v).getTime()),
    'Invalid date'
  );

/**
 * Body schema for creating a lead. Only businessName is required.
 * assignedTo is honored only for admins (enforced in service).
 */
export const createLeadSchema = z.object({
  businessName: trimmedString(300).min(1, 'Business name is required'),
  contactPerson: optionalText(200),
  designation: optionalText(200),
  mobile: optionalText(40),
  email: emailField,
  city: optionalText(120),
  businessType: optionalText(200),
  contactedFor: z.array(z.enum(CONTACTED_FOR_OPTIONS)).optional(),
  status: z.enum(LEAD_STATUSES).optional(),
  assignedTo: objectId.optional(),
  // Optional sub-resources captured inline when the lead is first created.
  notes: z
    .array(z.object({ body: trimmedString(5000).min(1) }))
    .optional(),
  followUps: z
    .array(z.object({ dueDate: dateField, note: optionalText(2000) }))
    .optional(),
});

/**
 * Body schema for updating a lead. All fields optional; reference is never editable.
 */
export const updateLeadSchema = z
  .object({
    businessName: trimmedString(300).min(1).optional(),
    contactPerson: optionalText(200),
    designation: optionalText(200),
    mobile: optionalText(40),
    email: emailField,
    city: optionalText(120),
    businessType: optionalText(200),
    contactedFor: z.array(z.enum(CONTACTED_FOR_OPTIONS)).optional(),
    status: z.enum(LEAD_STATUSES).optional(),
  })
  .refine((obj) => Object.keys(obj).length > 0, {
    message: 'No fields to update',
  });

export const listLeadsQuerySchema = z.object({
  status: z.enum(LEAD_STATUSES).optional(),
  city: z.string().trim().optional(),
  businessType: z.string().trim().optional(),
  assignedTo: objectId.optional(),
  q: z.string().trim().optional(),
  page: z.coerce.number().int().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
  sort: z.string().trim().optional(),
});

export const assignLeadSchema = z.object({
  assignedTo: objectId,
});

export const noteSchema = z.object({
  body: trimmedString(5000).min(1, 'Note body is required'),
});

export const actionPointSchema = z.object({
  text: trimmedString(2000).min(1, 'Action point text is required'),
});

export const followUpSchema = z.object({
  dueDate: dateField,
  note: optionalText(2000),
});

export const closeFollowUpSchema = z.object({
  closingNote: trimmedString(2000).min(1, 'Closing note is required'),
});

export const instructionSchema = z.object({
  text: trimmedString(2000).min(1, 'Instruction text is required'),
});

export default {
  createLeadSchema,
  updateLeadSchema,
  listLeadsQuerySchema,
  assignLeadSchema,
  noteSchema,
  actionPointSchema,
  followUpSchema,
  closeFollowUpSchema,
  instructionSchema,
};
