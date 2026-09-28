import mongoose from 'mongoose';

const { Schema, model } = mongoose;

/**
 * One line of a registered company's ledger. Debits are what the company
 * owes (a confirmed booking, an invoice); credits are what it paid or was
 * given back (a payment received, a credit note, a cancelled booking).
 * Bookings and payments post themselves; managers add the rest by hand.
 */
export const LEDGER_KINDS = ['booking', 'payment', 'invoice', 'credit_note', 'cancellation', 'adjustment'];

export const LEDGER_KIND_LABELS = {
  booking: 'Booking confirmed',
  payment: 'Payment received',
  invoice: 'Invoice',
  credit_note: 'Credit note',
  cancellation: 'Booking cancelled',
  adjustment: 'Adjustment',
};

const ledgerEntrySchema = new Schema(
  {
    lead: { type: Schema.Types.ObjectId, ref: 'Lead', required: true, index: true },
    date: { type: Date, required: true },
    kind: { type: String, enum: LEDGER_KINDS, required: true },
    description: { type: String, default: '', trim: true },
    reference: { type: String, default: '', trim: true },
    debit: { type: Number, default: 0, min: 0 },
    credit: { type: Number, default: 0, min: 0 },
    enquiry: { type: Schema.Types.ObjectId, ref: 'Enquiry', index: true },
    milestone: { type: Schema.Types.ObjectId },
    // Posted by the system (booking / payment / cancellation) rather than typed in.
    auto: { type: Boolean, default: false },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User' },
    createdByName: { type: String },
  },
  { timestamps: true }
);

ledgerEntrySchema.index({ lead: 1, date: 1 });

const LedgerEntry = model('LedgerEntry', ledgerEntrySchema);

export default LedgerEntry;
