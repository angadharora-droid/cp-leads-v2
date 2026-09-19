import mongoose from 'mongoose';

import { attachMovementHooks } from './movementHooks.js';

const { Schema, model } = mongoose;

export const ADVANCE_MODE_OPTIONS = ['cash', 'card', 'cheque', 'upi', 'neft', 'other', ''];
export const RATE_BASIS = ['exclusive', 'inclusive'];

/**
 * Function Prospectus (FP): the one-page operational sheet the hotel prints
 * for a confirmed function, after the house "FP" print — dates, time, venue,
 * guaranteed pax, the itemised menu, the party's details, rate / hall rent /
 * advance, billing, board to read, department and special instructions.
 *
 * One per function of a Won enquiry. The booking-derived fields are filled
 * from the enquiry when the FP is made (and again on "refresh from booking");
 * everything operational is typed by the banquet team. There are no stages —
 * it is made, printed and emailed to the departments.
 */
const prospectusEmailSchema = new Schema(
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

const functionProspectusSchema = new Schema(
  {
    // Sequential FP number, printed as "FP No/DT : 0001 / dd/mm/yy".
    number: { type: String, required: true, unique: true, index: true },
    // The hotel system's reservation number, typed in when known.
    reservationNo: { type: String, default: '', trim: true },

    enquiry: { type: Schema.Types.ObjectId, ref: 'Enquiry', required: true, index: true },
    functionId: { type: Schema.Types.ObjectId, required: true, index: true },
    lead: { type: Schema.Types.ObjectId, ref: 'Lead', index: true },

    // Header row.
    dateFrom: { type: Date },
    dateTo: { type: Date },
    timeFrom: { type: String, default: '' },
    timeTo: { type: String, default: '' },
    functionType: { type: String, default: '' },
    venue: { type: String, default: '' },
    pax: { type: Number, default: 0 },

    // Party.
    partyName: { type: String, default: '' },
    companyName: { type: String, default: '' },
    address: { type: String, default: '' },
    contactPerson: { type: String, default: '' },
    phone: { type: String, default: '' },
    email: { type: String, default: '' },

    seating: { type: String, default: '' },
    addOnRooms: { type: String, default: '' },

    // Commercials, in rupees.
    rate: { type: Number, default: 0 },
    rateBasis: { type: String, enum: RATE_BASIS, default: 'exclusive' },
    hallRent: { type: Number, default: 0 },
    hallRentBasis: { type: String, enum: RATE_BASIS, default: 'exclusive' },
    advanceMode: { type: String, enum: ADVANCE_MODE_OPTIONS, default: '' },
    advanceAmount: { type: Number, default: 0 },
    paidOut: { type: Number, default: 0 },
    netAmount: { type: Number, default: 0 },

    billingInstruction: { type: String, default: '' },
    boardToRead: { type: String, default: '' },
    deptInstruction: { type: String, default: '' },
    specialInstructions: { type: String, default: '' },
    // The food menu by course. The courses are copied from the booking's
    // menu package (Banquet Setup) when the sheet is made and cannot be added
    // to on the sheet; the dishes under each are typed by the banquet team.
    menuPackage: { type: String, default: '' },
    menuCourses: {
      type: [new Schema({ name: { type: String, default: '' }, dishes: { type: [String], default: [] } }, { _id: false })],
      default: [],
    },
    // Retired: a short-lived add-ons list; its lines join the courses when
    // the sheet is next opened.
    menuAddOns: { type: String, default: '' },
    // Free-text food menu: sheets made before the courses existed, and
    // packages that have no courses configured. Then the liquor menu and the
    // other requirements (AV and the like): one item per line, printed as typed.
    menu: { type: String, default: '' },
    liquorMenu: { type: String, default: '' },
    otherRequirements: { type: String, default: '' },

    madeBy: { type: Schema.Types.ObjectId, ref: 'User' },
    madeByName: { type: String, default: '' },
    status: { type: String, enum: ['draft', 'approved'], default: 'draft', index: true },
    approval: {
      at: { type: Date },
      by: { type: Schema.Types.ObjectId, ref: 'User' },
      byName: { type: String },
    },
    // Bumped every time the sheet is saved again after it was first printed or emailed.
    revision: { type: Number, default: 1 },
    printedAt: { type: Date },
    emails: { type: [prospectusEmailSchema], default: [] },

    // Printed values of the function when the booking fields were last
    // filled, so a later change to the booking (an addendum) can be flagged.
    sourceKey: { type: String, default: '' },
  },
  { timestamps: true, optimisticConcurrency: true }
);

functionProspectusSchema.index({ enquiry: 1, functionId: 1 }, { unique: true });
functionProspectusSchema.index({ dateFrom: 1 });

// Raised, approved, or edited back to draft: each notifies the team.
attachMovementHooks(functionProspectusSchema, { entityType: 'FunctionProspectus', field: 'status' });

const FunctionProspectus = model('FunctionProspectus', functionProspectusSchema);

export default FunctionProspectus;
