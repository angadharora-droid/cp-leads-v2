import mongoose from 'mongoose';

const { Schema, model } = mongoose;

/**
 * The group's hotels. Every enquiry, venue, session, menu option and
 * banquet setting belongs to one of them; the code is the prefix on the
 * property's document numbers (HCP.EP…, CPA.EP…).
 */
export const PROPERTY_CODES = ['HCP', 'CPA', 'CPNM'];

const bankSchema = new Schema(
  {
    bankName: { type: String, default: '', trim: true },
    accountName: { type: String, default: '', trim: true },
    accountNumber: { type: String, default: '', trim: true },
    accountType: { type: String, default: '', trim: true },
    branchAddress: { type: String, default: '', trim: true },
    ifsc: { type: String, default: '', trim: true },
  },
  { _id: false }
);

/** A room category and how many rooms of it the property has ("Premium", 46). */
const roomTypeSchema = new Schema(
  {
    name: { type: String, required: true, trim: true },
    count: { type: Number, required: true, min: 0 },
  },
  { _id: true }
);

/**
 * What the client documents print for the property (letterhead lines, tax
 * numbers, bank details) and, where the room calendar is on, its room
 * categories.
 */
const propertySchema = new Schema(
  {
    code: { type: String, enum: PROPERTY_CODES, required: true, unique: true },
    // "Hotel Centre Point Nagpur" — printed upper-case on the pro-forma header.
    name: { type: String, default: '', trim: true },
    // "Hotel Centre Point" — used in running text and client emails.
    shortName: { type: String, default: '', trim: true },
    // "hotel Amarjit PVT LTD" — the "(A unit of …)" on the pro-forma header.
    unitOf: { type: String, default: '', trim: true },
    address: { type: String, default: '', trim: true },
    // The registered office named in the credit application.
    registeredOffice: { type: String, default: '', trim: true },
    phone: { type: String, default: '', trim: true },
    email: { type: String, default: '', trim: true, lowercase: true },
    // Printed at the top of the pro-forma: "UDYAM NO:…".
    udyam: { type: String, default: '', trim: true },
    vatTin: { type: String, default: '', trim: true },
    cin: { type: String, default: '', trim: true },
    pan: { type: String, default: '', trim: true },
    gstin: { type: String, default: '', trim: true },
    fssai: { type: String, default: '', trim: true },
    bank: { type: bankSchema, default: () => ({}) },
    // Room categories with their counts. A property with rooms takes room
    // enquiries and has a room calendar; rooms are counted, not numbered.
    roomTypes: { type: [roomTypeSchema], default: [] },
    order: { type: Number, default: 0 },
    updatedBy: { type: Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true }
);

const Property = model('Property', propertySchema);

export default Property;
