/**
 * Makes Banquet Setup match the hotel's real configuration:
 *
 *   node scripts/apply-banquet-catalog.mjs            # against MONGODB_URI in .env
 *   MONGODB_URI=... node scripts/apply-banquet-catalog.mjs
 *
 * Venues, sessions and catalog options from banquet-catalog.mjs are created
 * or updated (name, rate, pricing, notes, order — and re-activated). Anything
 * else in Banquet Setup — the earlier mock data — is deactivated, not deleted,
 * so enquiries that already reference it still display. Add --delete-unused to
 * remove deactivated options that no enquiry references.
 *
 * Leads and enquiries are untouched; this never adds demo data.
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
process.chdir(path.join(here, '..'));

const mongoose = (await import('mongoose')).default;
const { connectDB } = await import('../src/config/db.js');
const User = (await import('../src/models/User.js')).default;
const Venue = (await import('../src/models/Venue.js')).default;
const BanquetSession = (await import('../src/models/BanquetSession.js')).default;
const BanquetCatalog = (await import('../src/models/BanquetCatalog.js')).default;
const Enquiry = (await import('../src/models/Enquiry.js')).default;
const { VENUES, SESSIONS, CATALOG } = await import('./banquet-catalog.mjs');

const deleteUnused = process.argv.includes('--delete-unused');
const log = (...args) => console.log('[catalog]', ...args);

await connectDB();
const admin = await User.findOne({ role: 'admin' });
const createdBy = admin?._id;

/* --------------------------------- Venues ---------------------------------- */
let venuesUpserted = 0;
for (const [i, name] of VENUES.entries()) {
  const res = await Venue.updateOne(
    { name },
    { $set: { name, active: true, order: i + 1 }, $setOnInsert: { createdBy } },
    { upsert: true }
  );
  venuesUpserted += res.upsertedCount ? 1 : 0;
}
const staleVenues = await Venue.updateMany({ name: { $nin: VENUES }, active: { $ne: false } }, { $set: { active: false } });
log(`venues: ${VENUES.length} kept/updated (${venuesUpserted} new), ${staleVenues.modifiedCount} deactivated`);

/* -------------------------------- Sessions --------------------------------- */
let sessionsUpserted = 0;
for (const session of SESSIONS) {
  const res = await BanquetSession.updateOne(
    { name: session.name },
    { $set: { ...session, active: true }, $setOnInsert: { createdBy } },
    { upsert: true }
  );
  sessionsUpserted += res.upsertedCount ? 1 : 0;
}
const staleSessions = await BanquetSession.updateMany(
  { name: { $nin: SESSIONS.map((s) => s.name) }, active: { $ne: false } },
  { $set: { active: false } }
);
log(`sessions: ${SESSIONS.length} kept/updated (${sessionsUpserted} new), ${staleSessions.modifiedCount} deactivated`);

/* --------------------------------- Catalog --------------------------------- */
let catalogUpserted = 0;
for (const item of CATALOG) {
  const res = await BanquetCatalog.updateOne(
    { kind: item.kind, name: item.name },
    {
      $set: {
        rate: item.rate || 0,
        pricing: item.pricing || 'per_pax',
        notes: item.notes || '',
        courses: item.courses || [],
        order: item.order || 0,
        active: true,
      },
      $setOnInsert: { createdBy },
    },
    { upsert: true }
  );
  catalogUpserted += res.upsertedCount ? 1 : 0;
}
const keep = CATALOG.map((c) => ({ kind: c.kind, name: c.name }));
const stale = await BanquetCatalog.find({ $nor: keep.map((k) => ({ kind: k.kind, name: k.name })) });
let deactivated = 0;
let deleted = 0;
for (const item of stale) {
  if (deleteUnused) {
    const used = await Enquiry.exists({
      $or: [
        { 'functions.functionType': item._id },
        { 'functions.menuType': item._id },
        { 'functions.addOns': item._id },
        { 'functions.liquor': item._id },
        { 'functions.requirements': item._id },
      ],
    });
    if (!used) {
      await item.deleteOne();
      deleted += 1;
      continue;
    }
  }
  if (item.active !== false) {
    item.active = false;
    await item.save();
    deactivated += 1;
  }
}
log(
  `catalog: ${CATALOG.length} kept/updated (${catalogUpserted} new), ${deactivated} mock options deactivated${
    deleteUnused ? `, ${deleted} unused deleted` : ''
  }`
);
if (stale.length && !deleteUnused) {
  log('deactivated (still shown on old enquiries):', stale.map((s) => `${s.kind}:${s.name}`).join(', '));
}

await mongoose.disconnect();
process.exit(0);
