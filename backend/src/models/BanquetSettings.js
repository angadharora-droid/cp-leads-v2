import mongoose from 'mongoose';

const { Schema, model } = mongoose;

export const SLOT_RULES = ['multi-hold', 'exclusive'];

export const DEMAND_LEVELS = ['high', 'peak'];

export const PAYMENT_DUE_RULES = ['on_confirmation', 'days_before_event', 'days_after_event'];

export const DEFAULT_STAGE_TAT_DAYS = { enquiry: 3, proposal: 7, waitlist: 14, provisional: 7 };

/**
 * Banquet settings. The document keyed 'default' holds what applies to the
 * whole group (stage TAT, payment schedule, prospectus / estimate
 * recipients); one document per property, keyed by its code (HCP, CPA,
 * CPNM), holds that hotel's slot rule and demand dates.
 *
 * slotRule (default 'exclusive' — any active enquiry hard-blocks the slot):
 *  - 'exclusive'  — one function per date + venue + session, first come.
 *  - 'multi-hold' — several soft holds (enquiry → provisional) may sit on the
 *    same date + venue + session; only a Won booking locks the slot.
 */
const banquetSettingsSchema = new Schema(
  {
    key: { type: String, default: 'default', unique: true },
    slotRule: { type: String, enum: SLOT_RULES, default: 'exclusive' },
    sessionsSeeded: { type: Boolean, default: false },
    // Department mailboxes every Function Prospectus is emailed to.
    prospectusRecipients: {
      type: [
        new Schema(
          {
            name: { type: String, default: '', trim: true },
            email: { type: String, lowercase: true, trim: true },
          },
          { _id: false }
        ),
      ],
      default: [],
    },
    // Finance mailboxes every Banquet Estimate is emailed to.
    estimateRecipients: {
      type: [
        new Schema(
          {
            name: { type: String, default: '', trim: true },
            email: { type: String, lowercase: true, trim: true },
          },
          { _id: false }
        ),
      ],
      default: [],
    },
    // Turnaround time: how many days an enquiry may sit in each open stage
    // before it is flagged as over TAT (board, enquiry page, reports).
    stageTatDays: {
      enquiry: { type: Number, default: 3, min: 0 },
      proposal: { type: Number, default: 7, min: 0 },
      waitlist: { type: Number, default: 14, min: 0 },
      provisional: { type: Number, default: 7, min: 0 },
    },
    // The standard payment schedule a booking starts from. Each milestone is
    // a share of the booking value (menu revenue + GST), due on confirmation
    // (contract sent) or a number of days before / after the first event.
    paymentSchedule: {
      type: [
        new Schema(
          {
            label: { type: String, required: true, trim: true },
            percent: { type: Number, required: true, min: 0, max: 100 },
            due: { type: String, enum: PAYMENT_DUE_RULES, default: 'on_confirmation' },
            days: { type: Number, default: 0, min: 0 },
          },
          { _id: false }
        ),
      ],
      default: () => [
        { label: 'Advance', percent: 30, due: 'on_confirmation', days: 0 },
        { label: 'Balance', percent: 70, due: 'days_after_event', days: 60 },
      ],
    },
    // Dates with more demand than usual (wedding muhurats, festivals, year
    // end). Each session's revenue target follows the date's demand level.
    demandDates: {
      type: [
        new Schema(
          {
            from: { type: Date, required: true },
            to: { type: Date, required: true },
            level: { type: String, enum: DEMAND_LEVELS, default: 'high' },
            note: { type: String, default: '', trim: true },
          },
          { _id: true }
        ),
      ],
      default: [],
    },
    updatedBy: { type: Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true }
);

const BanquetSettings = model('BanquetSettings', banquetSettingsSchema);

export default BanquetSettings;
