import { z } from 'zod';

export const venueSchema = z.object({
  name: z.string().trim().min(1, 'Venue name is required').max(200),
  hallCharge: z.coerce.number().min(0).max(100000000).optional(),
  active: z.boolean().optional(),
  order: z.number().int().min(0).max(10000).optional(),
});

export const venueUpdateSchema = venueSchema.partial();

export const sessionSchema = z.object({
  name: z.string().trim().min(1, 'Session name is required').max(200),
  startTime: z.string().trim().max(50).optional().default(''),
  endTime: z.string().trim().max(50).optional().default(''),
  active: z.boolean().optional(),
  order: z.number().int().min(0).max(10000).optional(),
});

export const sessionUpdateSchema = sessionSchema.partial();

export const settingsSchema = z.object({
  slotRule: z.enum(['multi-hold', 'exclusive']),
});

/** Function types, menu types, add-on menus and liquor packages. */
export const catalogSchema = z.object({
  kind: z.enum(['functionType', 'menuType', 'addOn', 'liquor', 'requirement']),
  name: z.string().trim().min(1, 'Name is required').max(200),
  rate: z.coerce.number().min(0).max(10000000).optional().default(0),
  pricing: z.enum(['per_pax', 'flat']).optional().default('per_pax'),
  notes: z.string().trim().max(500).optional().default(''),
  // Menu packages: the courses dishes are listed under on a prospectus sheet.
  courses: z.array(z.string().trim().min(1).max(120)).max(30).optional(),
  active: z.boolean().optional(),
  order: z.number().int().min(0).max(10000).optional(),
});

export const catalogUpdateSchema = catalogSchema.partial();
