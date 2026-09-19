import mongoose from 'mongoose';

import { attachMovementHooks } from './movementHooks.js';

const { Schema, model } = mongoose;

/**
 * Enquiry pipeline — one unified, event-driven stage set:
 *
 *   enquiry     — enquiry created
 *   proposal    — proposal PDF generated (emailing it changes nothing)
 *   waitlist    — the slot (date + venue + session) is held by another
 *                 enquiry; this one waits and drops back to its real stage
 *                 (`waitlist.resumeStage`) the moment the slot frees
 *   provisional — contract emailed (with the digital sign link)
 *   won         — marked won: advance received, or credit (PPS) approved
 *   lost        — manually marked lost (with a reason)
 *
 * Won, lost and cancelled are the manual moves; everything else follows
 * from an action. Cancelled is a booking the client backed out of after the
 * contract went out (provisional) or after it was confirmed (won).
 */
export const ENQUIRY_STAGES = [
  'enquiry',
  'proposal',
  'waitlist',
  'provisional',
  'won',
  'lost',
  'cancelled',
];

/** Stages that occupy a calendar slot (everything except lost and cancelled). */
export const ACTIVE_STAGES = ['enquiry', 'proposal', 'waitlist', 'provisional', 'won'];

export const ENQUIRY_KINDS = ['banquet', 'room', 'both'];

/** The hotel's lost reasons (Bingo Forge startup sheet), picked when marking lost. */
export const LOST_REASONS = [
  { code: 'no_response', label: 'No response from client' },
  { code: 'event_cancelled', label: 'Event cancelled' },
  { code: 'rooms_unavailable', label: 'Rooms not available' },
  { code: 'low_budget', label: 'Low on budget' },
  { code: 'venue_unavailable', label: 'Unavailability of venue' },
  { code: 'booked_other_venue', label: 'Booked another venue' },
  { code: 'booked_competitor', label: 'Booked competition hotel' },
  { code: 'date_passed', label: 'Date passed without confirmation' },
  { code: 'other', label: 'Other' },
];
export const LOST_REASON_CODES = LOST_REASONS.map((r) => r.code);

/** Why a provisional or confirmed booking was cancelled. */
export const CANCEL_REASONS = [
  { code: 'client_cancelled', label: 'Client cancelled the event' },
  { code: 'postponed', label: 'Event postponed' },
  { code: 'budget_cut', label: 'Budget cut' },
  { code: 'booked_other_venue', label: 'Booked another venue' },
  { code: 'advance_not_received', label: 'Advance not received' },
  { code: 'force_majeure', label: 'Force majeure' },
  { code: 'other', label: 'Other' },
];
export const CANCEL_REASON_CODES = CANCEL_REASONS.map((r) => r.code);

/** What became of an advance already received when the booking was cancelled. */
export const ADVANCE_OUTCOMES = ['refunded', 'forfeited', 'adjusted'];

const stageHistorySchema = new Schema(
  {
    stage: { type: String, enum: ENQUIRY_STAGES, required: true },
    at: { type: Date, default: Date.now },
    trigger: { type: String, default: '' },
    by: { type: Schema.Types.ObjectId, ref: 'User' },
    byName: { type: String },
  },
  { _id: false }
);

/**
 * A banquet function: one event on a date, held in a primary venue plus any
 * add-on rooms, for one or more sessions. Every dropdown (function type,
 * menu, add-ons, liquor) is an option configured in Banquet Setup, so nothing
 * here is free text.
 *
 * `venue` is the primary venue and `addOnRooms` the extra rooms; `venues` is
 * always primary + add-on rooms, in that order, and is what the calendar,
 * holds and reports read.
 *
 * Money is stored in rupees: `rackRate` is computed from the picked options
 * ((menu + add-ons + liquor per guest) x pax, plus any flat-priced options)
 * and `proposedRate` is what the team actually offers, editable.
 */
