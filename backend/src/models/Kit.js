import mongoose from 'mongoose';

const { Schema, model } = mongoose;

export const KIT_TYPES = ['event', 'corporate'];
export const KIT_STATUSES = ['draft', 'sent', 'confirmed'];

/* --------------------------- Event kit details --------------------------- */
// All figure fields are strings so the team can write exactly what goes on
// the document ("Rs. 6,499", "Waived off", "DEPENDS ON THE OCCUPANCY", …).

const roomRowSchema = new Schema(
  {
    checkIn: { type: String, default: '' },
    checkOut: { type: String, default: '' },
    occupancyType: { type: String, default: '' },
    category: { type: String, default: '' },
    mealPlan: { type: String, default: '' },
    numRooms: { type: String, default: '' },
    rate: { type: String, default: '' },
    estRevenue: { type: String, default: '' },
  },
  { _id: false }
);

const otherRoomRateSchema = new Schema(
  {
    category: { type: String, default: '' },
    rate: { type: String, default: '' },
  },
  { _id: false }
);

const eventMealRowSchema = new Schema(
  {
    date: { type: String, default: '' },
    eventType: { type: String, default: '' },
    venue: { type: String, default: '' },
    guaranteedGuests: { type: String, default: '' },
    menu: { type: String, default: '' },
    rackRate: { type: String, default: '' },
    discountedRate: { type: String, default: '' },
    estRevenue: { type: String, default: '' },
  },
  { _id: false }
);

const otherRequirementSchema = new Schema(
  {
    particulars: { type: String, default: '' },
    details: { type: String, default: '' },
    rate: { type: String, default: '' },
    estRevenue: { type: String, default: '' },
  },
  { _id: false }
);

const eventDetailsSchema = new Schema(
  {
    guestName: { type: String, default: '' },
    eventType: { type: String, default: '' },
    eventDates: { type: String, default: '' },
    mobile: { type: String, default: '' },
    email: { type: String, default: '' },
    billingName: { type: String, default: 'Kindly Advise' },
    gstNumber: { type: String, default: 'Kindly Advise' },
    panNumber: { type: String, default: 'Kindly Advise' },
    paymentTerms: { type: String, default: '' },
    rooms: { type: [roomRowSchema], default: [] },
    roomsEstimatedRevenue: { type: String, default: '' },
    otherRoomRates: { type: [otherRoomRateSchema], default: [] },
    inclusions: { type: [String], default: [] },
    events: { type: [eventMealRowSchema], default: [] },
    eventsEstimatedRevenue: { type: String, default: '' },
    otherRequirements: { type: [otherRequirementSchema], default: [] },
    sessionTimings: { type: [String], default: [] },
    notes: { type: String, default: '' },
  },
  { _id: false }
);

/* ------------------------- Corporate kit details ------------------------- */

export const RATE_PLANS = [
  { code: 'CP', label: 'Continental Plan' },
  { code: 'MAP', label: 'Modified American Plan' },
  { code: 'AP', label: 'American Plan' },
  { code: 'EP', label: 'European Plan' },
];
export const RATE_PLAN_CODES = RATE_PLANS.map((p) => p.code);

const corporateRateRowSchema = new Schema(
  {
    category: { type: String, default: '' },
    size: { type: String, default: '' },
    // Legacy columns from before rate plans existed — read as Continental
    // Plan rates for kits saved by older versions.
    singleRate: { type: String, default: '' },
    doubleRate: { type: String, default: '' },
    cpSingle: { type: String, default: '' },
    cpDouble: { type: String, default: '' },
    mapSingle: { type: String, default: '' },
    mapDouble: { type: String, default: '' },
    apSingle: { type: String, default: '' },
    apDouble: { type: String, default: '' },
    epSingle: { type: String, default: '' },
    epDouble: { type: String, default: '' },
  },
  { _id: false }
);

const corporatePropertySchema = new Schema(
  {
    propertyName: { type: String, default: '' },
    plans: { type: [String], enum: RATE_PLAN_CODES, default: ['CP'] },
    rows: { type: [corporateRateRowSchema], default: [] },
  },
  { _id: false }
);

const corporateDetailsSchema = new Schema(
  {
    companyName: { type: String, default: '' },
    contactPerson: { type: String, default: '' },
    mobile: { type: String, default: '' },
    address: { type: String, default: '' },
    email: { type: String, default: '' },
    gstNumber: { type: String, default: '' },
    panNumber: { type: String, default: '' },
    accountPersonName: { type: String, default: '' },
    accountPersonNumber: { type: String, default: '' },
    billingAddress: { type: String, default: '' },
    properties: { type: [corporatePropertySchema], default: [] },
    validUntil: { type: String, default: '' },
    extraBedRate: { type: String, default: 'INR 1500 plus taxes' },
    notes: { type: String, default: '' },
  },
  { _id: false }
);

/* ------------------------------ Shared bits ------------------------------ */

const emailLogSchema = new Schema(
  {
    to: { type: String, required: true },
    cc: { type: String },
    subject: { type: String },
    // Address the mail was sent from (the exec's linked mailbox, if any).
    from: { type: String },
    docType: { type: String, enum: ['proposal', 'confirmation'] },
    status: { type: String, enum: ['sent', 'failed'], default: 'sent' },
    error: { type: String },
    sentAt: { type: Date, default: Date.now },
    sentBy: { type: Schema.Types.ObjectId, ref: 'User' },
    sentByName: { type: String },
  },
  { _id: true }
);

const uploadedFileSchema = new Schema(
  {
    fileId: { type: Schema.Types.ObjectId, required: true },
    filename: { type: String, required: true },
    contentType: { type: String },
    size: { type: Number },
    uploadedAt: { type: Date, default: Date.now },
    uploadedBy: { type: Schema.Types.ObjectId, ref: 'User' },
    uploadedByName: { type: String },
  },
  { _id: true }
);

/* --------------------------------- Kit ----------------------------------- */

const kitSchema = new Schema(
  {
    lead: { type: Schema.Types.ObjectId, ref: 'Lead', required: true, index: true },
    kitType: { type: String, enum: KIT_TYPES, required: true },
    status: { type: String, enum: KIT_STATUSES, default: 'draft', index: true },
    contractNumber: { type: String, default: '' },
    event: { type: eventDetailsSchema, default: undefined },
    corporate: { type: corporateDetailsSchema, default: undefined },
    emailLog: { type: [emailLogSchema], default: [] },
    confirmationFiles: { type: [uploadedFileSchema], default: [] },
    // Edited agreement uploaded by the sales exec — attached to client emails
    // in place of the auto-generated document when present.
    agreementFile: { type: uploadedFileSchema, default: undefined },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User' },
    createdByName: { type: String },
  },
  { timestamps: true }
);

const Kit = model('Kit', kitSchema);

export default Kit;
