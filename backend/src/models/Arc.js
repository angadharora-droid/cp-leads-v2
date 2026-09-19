import mongoose from 'mongoose';

import { attachMovementHooks } from './movementHooks.js';

const { Schema, model } = mongoose;

/**
 * ARC — an annual (corporate) room-rate contract. Like enquiries, an ARC
 * hangs off one branch/department node of a company lead and moves through
 * an event-driven funnel:
 *
 *   enquiry    — ARC raised; agreement not yet generated
 *   proposal   — rate agreement generated
 *   awaiting   — agreement emailed; awaiting the signed copy
 *   contracted — signed copy uploaded
 *   lost       — manually marked lost (the one manual transition)
 *
 * The agreement itself is a corporate Kit linked via `kit`; the kit's
 * generate / email / confirmation-upload actions drive the stage. Renewals
 * are new ARCs under the same node — older ones stay as history.
 */
export const ARC_STAGES = ['enquiry', 'proposal', 'awaiting', 'contracted', 'lost'];

export const ACTIVE_ARC_STAGES = ['enquiry', 'proposal', 'awaiting', 'contracted'];

const stageHistorySchema = new Schema(
  {
    stage: { type: String, enum: ARC_STAGES, required: true },
    at: { type: Date, default: Date.now },
    trigger: { type: String, default: '' },
    by: { type: Schema.Types.ObjectId, ref: 'User' },
    byName: { type: String },
  },
  { _id: false }
);

const arcSchema = new Schema(
  {
    lead: { type: Schema.Types.ObjectId, ref: 'Lead', required: true, index: true },
    // Branch/department node (Lead.departments._id). Required for company
    // leads; unset for individuals.
    department: { type: Schema.Types.ObjectId, index: true },
    kit: { type: Schema.Types.ObjectId, ref: 'Kit' },

    stage: { type: String, enum: ARC_STAGES, default: 'enquiry', index: true },
    stageHistory: { type: [stageHistorySchema], default: [] },

    title: { type: String, default: '', trim: true },
    contactName: { type: String, default: '' },
    contactEmail: { type: String, default: '', lowercase: true },
    contactPhone: { type: String, default: '' },
    validFrom: { type: Date },
    validTo: { type: Date },
    notes: { type: String, default: '' },

    lostReason: { type: String, default: '' },
    lostAt: { type: Date },

    createdBy: { type: Schema.Types.ObjectId, ref: 'User' },
    createdByName: { type: String },
  },
  { timestamps: true }
);

attachMovementHooks(arcSchema, { entityType: 'Arc', field: 'stage' });

const Arc = model('Arc', arcSchema);

export default Arc;
