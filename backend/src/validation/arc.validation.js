import { z } from 'zod';

const objectId = z.string().regex(/^[a-f\d]{24}$/i, 'Invalid id');

const optionalDate = z
  .union([z.string().trim().max(40), z.date()])
  .optional()
  .refine((v) => v === undefined || v === '' || !Number.isNaN(new Date(v).getTime()), {
    message: 'Invalid date',
  });

const contactFields = {
  title: z.string().trim().max(200).optional(),
  contactName: z.string().trim().max(200).optional(),
  contactEmail: z.string().trim().email().max(320).optional().or(z.literal('')),
  contactPhone: z.string().trim().max(40).optional(),
  validFrom: optionalDate,
  validTo: optionalDate,
  notes: z.string().trim().max(5000).optional(),
};

/** Body for POST /leads/:id/arcs — raise a rate contract under a department. */
export const createArcSchema = z.object({
  // Branch/department node of the company lead (required for companies).
  department: objectId.optional(),
  ...contactFields,
});

export const updateArcSchema = z
  .object({
    department: objectId.optional(),
    ...contactFields,
  })
  .refine((obj) => Object.keys(obj).length > 0, { message: 'No fields to update' });

export const arcBoardQuerySchema = z.object({
  stage: z.enum(['enquiry', 'proposal', 'awaiting', 'contracted', 'lost']).optional(),
  q: z.string().trim().max(200).optional(),
  lead: objectId.optional(),
  department: objectId.optional(),
});

export const arcLostSchema = z.object({
  reason: z.string().trim().max(1000).optional(),
});

export default {
  createArcSchema,
  updateArcSchema,
  arcBoardQuerySchema,
  arcLostSchema,
};
