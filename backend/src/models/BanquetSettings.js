import mongoose from 'mongoose';

const { Schema, model } = mongoose;

export const SLOT_RULES = ['multi-hold', 'exclusive'];

/**
 * Singleton settings document for the banquet calendar.
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
    updatedBy: { type: Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true }
);

const BanquetSettings = model('BanquetSettings', banquetSettingsSchema);

export default BanquetSettings;
