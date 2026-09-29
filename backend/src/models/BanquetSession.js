import mongoose from 'mongoose';

import { PROPERTY_CODES } from './Property.js';

const { Schema, model } = mongoose;

/**
 * Banquet session (Morning / Evening / Lunch…) — configured by admins.
 * Times are display strings ("08:00", "6:30 PM") so the team writes exactly
 * what appears on documents, mirroring how kit figures are stored.
 */
const banquetSessionSchema = new Schema(
  {
    // Each property keeps its own sessions; names are unique within one.
    property: { type: String, enum: PROPERTY_CODES, required: true, default: 'HCP', index: true },
    name: { type: String, required: true, trim: true },
    startTime: { type: String, default: '' },
    endTime: { type: String, default: '' },
    active: { type: Boolean, default: true },
    order: { type: Number, default: 0 },
    // Revenue a sales person should aim for from one function in this
    // session, by how much demand the date has (Banquet Setup → demand dates).
    targets: {
      normal: { type: Number, default: 0, min: 0 },
      high: { type: Number, default: 0, min: 0 },
      peak: { type: Number, default: 0, min: 0 },
    },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true }
);

banquetSessionSchema.index({ property: 1, name: 1 }, { unique: true });

const BanquetSession = model('BanquetSession', banquetSessionSchema);

export default BanquetSession;