const functionSchema = new Schema(
  {
    functionType: { type: Schema.Types.ObjectId, ref: 'BanquetCatalog' },
    // Printed label, denormalised from the function type when saved.
    name: { type: String, default: '', trim: true },
    date: { type: Date, required: true },
    // Primary venue; add-on rooms are held alongside it for the same sessions.
    venue: { type: Schema.Types.ObjectId, ref: 'Venue' },
    addOnRooms: { type: [{ type: Schema.Types.ObjectId, ref: 'Venue' }], default: [] },
    // Every venue held (primary first, then add-on rooms) — what the calendar,
    // holds and reports read.
    venues: { type: [{ type: Schema.Types.ObjectId, ref: 'Venue' }], default: [] },
    sessions: { type: [{ type: Schema.Types.ObjectId, ref: 'BanquetSession' }], default: [] },
    // Venues whose hall charge is being applied to this function. Only rooms
    // actually held can appear here; the amount comes from Banquet Setup.
    hallChargeVenues: { type: [{ type: Schema.Types.ObjectId, ref: 'Venue' }], default: [] },
    pax: { type: Number, default: 0, min: 0 },

    menuType: { type: Schema.Types.ObjectId, ref: 'BanquetCatalog' },
    addOns: { type: [{ type: Schema.Types.ObjectId, ref: 'BanquetCatalog' }], default: [] },
    liquor: { type: [{ type: Schema.Types.ObjectId, ref: 'BanquetCatalog' }], default: [] },
    requirements: { type: [{ type: Schema.Types.ObjectId, ref: 'BanquetCatalog' }], default: [] },

    // Rates the team offered for this enquiry, per picked option (menu,
    // add-on, liquor, requirement). Anything not listed stays at the Banquet
    // Setup rate; the proposed rate is formed from these.
    lineRates: {
      type: [
        new Schema(
          {
            item: { type: Schema.Types.ObjectId, ref: 'BanquetCatalog', required: true },
            rate: { type: Number, default: 0, min: 0 },
          },
          { _id: false }
        ),
      ],
      default: [],
    },

    // Per-guest rate as offered, rack from the catalog, and the offer.
    perPaxRate: { type: Number, default: 0 },
    rackRate: { type: Number, default: 0 },
    proposedRate: { type: Number, default: 0 },
    // Anything not on the configured requirement list.
    additionalRequirement: { type: String, default: '' },
    notes: { type: String, default: '' },

    // Legacy single-select fields, kept so enquiries saved before the
    // multi-session form still render their slot and rate.
    session: { type: Schema.Types.ObjectId, ref: 'BanquetSession' },
    rate: { type: String, default: '' },
  },
  { _id: true }
);

/** Minimal room block — the room side (ARC, room calendar) is parked for now. */
const roomDetailsSchema = new Schema(
  {
    checkIn: { type: String, default: '' },
    checkOut: { type: String, default: '' },
    rooms: { type: String, default: '' },
    notes: { type: String, default: '' },
  },
  { _id: false }
);

/**
 * In-app signing state: expiring link token + email OTP + signature record.
 * The link goes out with the contract (or an addendum); `document` says
 * which PDF the live link signs. The contract's signature is recorded here;
 * an addendum's signature is recorded on that addendum.
 */
const signingSchema = new Schema(
  {
    document: { type: String, enum: ['proposal', 'contract', 'addendum'], default: 'contract' },
    documentVersion: { type: Number, min: 1 },
    tokenHash: { type: String, index: true },
    tokenExpiresAt: { type: Date },
    otpHash: { type: String },
    otpExpiresAt: { type: Date },
    otpAttempts: { type: Number, default: 0 },
    otpTarget: { type: String, default: '' },
    signedAt: { type: Date },
    signerName: { type: String, default: '' },
    signatureType: { type: String, enum: ['drawn', 'typed'] },
    signedPdfFileId: { type: Schema.Types.ObjectId },
    ip: { type: String, default: '' },
    userAgent: { type: String, default: '' },
  },
  { _id: false }
);

