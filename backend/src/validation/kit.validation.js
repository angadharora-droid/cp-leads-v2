import { z } from 'zod';

// Document fields are deliberately free-text: the team writes figures exactly
// as they should appear on the paper ("Rs. 6,499", "Waived off", …).
const str = z.string().trim().max(2000).default('');
const strArr = z.array(z.string().trim().max(2000)).max(50).default([]);

const roomRowSchema = z.object({
  checkIn: str,
  checkOut: str,
  occupancyType: str,
  category: str,
  mealPlan: str,
  numRooms: str,
  rate: str,
  estRevenue: str,
});

const otherRoomRateSchema = z.object({
  category: str,
  rate: str,
});

const eventMealRowSchema = z.object({
  date: str,
  eventType: str,
  venue: str,
  guaranteedGuests: str,
  menu: str,
  rackRate: str,
  discountedRate: str,
  estRevenue: str,
});

const otherRequirementSchema = z.object({
  particulars: str,
  details: str,
  rate: str,
  estRevenue: str,
});

export const eventDetailsSchema = z.object({
  guestName: str,
  eventType: str,
  eventDates: str,
  mobile: str,
  email: str,
  billingName: str,
  gstNumber: str,
  panNumber: str,
  paymentTerms: str,
  rooms: z.array(roomRowSchema).max(50).default([]),
  roomsEstimatedRevenue: str,
  otherRoomRates: z.array(otherRoomRateSchema).max(50).default([]),
  inclusions: strArr,
  events: z.array(eventMealRowSchema).max(50).default([]),
  eventsEstimatedRevenue: str,
  otherRequirements: z.array(otherRequirementSchema).max(50).default([]),
  sessionTimings: strArr,
  notes: z.string().trim().max(5000).default(''),
});

const corporateRateRowSchema = z.object({
  category: str,
  size: str,
  singleRate: str,
  doubleRate: str,
});

const corporatePropertySchema = z.object({
  propertyName: str,
  rows: z.array(corporateRateRowSchema).max(20).default([]),
});

export const corporateDetailsSchema = z.object({
  companyName: str,
  contactPerson: str,
  mobile: str,
  address: str,
  email: str,
  gstNumber: str,
  panNumber: str,
  properties: z.array(corporatePropertySchema).max(10).default([]),
  validUntil: str,
  extraBedRate: str,
  notes: z.string().trim().max(5000).default(''),
});

export const createKitSchema = z
  .object({
    kitType: z.enum(['event', 'corporate']),
    contractNumber: z.string().trim().max(50).optional(),
    event: eventDetailsSchema.optional(),
    corporate: corporateDetailsSchema.optional(),
  })
  .refine(
    (data) =>
      data.kitType === 'event' ? data.event !== undefined : data.corporate !== undefined,
    { message: 'Kit details are required for the selected kit type' }
  );

export const updateKitSchema = z.object({
  contractNumber: z.string().trim().max(50).optional(),
  event: eventDetailsSchema.optional(),
  corporate: corporateDetailsSchema.optional(),
});

export const sendKitEmailSchema = z.object({
  to: z
    .string()
    .trim()
    .min(3, 'Recipient email is required')
    .max(500)
    .refine((v) => v.split(',').every((e) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e.trim())), {
      message: 'Enter valid email address(es), comma-separated',
    }),
  cc: z
    .string()
    .trim()
    .max(500)
    .optional()
    .transform((v) => (v === '' ? undefined : v))
    .refine(
      (v) =>
        v === undefined ||
        v.split(',').every((e) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e.trim())),
      { message: 'Enter valid CC email address(es), comma-separated' }
    ),
  subject: z.string().trim().max(300).optional(),
  message: z.string().trim().max(10000).optional(),
  docType: z.enum(['proposal', 'confirmation']).optional(),
});

export const kitPdfQuerySchema = z.object({
  doc: z.enum(['proposal', 'confirmation']).optional(),
});

export default {
  createKitSchema,
  updateKitSchema,
  sendKitEmailSchema,
  kitPdfQuerySchema,
};
