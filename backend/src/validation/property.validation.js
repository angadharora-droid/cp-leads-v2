import { z } from 'zod';

const text = (max) => z.string().trim().max(max).optional();

/** A property's letterhead, tax and bank details, and its room numbers. */
export const propertyUpdateSchema = z
  .object({
    name: text(200),
    shortName: text(200),
    unitOf: text(200),
    address: text(500),
    registeredOffice: text(500),
    phone: text(100),
    email: z.string().trim().email('Enter a valid email').max(320).optional().or(z.literal('')),
    udyam: text(40),
    vatTin: text(40),
    cin: text(40),
    pan: text(20),
    gstin: text(20),
    fssai: text(40),
    bank: z
      .object({
        bankName: text(200),
        accountName: text(200),
        accountNumber: text(40),
        accountType: text(60),
        branchAddress: text(500),
        ifsc: text(20),
      })
      .optional(),
    // Room categories and their counts; an existing category keeps its id.
    roomTypes: z
      .array(
        z.object({
          _id: z.string().regex(/^[a-f0-9]{24}$/i).optional(),
          name: z.string().trim().min(1, 'Name the room category').max(80),
          count: z.coerce.number().int().min(0, 'Rooms cannot be negative').max(10000),
        })
      )
      .max(30)
      .optional(),
  })
  .refine((obj) => Object.keys(obj).length > 0, { message: 'Nothing to update' });