/** A generated + emailed document (proposal HCP.EP…, contract HCP.EC…). */
const documentSchema = new Schema(
  {
    version: { type: Number, min: 1, default: 1 },
    // Document reference printed in the header, e.g. HCP.EP.000012.00
    number: { type: String, default: '' },
    // How many times it was reissued after an edit (the proposal's ".01" suffix).
    revision: { type: Number, default: 0 },
    generatedAt: { type: Date },
    sentAt: { type: Date },
    sentTo: { type: String, default: '' },
    from: { type: String, default: '' },
  },
  { _id: false }
);

/**
 * One edit made while a document existed: which document it reissued (or
 * refreshed), the number it now carries, and what changed, line by line, so
 * the life cycle can show it.
 */
const revisionSchema = new Schema(
  {
    at: { type: Date, default: Date.now },
    by: { type: Schema.Types.ObjectId, ref: 'User' },
    byName: { type: String },
    // The stage the enquiry was at, so the life cycle lists it in that block.
    stage: { type: String, enum: ENQUIRY_STAGES, required: true },
    // enquiry | proposal | contract | addendum
    document: { type: String, default: 'enquiry' },
    number: { type: String, default: '' },
    changes: { type: [String], default: [] },
    // The headline figures either side of the edit, so the life cycle can
    // show what a stage did to the value and the guest count.
    paxBefore: { type: Number },
    paxAfter: { type: Number },
    valueBefore: { type: Number },
    valueAfter: { type: Number },
  },
  { _id: false }
);

/**
 * A superseded issue of the proposal or contract: the printed values it was
 * built from, kept as data (a few KB) so its PDF can be rebuilt on request
 * without storing the PDF itself. `print` is loaded only when asked for.
 */
const issueSchema = new Schema(
  {
    document: { type: String, enum: ['proposal', 'contract', 'proforma'], required: true },
    version: { type: Number, min: 1 },
    number: { type: String, default: '' },
    revision: { type: Number, default: 0 },
    generatedAt: { type: Date },
    sentAt: { type: Date },
    sentTo: { type: String, default: '' },
    supersededAt: { type: Date, default: Date.now },
    supersededByName: { type: String, default: '' },
    print: { type: Schema.Types.Mixed, select: false },
  },
  { _id: false }
);

const proformaSchema = new Schema(
  {
    version: { type: Number, min: 1, default: 1 },
    number: { type: String, default: '' },
    fileId: { type: Schema.Types.ObjectId },
    generatedAt: { type: Date },
    sentAt: { type: Date },
    sentTo: { type: String, default: '' },
    from: { type: String, default: '' },
    error: { type: String, default: '' },
  },
  { _id: false }
);

/**
 * One function as the client agreed to it — printed values, not references,
 * so an addendum can show the old line even after Banquet Setup changes.
 */
const agreedFunctionSchema = new Schema(
  {
    functionId: { type: Schema.Types.ObjectId },
    name: { type: String, default: '' },
    date: { type: Date },
    venue: { type: String, default: '' },
    sessions: { type: String, default: '' },
    pax: { type: Number, default: 0 },
    // Menu + add-on menu, and the per-guest rate offered for them.
    menu: { type: String, default: '' },
    rate: { type: Number, default: 0 },
    // Liquor and requirements, printed as picked.
    extras: { type: String, default: '' },
    // Hall charges ticked for the rooms held, e.g. "Palacio A Rs. 1,25,000".
    hallCharges: { type: String, default: '' },
    hallCharge: { type: Number, default: 0 },
    additionalRequirement: { type: String, default: '' },
    total: { type: Number, default: 0 },
  },
  { _id: false }
);

/** The arrangements as last sent to the client (contract, then each addendum). */
const agreedSchema = new Schema(
  {
    at: { type: Date },
    functions: { type: [agreedFunctionSchema], default: [] },
    room: { type: roomDetailsSchema, default: undefined },
  },
  { _id: false }
);

