import { z } from 'zod';

const objectId = z.string().regex(/^[a-f\d]{24}$/i, 'Invalid id');
const text = (max) => z.string().trim().max(max).optional();
const money = z.coerce.number().min(0).max(1000000000).optional();
const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD');

export const createProspectusSchema = z.object({
  enquiryId: objectId,
  functionId: objectId,
});

/** Every field the banquet team can type over; the booking link itself never changes. */
export const updateProspectusSchema = z
  .object({
    reservationNo: text(50),
    dateFrom: day.optional().or(z.literal('')),
    dateTo: day.optional().or(z.literal('')),
    timeFrom: text(20),
    timeTo: text(20),
    functionType: text(120),
    venue: text(200),
    pax: z.coerce.number().int().min(0).max(1000000).optional(),
    partyName: text(200),
    companyName: text(200),
    address: text(500),
    contactPerson: text(200),
    phone: text(60),
    email: z.string().trim().max(320).optional(),
    seating: text(300),
    addOnRooms: text(300),
    rate: money,
    rateBasis: z.enum(['exclusive', 'inclusive']).optional(),
    hallRent: money,
    hallRentBasis: z.enum(['exclusive', 'inclusive']).optional(),
    advanceMode: z.enum(['cash', 'card', 'cheque', 'upi', 'neft', 'other', '']).optional(),
    advanceAmount: money,
    paidOut: money,
    netAmount: money,
    billingInstruction: text(500),
    boardToRead: text(500),
    deptInstruction: text(3000),
    specialInstructions: text(3000),
    // Dishes per course; the courses themselves are fixed by the package.
    menuCourses: z
      .array(
        z.object({
          name: z.string().trim().min(1).max(120),
          dishes: z.array(z.string().trim().max(200)).max(100).optional().default([]),
        })
      )
      .max(30)
      .optional(),
    liquorMenu: text(3000),
    otherRequirements: text(3000),
  })
  .refine((data) => Object.keys(data).length > 0, { message: 'Nothing to update' });

export const emailProspectusSchema = z.object({
  // Comma-separated addresses; empty = the department addresses in settings.
  to: z.string().trim().max(2000).optional(),
  cc: z.string().trim().max(1000).optional(),
  subject: z.string().trim().max(300).optional(),
  message: z.string().trim().max(5000).optional(),
});

export const prospectusSettingsSchema = z.object({
  recipients: z
    .array(
      z.object({
        name: z.string().trim().max(120).optional().default(''),
        email: z.string().trim().email().max(320),
      })
    )
    .max(50),
});

export const prospectusListQuerySchema = z.object({
  q: z.string().trim().max(200).optional(),
  from: day.optional(),
  to: day.optional(),
  status: z.enum(['all', 'pending', 'made']).optional(),
});

export const prospectusIdParamsSchema = z.object({ id: objectId });
