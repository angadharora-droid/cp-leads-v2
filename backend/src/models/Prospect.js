import mongoose from 'mongoose';

import { CONTACTED_FOR_OPTIONS, LEAD_STATUSES } from './Lead.js';

const { Schema, model } = mongoose;

/**
 * A lead as it first comes in: just a person — who they are and how to reach
 * them. It sits in the Leads section until it is classified: linked to (or
 * turned into) an Individual, or placed as a contact under a Company's
 * branch / department. Once classified it leaves the Leads section and the
 * company / individual record (the Lead model) carries everything forward.
 */

const noteSchema = new Schema(
  {
    body: { type: String, required: true },
    author: { type: Schema.Types.ObjectId, ref: 'User' },
    authorName: { type: String },
  },
  { timestamps: true }
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

const prospectSchema = new Schema(
  {
    name: { type: String, required: true, trim: true },
    mobile: { type: String, trim: true },
    email: { type: String, lowercase: true, trim: true },
    city: { type: String, trim: true },
    contactedFor: { type: [String], enum: CONTACTED_FOR_OPTIONS, default: [] },
    status: { type: String, enum: LEAD_STATUSES, default: 'Non Contracted' },
    assignedTo: { type: Schema.Types.ObjectId, ref: 'User', index: true },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User' },
    notes: [noteSchema],
    followUps: [followUpSchema],
    // Only managers register companies: an executive whose person works at a
    // company that is not in the system asks for it here, and the lead waits
    // until a manager creates the company and links it.
    companyRequest: {
      businessName: { type: String, trim: true },
      businessType: { type: String, trim: true },
      branch: { type: String, trim: true },
      department: { type: String, trim: true },
      designation: { type: String, trim: true },
      requestedBy: { type: Schema.Types.ObjectId, ref: 'User' },
      requestedByName: { type: String },
      requestedAt: { type: Date },
    },
    // Set once the lead is classified; the lead then leaves the Leads section.
    classifiedAt: { type: Date, index: true },
    classifiedBy: { type: Schema.Types.ObjectId, ref: 'User' },
    classifiedAs: { type: String, enum: ['company', 'individual'] },
    linkedLead: { type: Schema.Types.ObjectId, ref: 'Lead' },
    linkedDepartment: { type: Schema.Types.ObjectId },
  },
  { timestamps: true }
);

const Prospect = model('Prospect', prospectSchema);

export default Prospect;