/** A client's digital signature on one addendum (the link lives on `signing`). */
const addendumSigningSchema = new Schema(
  {
    signedAt: { type: Date },
    signerName: { type: String, default: '' },
    signatureType: { type: String, enum: ['drawn', 'typed'] },
    signedPdfFileId: { type: Schema.Types.ObjectId },
    ip: { type: String, default: '' },
    userAgent: { type: String, default: '' },
  },
  { _id: false }
);

/**
 * Addendum to the agreement (HCP.AD.00001.00): made after the contract went
 * out and the client asked for changes. `before` is what the contract (or the
 * previous addendum) said, `after` what the enquiry now holds; the PDF is
 * built from these two so it prints the same later.
 */
const addendumSchema = new Schema(
  {
    number: { type: String, default: '' },
    generatedAt: { type: Date },
    effectiveDate: { type: Date },
    sentAt: { type: Date },
    sentTo: { type: String, default: '' },
    from: { type: String, default: '' },
    fileId: { type: Schema.Types.ObjectId },
    before: { type: agreedSchema, default: () => ({}) },
    after: { type: agreedSchema, default: () => ({}) },
    signing: { type: addendumSigningSchema, default: () => ({}) },
  },
  { _id: false }
);

export const ADVANCE_MODES = ['cash', 'upi', 'neft', 'cheque', 'card', 'other'];

/** Recorded when a provisional or confirmed booking is cancelled. */
const cancellationSchema = new Schema(
  {
    reasonCode: { type: String, enum: [...CANCEL_REASON_CODES, ''], default: '' },
    reason: { type: String, default: '' },
    at: { type: Date },
    by: { type: Schema.Types.ObjectId, ref: 'User' },
    byName: { type: String },
    // The stage it was cancelled from: provisional or won.
    fromStage: { type: String, default: '' },
    // Only when an advance had been received.
    advanceOutcome: { type: String, enum: [...ADVANCE_OUTCOMES, ''], default: '' },
    advanceAmount: { type: String, default: '' },
    advanceNote: { type: String, default: '' },
  },
  { _id: false }
);

/** Advance recorded when the enquiry is marked won. */
const advanceSchema = new Schema(
  {
    received: { type: Boolean, default: false },
    amount: { type: String, default: '' },
    date: { type: Date },
    mode: { type: String, enum: [...ADVANCE_MODES, ''], default: '' },
    reference: { type: String, default: '' },
    remarks: { type: String, default: '' },
    recordedAt: { type: Date },
    recordedBy: { type: Schema.Types.ObjectId, ref: 'User' },
    recordedByName: { type: String },
  },
  { _id: false }
);

/** One-time credit (no advance): the client is a PPS and signs the credit form. */
const creditSchema = new Schema(
  {
    pps: { type: Boolean, default: false },
    formGeneratedAt: { type: Date },
  },
  { _id: false }
);

/**
 * Waitlist state: which enquiry holds the slot, since when, and the stage to
 * drop back to when it frees. `freedAt` is set when that happens and stays
 * until the team acts on the enquiry or dismisses the notice.
 */
const waitlistSchema = new Schema(
  {
    since: { type: Date },
    heldBy: { type: Schema.Types.ObjectId, ref: 'Enquiry' },
    heldByName: { type: String, default: '' },
    resumeStage: { type: String, enum: ['enquiry', 'proposal', 'provisional'], default: 'enquiry' },
    freedAt: { type: Date },
  },
  { _id: false }
);

const wonSchema = new Schema(
  {
    at: { type: Date },
    // What confirmed the booking: the advance, or one-time credit.
    basis: { type: String, enum: ['advance', 'credit', ''], default: '' },
    by: { type: Schema.Types.ObjectId, ref: 'User' },
    byName: { type: String },
  },
  { _id: false }
);

