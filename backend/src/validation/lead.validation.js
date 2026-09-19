import { z } from 'zod';

const LEAD_STATUSES = ['Non Contracted', 'Contracted'];
const LEAD_TYPES = ['company', 'individual'];
const CONTACTED_FOR_OPTIONS = ['CPA', 'CPH', 'CPNM'];
const VISIT_ACTION_OPTIONS = [
  'No action',
  'Send proposal',
  'Send rates',
  'Send agreement',
  'Schedule meeting',
  'Follow up call',
  'Collect signed confirmation',
];

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

/** One branch/department row of a company's structure. */
export const departmentInputSchema = z.object({
  branch: optionalText(200),
  name: trimmedString(200).min(1, 'Department name is required'),
});

/**
 * Body schema for creating a lead. Only businessName is required.
 * assignedTo is honored only for admins (enforced in service).
 * Company leads must carry at least one department (branch optional);
 * individuals carry none.
 */
export const createLeadSchema = z
  .object({
  leadType: z.enum(LEAD_TYPES).optional().default('company'),
  businessName: trimmedString(300).min(1, 'Name is required'),
  departments: z.array(departmentInputSchema).max(200).optional(),
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
  })
  .refine(
    (obj) =>
      obj.leadType === 'individual' ||
      (obj.departments || []).some((d) => d.name && d.name.trim()),
    {
      message: 'A company lead needs at least one department',
      path: ['departments'],
    }
  );

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
  leadType: z.enum(LEAD_TYPES).optional(),
  city: z.string().trim().optional(),
  businessType: z.string().trim().optional(),
  assignedTo: objectId.optional(),
  q: z.string().trim().optional(),
  page: z.coerce.number().int().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
  sort: z.string().trim().optional(),
});

export const checkDuplicateQuerySchema = z.object({
  businessName: trimmedString(300).min(2, 'Enter at least 2 characters'),
  mobile: optionalText(40),
  leadType: z.enum(LEAD_TYPES).optional(),
  excludeId: objectId.optional(),
});

export const updateDepartmentSchema = z
  .object({
    branch: optionalText(200),
    name: trimmedString(200).min(1).optional(),
  })
  .refine((obj) => Object.keys(obj).length > 0, { message: 'No fields to update' });

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

export const visitReportSchema = z.object({
  visitDate: dateField,
  note: trimmedString(5000).min(1, 'Visit note is required'),
  followUpDate: dateField.optional().or(z.literal('')),
  followUpNote: optionalText(2000),
  actionPoint: z.enum(VISIT_ACTION_OPTIONS).optional(),
});

export default {
  createLeadSchema,
  updateLeadSchema,
  listLeadsQuerySchema,
  checkDuplicateQuerySchema,
  departmentInputSchema,
  updateDepartmentSchema,
  assignLeadSchema,
  noteSchema,
  actionPointSchema,
  followUpSchema,
  closeFollowUpSchema,
  instructionSchema,
  visitReportSchema,
};
