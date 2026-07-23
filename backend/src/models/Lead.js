import mongoose from 'mongoose';

const { Schema, model } = mongoose;

export const LEAD_STATUSES = ['Non Contracted', 'Contracted'];

export const CONTACTED_FOR_OPTIONS = ['CPA', 'CPH', 'CPNM'];

const noteSchema = new Schema(
  {
    body: { type: String, required: true },
    author: { type: Schema.Types.ObjectId, ref: 'User' },
    authorName: { type: String },
  },
  { timestamps: true }
);

const actionPointSchema = new Schema(
  {
    text: { type: String, required: true },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User' },
    createdByName: { type: String },
    createdAt: { type: Date, default: Date.now },
    cleared: { type: Boolean, default: false },
    clearedAt: { type: Date },
    clearedBy: { type: Schema.Types.ObjectId, ref: 'User' },
  },
  { _id: true }
);

const followUpSchema = new Schema(
  {
    dueDate: { type: Date, required: true },
    note: { type: String },
    status: { type: String, enum: ['open', 'closed'], default: 'open' },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User' },
    createdByName: { type: String },
    createdAt: { type: Date, default: Date.now },
    closingNote: { type: String },
    closedAt: { type: Date },
    closedBy: { type: Schema.Types.ObjectId, ref: 'User' },
  },
  { _id: true }
);

const instructionSchema = new Schema(
  {
    text: { type: String, required: true },
    issuedBy: { type: Schema.Types.ObjectId, ref: 'User' },
    issuedByName: { type: String },
    status: { type: String, enum: ['open', 'done'], default: 'open' },
    createdAt: { type: Date, default: Date.now },
    doneAt: { type: Date },
  },
  { _id: true }
);

const historySchema = new Schema(
  {
    type: { type: String },
    summary: { type: String },
    at: { type: Date, default: Date.now },
    by: { type: Schema.Types.ObjectId, ref: 'User' },
    byName: { type: String },
  },
  { _id: true }
);

const leadSchema = new Schema(
  {
    reference: { type: String, unique: true, index: true },
    businessName: { type: String, required: true },
    contactPerson: { type: String },
    designation: { type: String },
    mobile: { type: String },
    email: { type: String, lowercase: true },
    city: { type: String },
    businessType: { type: String },
    contactedFor: {
      type: [String],
      enum: CONTACTED_FOR_OPTIONS,
      default: [],
    },
    leadDate: { type: Date, default: Date.now },
    status: {
      type: String,
      enum: LEAD_STATUSES,
      default: 'Non Contracted',
      index: true,
    },
    assignedTo: { type: Schema.Types.ObjectId, ref: 'User', index: true },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User' },
    notes: [noteSchema],
    actionPoints: [actionPointSchema],
    followUps: [followUpSchema],
    instructions: [instructionSchema],
    history: [historySchema],
  },
  { timestamps: true }
);

const Lead = model('Lead', leadSchema);

export default Lead;