export const EMAIL_KINDS = ['proposal', 'contract', 'proforma', 'addendum', 'signed'];

/** Every client email sent for this enquiry, newest last. */
const emailLogSchema = new Schema(
  {
    kind: { type: String, enum: EMAIL_KINDS, required: true },
    to: { type: String, default: '' },
    cc: { type: String, default: '' },
    from: { type: String, default: '' },
    subject: { type: String, default: '' },
    at: { type: Date, default: Date.now },
    by: { type: Schema.Types.ObjectId, ref: 'User' },
    byName: { type: String },
  },
  { _id: false }
);

const enquirySchema = new Schema(
  {
    lead: { type: Schema.Types.ObjectId, ref: 'Lead', required: true, index: true },
    // The branch/department node (Lead.departments._id) this enquiry belongs
    // to. Required for company leads; unset for individuals.
    department: { type: Schema.Types.ObjectId, index: true },
    kind: { type: String, enum: ENQUIRY_KINDS, default: 'banquet' },
    stage: { type: String, enum: ENQUIRY_STAGES, default: 'enquiry', index: true },
    stageHistory: { type: [stageHistorySchema], default: [] },

    // Client contact for this enquiry — proposal email + sign OTP go here.
    contactName: { type: String, default: '' },
    contactEmail: { type: String, default: '', lowercase: true },
    contactPhone: { type: String, default: '' },

    functions: { type: [functionSchema], default: [] },
    room: { type: roomDetailsSchema, default: undefined },

    estimatedRevenue: { type: String, default: '' },
    notes: { type: String, default: '' },

    // Billing instruction block on the proposal.
    billingName: { type: String, default: '' },
    gstNumber: { type: String, default: '' },
    panNumber: { type: String, default: '' },
    paymentTerms: { type: String, default: '' },

    proposal: { type: documentSchema, default: () => ({}) },
    contract: { type: documentSchema, default: () => ({}) },
    signing: { type: signingSchema, default: () => ({}) },
    proforma: { type: proformaSchema, default: () => ({}) },
    // The functions and rooms exactly as the enquiry was raised, so the life
    // cycle can start from the original figures however much was edited since.
    raised: { type: agreedSchema, default: undefined },
    // What the client last agreed to, and the addendums recording changes since.
    agreed: { type: agreedSchema, default: () => ({}) },
    addendums: { type: [addendumSchema], default: [] },
    // Set when the details change after the contract went out; cleared once
    // an addendum recording the change is emailed.
    addendumDue: { type: Boolean, default: false },
    // Every edit made while a document existed, with the document it reissued.
    revisions: { type: [revisionSchema], default: [] },
    // Every proposal and contract issue those edits superseded, as data.
    issues: { type: [issueSchema], default: [] },
    // Latest rendered proposal/contract inputs, JSON only; moved to issues on edit.
    documentPrints: { type: Schema.Types.Mixed, select: false },
    advance: { type: advanceSchema, default: () => ({}) },
    cancellation: { type: cancellationSchema, default: () => ({}) },
    credit: { type: creditSchema, default: () => ({}) },
    won: { type: wonSchema, default: () => ({}) },
    waitlist: { type: waitlistSchema, default: () => ({}) },
    emails: { type: [emailLogSchema], default: [] },

    lostReasonCode: { type: String, enum: [...LOST_REASON_CODES, ''], default: '' },
    lostReason: { type: String, default: '' },
    lostAt: { type: Date },

    createdBy: { type: Schema.Types.ObjectId, ref: 'User' },
    createdByName: { type: String },
  },
  { timestamps: true }
);

enquirySchema.index({ 'functions.date': 1 });

// Every stage move, including the waitlist engine's and the client's
// signature, notifies the team.
attachMovementHooks(enquirySchema, { entityType: 'Enquiry', field: 'stage' });

const Enquiry = model('Enquiry', enquirySchema);

export default Enquiry;
