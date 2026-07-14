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

const corporateRateRowSchema = new Schema(
  {
    category: { type: String, default: '' },
    size: { type: String, default: '' },
    singleRate: { type: String, default: '' },
    doubleRate: { type: String, default: '' },
  },
  { _id: false }
);

const corporatePropertySchema = new Schema(
  {
    propertyName: { type: String, default: '' },
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
    docType: { type: String, enum: ['proposal', 'confirmation'] },
    status: { type: String, enum: ['sent', 'failed'], default: 'sent' },
    error: { type: String },
    sentAt: { type: Date, default: Date.now },
    sentBy: { type: Schema.Types.ObjectId, ref: 'User' },
    sentByName: { type: String },
  },
  { _id: true }
);

const confirmationFileSchema = new Schema(
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
    confirmationFiles: { type: [confirmationFileSchema], default: [] },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User' },
    createdByName: { type: String },
  },
  { timestamps: true }
);

const Kit = model('Kit', kitSchema);

export default Kit;
