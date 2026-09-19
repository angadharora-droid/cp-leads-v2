import mongoose from 'mongoose';

const { Schema, model } = mongoose;

/**
 * Every dropdown on the banquet function form is driven from here, so the
 * sales team can only pick options an admin configured in Banquet Setup:
 *
 *   functionType — Wedding, Conference, Birthday…
 *   menuType     — Silver Veg, Gold Non-Veg… (carries the per-pax rate)
 *   addOn        — Live counter, Welcome drinks… (adds to the per-pax rate)
 *   liquor       — IMFL package, Corkage… (adds to the rate)
 *   requirement  — Stage, LED wall, DJ… (adds to the rate)
 *
 * `rate` is the money attached to the option: per guest by default, or a flat
 * amount for the whole function when `pricing` is 'flat'. Function types
 * carry no rate.
 */
export const CATALOG_KINDS = ['functionType', 'menuType', 'addOn', 'liquor', 'requirement'];

export const CATALOG_PRICING = ['per_pax', 'flat'];

const banquetCatalogSchema = new Schema(
  {
    kind: { type: String, enum: CATALOG_KINDS, required: true, index: true },
    name: { type: String, required: true, trim: true },
    rate: { type: Number, default: 0, min: 0 },
    pricing: { type: String, enum: CATALOG_PRICING, default: 'per_pax' },
    notes: { type: String, default: '', trim: true },
    // Menu packages only: the courses the package is made of, in order
    // (Welcome Drinks, Starters, Soups, Salads, Main Course, Desserts...).
    // A Function Prospectus lists its dishes under exactly these courses.
    courses: { type: [String], default: [] },
    active: { type: Boolean, default: true },
    order: { type: Number, default: 0 },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true }
);

// One name per kind — "Gold" may exist as both a menu and an add-on.
banquetCatalogSchema.index({ kind: 1, name: 1 }, { unique: true });

const BanquetCatalog = model('BanquetCatalog', banquetCatalogSchema);

export default BanquetCatalog;
