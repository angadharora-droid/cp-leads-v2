import mongoose from 'mongoose';

import { attachMovementHooks } from './movementHooks.js';

const { Schema, model } = mongoose;

export const LEAD_STATUSES = ['Non Contracted', 'Contracted'];

/**
 * A lead is either a company or an individual. Companies are structured as a
 * tree — Company → Branch → Department — and every enquiry / rate contract
 * hangs off one department node. Individuals have no structure.
 */
export const LEAD_TYPES = ['company', 'individual'];

export const CONTACTED_FOR_OPTIONS = ['CPA', 'CPH', 'CPNM'];

export const VISIT_ACTION_OPTIONS = [
  'No action',
  'Send proposal',
  'Send rates',
  'Send agreement',
  'Schedule meeting',
  'Follow up call',
  'Collect signed confirmation',
];

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

const visitReportSchema = new Schema(
  {
    visitDate: { type: Date, required: true },
    note: { type: String, required: true },
    followUpDate: { type: Date },
    followUpNote: { type: String },
    actionPoint: {
      type: String,
      enum: VISIT_ACTION_OPTIONS,
      default: 'No action',
    },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User' },
    createdByName: { type: String },
    createdAt: { type: Date, default: Date.now },
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

// Activity belongs to one enquiry; an absent reference is older unlinked activity.
for (const schema of [noteSchema, actionPointSchema, followUpSchema, visitReportSchema, instructionSchema]) {
  schema.add({ enquiry: { type: Schema.Types.ObjectId, ref: 'Enquiry' } });
}

/**
 * One node of a company's structure: a department, optionally under a
 * branch. `branch` is free text and may be empty when the company has no
 * branches; `name` is the department. Enquiries and ARCs reference the node
 * by its _id.
 */
const departmentSchema = new Schema(
  {
    branch: { type: String, default: '', trim: true },
    name: { type: String, required: true, trim: true },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User' },
    createdByName: { type: String },
    createdAt: { type: Date, default: Date.now },
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
    leadType: { type: String, enum: LEAD_TYPES, default: 'company', index: true },
    // Company name, or the person's full name for individual leads.
    businessName: { type: String, required: true },
    // Company structure (empty for individuals).
    departments: { type: [departmentSchema], default: [] },
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
    visitReports: [visitReportSchema],
    instructions: [instructionSchema],
    history: [historySchema],
  },
  { timestamps: true }
);

// A new lead, or a Contracted / Non Contracted change, notifies the team.
attachMovementHooks(leadSchema, { entityType: 'Lead', field: 'status' });

const Lead = model('Lead', leadSchema);

export default Lead;
