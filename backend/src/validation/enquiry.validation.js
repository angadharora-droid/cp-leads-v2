import { z } from 'zod';

const objectId = z.string().regex(/^[a-f\d]{24}$/i, 'Invalid id');

const money = z.coerce.number().min(0).max(1000000000);

const functionSchema = z.object({
  // An existing function keeps its id across edits, so the calendar, the
  // agreed record and any addendum can follow the same function.
  _id: objectId.optional(),
  // Every option is picked from Banquet Setup; `name` is only a fallback
  // label for enquiries created before function types existed.
  functionType: objectId,
  name: z.string().trim().max(200).optional().default(''),
  date: z.coerce.date(),
  // The primary venue plus any add-on rooms. `venues` (primary first) is
  // still accepted from older clients and normalised by the service.
  venue: objectId.optional(),
  addOnRooms: z.array(objectId).max(20).optional().default([]),
  venues: z.array(objectId).max(20).optional().default([]),
  sessions: z.array(objectId).min(1, 'Pick at least one session').max(20),
  pax: z.coerce.number().int().min(0).max(1000000).optional().default(0),
  menuType: objectId.optional(),
  hallChargeVenues: z.array(objectId).max(50).optional().default([]),
  addOns: z.array(objectId).max(50).optional().default([]),
  liquor: z.array(objectId).max(50).optional().default([]),
  requirements: z.array(objectId).max(50).optional().default([]),
  // Offered rate per picked option; the proposed rate is formed from these.
  lineRates: z
    .array(z.object({ item: objectId, rate: money }))
    .max(200)
    .optional()
    .default([]),
  proposedRate: money.optional(),
  additionalRequirement: z.string().trim().max(2000).optional().default(''),
  notes: z.string().trim().max(2000).optional().default(''),
}).refine((fn) => fn.venue || fn.venues.length > 0, {
  message: 'Pick the venue',
  path: ['venue'],
});

const roomSchema = z.object({
  checkIn: z.string().trim().max(50).optional().default(''),
  checkOut: z.string().trim().max(50).optional().default(''),
  rooms: z.string().trim().max(50).optional().default(''),
  notes: z.string().trim().max(2000).optional().default(''),
});

export const createEnquirySchema = z.object({
  // Branch/department node of the company lead (required for companies).
  department: objectId.optional(),
  kind: z.enum(['banquet', 'room', 'both']).optional().default('banquet'),
  contactName: z.string().trim().max(200).optional(),
  contactEmail: z.string().trim().email().max(320).optional().or(z.literal('')),
  contactPhone: z.string().trim().max(30).optional(),
  functions: z.array(functionSchema).max(50).optional().default([]),
  room: roomSchema.optional(),
  estimatedRevenue: z.string().trim().max(100).optional().default(''),
  notes: z.string().trim().max(5000).optional().default(''),
  billingName: z.string().trim().max(300).optional().default(''),
  gstNumber: z.string().trim().max(40).optional().default(''),
  panNumber: z.string().trim().max(20).optional().default(''),
  paymentTerms: z.string().trim().max(200).optional().default(''),
});

export const updateEnquirySchema = z.object({
  department: objectId.optional(),
  contactName: z.string().trim().max(200).optional(),
  contactEmail: z.string().trim().email().max(320).optional().or(z.literal('')),
  contactPhone: z.string().trim().max(30).optional(),
  functions: z.array(functionSchema).max(50).optional(),
  room: roomSchema.optional(),
  estimatedRevenue: z.string().trim().max(100).optional(),
  notes: z.string().trim().max(5000).optional(),
  billingName: z.string().trim().max(300).optional(),
  gstNumber: z.string().trim().max(40).optional(),
  panNumber: z.string().trim().max(20).optional(),
  paymentTerms: z.string().trim().max(200).optional(),
});

export const boardQuerySchema = z.object({
  stage: z
    .enum(['enquiry', 'proposal', 'waitlist', 'provisional', 'won', 'lost', 'cancelled'])
    .optional(),
  q: z.string().trim().max(200).optional(),
  lead: objectId.optional(),
  department: objectId.optional(),
});

/** Shared by the proposal, contract and pro-forma send dialogs. */
export const emailDocumentSchema = z.object({
  to: z.string().trim().email().max(320).optional(),
  cc: z.string().trim().max(500).optional(),
  subject: z.string().trim().max(500).optional(),
  message: z.string().trim().max(5000).optional(),
});

const advanceDetailsSchema = z.object({
  amount: z.string().trim().max(100).optional().default(''),
  date: z.coerce.date().optional(),
  mode: z.enum(['cash', 'upi', 'neft', 'cheque', 'card', 'other', '']).optional().default(''),
  reference: z.string().trim().max(200).optional().default(''),
  remarks: z.string().trim().max(1000).optional().default(''),
});

/**
 * Mark as won: "Advance received?" — yes carries the advance details; no asks
 * "Is it a PPS?" and, if so, the booking is confirmed on one-time credit.
 */
export const wonSchema = z.object({
  advanceReceived: z.boolean(),
  advance: advanceDetailsSchema.optional(),
  pps: z.boolean().optional().default(false),
});

export const lostSchema = z.object({
  reasonCode: z
    .enum([
      'no_response',
      'event_cancelled',
      'rooms_unavailable',
      'low_budget',
      'venue_unavailable',
      'booked_other_venue',
      'booked_competitor',
      'date_passed',
      'other',
    ])
    .optional(),
  reason: z.string().trim().max(1000).optional(),
});

/**
 * Cancel a provisional or confirmed booking: the reason is required; what
 * happened to the advance is recorded when one had been received.
 */
export const cancelSchema = z.object({
  reasonCode: z.enum([
    'client_cancelled',
    'postponed',
    'budget_cut',
    'booked_other_venue',
    'advance_not_received',
    'force_majeure',
    'other',
  ]),
  reason: z.string().trim().max(1000).optional(),
  advanceOutcome: z.enum(['refunded', 'forfeited', 'adjusted', '']).optional(),
  advanceAmount: z.string().trim().max(100).optional(),
  advanceNote: z.string().trim().max(1000).optional(),
});

export const calendarQuerySchema = z.object({
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'from must be YYYY-MM-DD'),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'to must be YYYY-MM-DD'),
});

/* ------------------------------ Public signing ----------------------------- */

// Drawn signatures arrive as a PNG data URL from the canvas (kept small).
const signatureDataUrl = z
  .string()
  .regex(/^data:image\/png;base64,[A-Za-z0-9+/=]+$/, 'Invalid signature image')
  .max(300000, 'Signature image is too large');

export const completeSignSchema = z
  .object({
    otp: z.string().trim().regex(/^\d{6}$/, 'The code is 6 digits'),
    signerName: z.string().trim().min(2, 'Please enter your full name').max(200),
    signatureType: z.enum(['drawn', 'typed']),
    signatureDataUrl: signatureDataUrl.optional(),
  })
  .refine((data) => data.signatureType !== 'drawn' || Boolean(data.signatureDataUrl), {
    message: 'Draw your signature before submitting',
    path: ['signatureDataUrl'],
  });
