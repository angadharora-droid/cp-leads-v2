import { z } from 'zod';

const objectId = z.string().regex(/^[a-f\d]{24}$/i, 'Invalid id');
const text = (max) => z.string().trim().max(max).optional();
const money = z.coerce.number().min(0).max(1000000000).optional();
const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD');

/** An estimate is always raised from a prospectus sheet. */
export const createEstimateSchema = z.object({
  prospectusId: objectId,
});

/** Everything finance can type over; the link to the sheet never changes. */
export const updateEstimateSchema = z
  .object({
    functionName: text(200),
    functionType: text(120),
    date: day.optional().or(z.literal('')),
    venue: text(200),
    session: text(200),
    reservationNo: text(60),
    guaranteedPax: z.coerce.number().int().min(0).max(1000000).optional(),
    pricePerPlate: money,
    hallCharges: z
      .array(z.object({ venue: z.string().trim().max(200), amount: money.default(0) }))
      .max(20)
      .optional(),
    additionalPlatePrice: text(200),
    billingName: text(300),
    billingCode: text(60),
    panNo: text(30),
    gstNo: text(30),
    paymentMode: text(60),
    advanceReceived: money,
    remarks: text(2000),
  })
  .refine((data) => Object.keys(data).length > 0, { message: 'Nothing to update' });

export const emailEstimateSchema = z.object({
  // Comma-separated addresses; empty = the finance addresses in settings.
  to: z.string().trim().max(2000).optional(),
  cc: z.string().trim().max(1000).optional(),
  subject: z.string().trim().max(300).optional(),
  message: z.string().trim().max(5000).optional(),
});

export const estimateSettingsSchema = z.object({
  recipients: z
    .array(
      z.object({
        name: z.string().trim().max(120).optional().default(''),
        email: z.string().trim().email().max(320),
      })
    )
    .max(50),
});

export const estimateListQuerySchema = z.object({
  q: z.string().trim().max(200).optional(),
  from: day.optional(),
  to: day.optional(),
  status: z.enum(['all', 'pending', 'made']).optional(),
});

export const estimateIdParamsSchema = z.object({ id: objectId });
