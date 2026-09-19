import mongoose from 'mongoose';

const { Schema, model } = mongoose;

/**
 * Banquet session (Morning / Evening / Lunch…) — configured by admins.
 * Times are display strings ("08:00", "6:30 PM") so the team writes exactly
 * what appears on documents, mirroring how kit figures are stored.
 */
const banquetSessionSchema = new Schema(
  {
    name: { type: String, required: true, trim: true },
    startTime: { type: String, default: '' },
    endTime: { type: String, default: '' },
    active: { type: Boolean, default: true },
    order: { type: Number, default: 0 },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true }
);

banquetSessionSchema.index({ name: 1 }, { unique: true });

const BanquetSession = model('BanquetSession', banquetSessionSchema);

export default BanquetSession;
