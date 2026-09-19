import mongoose from 'mongoose';

const { Schema, model } = mongoose;

/** Banquet venue/hall — configured by admins in Banquet Setup. */
const venueSchema = new Schema(
  {
    name: { type: String, required: true, trim: true },
    // Hall charge for this room, a flat amount for the whole function. It is
    // only charged on an enquiry where the team ticks it.
    hallCharge: { type: Number, default: 0, min: 0 },
    active: { type: Boolean, default: true },
    order: { type: Number, default: 0 },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true }
);

venueSchema.index({ name: 1 }, { unique: true });

const Venue = model('Venue', venueSchema);

export default Venue;
