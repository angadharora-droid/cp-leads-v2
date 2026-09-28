import { z } from 'zod';

const LEAD_STATUSES = ['Non Contracted', 'Contracted'];
const CONTACTED_FOR_OPTIONS = ['CPA', 'CPH', 'CPNM'];

const objectId = z.string().trim().regex(/^[0-9a-fA-F]{24}$/, 'Invalid id');
const optionalText = (max = 5000) => z.string().trim().max(max).optional().or(z.literal(''));
const emailField = z.string().trim().email('Invalid email').or(z.literal('')).optional();
const dateField = z
  .union([z.string(), z.date()])
  .refine((v) => !Number.isNaN(new Date(v).getTime()), 'Invalid date');

const personFields = {
  name: z.string().trim().min(1, 'Full name is required').max(300),
  mobile: z.string().trim().min(1, 'Mobile is required').max(40),
  email: emailField,
  city: optionalText(120),
  contactedFor: z.array(z.enum(CONTACTED_FOR_OPTIONS)).optional(),
  status: z.enum(LEAD_STATUSES).optional(),
  assignedTo: objectId.optional().or(z.literal('')),
};

export const createProspectSchema = z.object({
  ...personFields,
  notes: z.array(z.object({ body: z.string().trim().max(5000) })).optional(),
  followUps: z.array(z.object({ dueDate: dateField, note: optionalText(2000) })).optional(),
});

export const updateProspectSchema = z
  .object({
    name: personFields.name.optional(),
    mobile: personFields.mobile.optional(),
    email: emailField,
    city: optionalText(120),
    contactedFor: personFields.contactedFor,
    status: personFields.status,
    assignedTo: personFields.assignedTo,
  })
  .refine((obj) => Object.keys(obj).length > 0, { message: 'No fields to update' });

export const listProspectsQuerySchema = z.object({
  q: z.string().trim().optional(),
  requested: z.enum(['true', 'false', '1', '0']).optional(),
  status: z.enum(LEAD_STATUSES).optional(),
  assignedTo: objectId.optional(),
  page: z.coerce.number().int().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
});

export const classifyProspectSchema = z
  .object({
    leadType: z.enum(['company', 'individual']),
    leadId: objectId.optional(),
    company: z
      .object({
        businessName: z.string().trim().max(300).optional(),
        businessType: optionalText(200),
      })
      .optional(),
    departmentId: objectId.optional(),
    department: z.object({ branch: optionalText(200), name: optionalText(200) }).optional(),
    designation: optionalText(200),
  })
  .refine(
    (obj) =>
      obj.leadType === 'individual' ||
      obj.leadId ||
      (obj.company?.businessName && obj.department?.name),
    { message: 'Pick a company, or name a new company and its department', path: ['company'] }
  );

export const prospectNoteSchema = z.object({
  body: z.string().trim().min(1, 'Note body is required').max(5000),
});

export const prospectFollowUpSchema = z.object({
  dueDate: dateField,
  note: optionalText(2000),
});

export const closeProspectFollowUpSchema = z.object({
  closingNote: z.string().trim().min(1, 'Closing note is required').max(2000),
});

export const companyRequestSchema = z.object({
  businessName: z.string().trim().min(1, 'Company name is required').max(300),
  businessType: optionalText(200),
  branch: optionalText(200),
  department: z.string().trim().min(1, 'Department is required').max(200),
  designation: optionalText(200),
});
