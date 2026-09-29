import { z } from 'zod';

import { PROPERTY_CODES } from '../models/Property.js';

/** The hotel a Banquet Setup entry or setting belongs to. */
export const propertyCode = z.enum(PROPERTY_CODES);

const venueBase = z.object({
  name: z.string().trim().min(1, 'Venue name is required').max(200),
  hallCharge: z.coerce.number().min(0).max(100000000).optional(),
  active: z.boolean().optional(),
  order: z.number().int().min(0).max(10000).optional(),
});

export const venueSchema = venueBase.extend({ property: propertyCode });

export const venueUpdateSchema = venueBase.partial();

const target = z.coerce.number().min(0).max(1000000000).optional();

const sessionBase = z.object({
  name: z.string().trim().min(1, 'Session name is required').max(200),
  startTime: z.string().trim().max(50).optional().default(''),
  endTime: z.string().trim().max(50).optional().default(''),
  targets: z.object({ normal: target, high: target, peak: target }).optional(),
  active: z.boolean().optional(),
  order: z.number().int().min(0).max(10000).optional(),
});

export const sessionSchema = sessionBase.extend({ property: propertyCode });

export const sessionUpdateSchema = sessionBase.partial();

const tatDays = z.coerce.number().int().min(0).max(365).optional();

export const settingsSchema = z
  .object({
    // Whose slot rule / demand dates these are; the rest is group-wide.
    property: propertyCode.optional(),
    slotRule: z.enum(['multi-hold', 'exclusive']).optional(),
    stageTatDays: z
      .object({ enquiry: tatDays, proposal: tatDays, waitlist: tatDays, provisional: tatDays })
      .optional(),
    demandDates: z
      .array(
        z
          .object({
            from: z.coerce.date(),
            to: z.coerce.date(),
            level: z.enum(['high', 'peak']),
            note: z.string().trim().max(200).optional().default(''),
          })
          .refine((d) => d.to >= d.from, { message: 'A demand period cannot end before it starts' })
      )
      .max(500)
      .optional(),
    paymentSchedule: z
      .array(
        z.object({
          label: z.string().trim().min(1, 'Milestone name is required').max(80),
          percent: z.coerce.number().min(0).max(100),
          due: z.enum(['on_confirmation', 'days_before_event', 'days_after_event']),
          days: z.coerce.number().int().min(0).max(365).optional().default(0),
        })
      )
      .max(10)
      .refine(
        (rows) => rows.length === 0 || Math.abs(rows.reduce((sum, r) => sum + r.percent, 0) - 100) < 0.01,
        { message: 'The milestones must add up to 100%' }
      )
      .optional(),
  })
  .refine((obj) => Object.keys(obj).some((key) => key !== 'property'), { message: 'No settings to update' });

/** Function types, menu types, add-on menus and liquor packages. */
const catalogBase = z.object({
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

export const catalogSchema = catalogBase.extend({ property: propertyCode });

export const catalogUpdateSchema = catalogBase.partial();

/** Copy one property's setup into others (entries matched by name; nothing deleted). */
export const copySetupSchema = z.object({
  from: propertyCode,
  to: z.array(propertyCode).min(1, 'Pick at least one property to copy to').max(PROPERTY_CODES.length),
  parts: z
    .array(z.enum(['venues', 'sessions', 'functionType', 'menuType', 'addOn', 'requirement', 'liquor', 'rules']))
    .min(1, 'Pick what to copy'),
  overwrite: z.boolean().optional().default(false),
});
