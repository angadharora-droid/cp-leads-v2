import mongoose from 'mongoose';

import { attachMovementHooks } from './movementHooks.js';

const { Schema, model } = mongoose;

/** The clause printed under Remarks on every estimate. */
export const STANDARD_REMARKS =
  'In case the number of guests increases than the number guaranteed, the management will offer food & services only for the additional 20% of the guaranteed number. Any further increase will levy a 15% surcharge in addition to the rate per head*';

/**
 * Banquet Estimate: the two-page finance sheet raised from a Function
 * Prospectus once the function is on. Page one carries the contract and
 * billing terms; page two is the detailed bill break-up.
 *
 * Only the header, contract and billing block are filled by the app. The
 * additional-consumption table and the whole bill break-up print as an empty
 * grid — operations and finance write those in by hand on the day, and the
 * sheet is signed on paper.
 *
 * It is raised as a draft and stays editable until a manager on the estimate
 * desk approves it. Approving is final: it can then be downloaded and emailed,
 * but nobody can change it again. A wrong one is deleted by an admin and a
 * fresh estimate raised in its place.
 */
export const ESTIMATE_STATUS = ['draft', 'approved'];

/** One venue and what it is charged for. */
const hallChargeSchema = new Schema(
  {
    venue: { type: String, default: '', trim: true },
    amount: { type: Number, default: 0 },
  },
  { _id: false }
);

const estimateEmailSchema = new Schema(
  {
    to: { type: String, default: '' },
    cc: { type: String, default: '' },
    subject: { type: String, default: '' },
    at: { type: Date, default: Date.now },
    by: { type: Schema.Types.ObjectId, ref: 'User' },
    byName: { type: String },
  },
  { _id: false }
);

const banquetEstimateSchema = new Schema(
  {
    // Sequential estimate number, printed as "Estimate No. 0001".
    number: { type: String, required: true, unique: true, index: true },

    // The prospectus this was raised from; one estimate per sheet.
    prospectus: { type: Schema.Types.ObjectId, ref: 'FunctionProspectus', required: true },
    enquiry: { type: Schema.Types.ObjectId, ref: 'Enquiry', index: true },
    functionId: { type: Schema.Types.ObjectId, index: true },
    lead: { type: Schema.Types.ObjectId, ref: 'Lead', index: true },

    // Header block.
    functionName: { type: String, default: '' },
    functionType: { type: String, default: '' },
    date: { type: Date },
    venue: { type: String, default: '' },
    session: { type: String, default: '' },
    // "29931 / 1" — the hotel reservation with the function's serial.
    reservationNo: { type: String, default: '', trim: true },

    // Contract details.
    guaranteedPax: { type: Number, default: 0 },
    pricePerPlate: { type: Number, default: 0 },
    // Optional: the hall charge for each venue the function holds — the
    // primary room and any add-on rooms. Nothing prints while every amount is
    // zero, as the house form has no such row.
    hallCharges: { type: [hallChargeSchema], default: [] },
    // Typed as it is printed, e.g. "805, AFTER 72 PLATES".
    additionalPlatePrice: { type: String, default: '' },

    // Billing details (finance).
    billingName: { type: String, default: '' },
    billingCode: { type: String, default: '' },
    panNo: { type: String, default: '' },
    gstNo: { type: String, default: '' },
    paymentMode: { type: String, default: '' },
    advanceReceived: { type: Number, default: 0 },

    remarks: { type: String, default: STANDARD_REMARKS },

    // Draft until approved; approving freezes every field above for good.
    status: { type: String, enum: ESTIMATE_STATUS, default: 'draft', index: true },
    approval: {
      at: { type: Date },
      by: { type: Schema.Types.ObjectId, ref: 'User' },
      byName: { type: String, default: '' },
    },

    madeBy: { type: Schema.Types.ObjectId, ref: 'User' },
    madeByName: { type: String, default: '' },
    printedAt: { type: Date },
    emails: { type: [estimateEmailSchema], default: [] },

    // Printed values of the prospectus when the fields were last filled, so a
    // later change to the sheet can be flagged.
    sourceKey: { type: String, default: '' },
  },
  { timestamps: true, optimisticConcurrency: true }
);

banquetEstimateSchema.index({ prospectus: 1 }, { unique: true });
banquetEstimateSchema.index({ date: 1 });

attachMovementHooks(banquetEstimateSchema, { entityType: 'BanquetEstimate', field: 'status' });

const BanquetEstimate = model('BanquetEstimate', banquetEstimateSchema);

export default BanquetEstimate;
