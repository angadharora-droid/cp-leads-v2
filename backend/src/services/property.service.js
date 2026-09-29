import Property, { PROPERTY_CODES } from '../models/Property.js';
import Venue from '../models/Venue.js';
import BanquetSession from '../models/BanquetSession.js';
import BanquetCatalog from '../models/BanquetCatalog.js';
import BanquetSettings from '../models/BanquetSettings.js';
import Enquiry from '../models/Enquiry.js';
import { AppError } from '../utils/apiResponse.js';
import { writeAudit } from '../utils/audit.js';

/** CPA's room categories as the user gave them (2026-09-29): 62 rooms in all. */
const CPA_ROOM_TYPES = [
  { name: 'Executive', count: 6 },
  { name: 'Premium', count: 46 },
  { name: 'Family Premium', count: 6 },
  { name: 'Club', count: 3 },
  { name: 'Deluxe Suite', count: 1 },
];

// What each property starts with. HCP's lines are the ones the client
// documents printed before there were several properties.
const DEFAULTS = {
  HCP: {
    order: 1,
    name: 'Hotel Centre Point Nagpur',
    shortName: 'Hotel Centre Point',
    unitOf: 'hotel Amarjit PVT LTD',
    address: '24, central Bazar road, Ramdaspeth, Nagpur - 440 010 INDIA',
    registeredOffice: '24, CB Road, Ramdaspeth, Nagpur',
    phone: '+91 92669 23456',
    email: 'info.nagpur@cpgh.in',
    udyam: 'UDYAM-MH-20-0004691',
    vatTin: '27550004350V',
    cin: 'U55200MH1986PTC041369',
    pan: 'AAACH4474J',
    gstin: '27AAACH4474J1ZE',
    fssai: '11514055000224',
    bank: {
      bankName: 'HDFC BANK LTD',
      accountName: 'HOTEL AMARJIT PVT. LTD.',
      accountNumber: '50200013055259',
      accountType: 'CURRENT ACCOUNT',
      branchAddress: '9, HINDUSTAN COLONY, NEAR SAI MANDIR, CHAWLA PALACE,\nWARDHA ROAD, NAGPUR- 440015',
    },
  },
  CPA: { order: 2, roomTypes: CPA_ROOM_TYPES },
  CPNM: { order: 3 },
};

export function assertPropertyCode(code) {
  if (!PROPERTY_CODES.includes(code)) {
    throw new AppError(`Unknown property "${code}"`, 422, 'BAD_PROPERTY');
  }
  return code;
}

/**
 * Creates any property that does not exist yet, with its starting details,
 * and gives existing ones any starting detail added since (a field they
 * have never had — a value an admin cleared stays cleared).
 */
let ensured = null;

export function ensureProperties() {
  // Once per process; a failed attempt is retried on the next call.
  ensured ??= (async () => {
    await Promise.all(
      PROPERTY_CODES.map((code) =>
        Property.updateOne({ code }, { $setOnInsert: { code, ...DEFAULTS[code] } }, { upsert: true })
      )
    );
    await Promise.all(
      PROPERTY_CODES.flatMap((code) =>
        Object.entries(DEFAULTS[code]).map(([field, value]) =>
          Property.updateOne({ code, [field]: { $exists: false } }, { $set: { [field]: value } })
        )
      )
    );
  })().catch((err) => {
    ensured = null;
    throw err;
  });
  return ensured;
}

export async function listProperties() {
  await ensureProperties();
  return Property.find().sort({ order: 1, code: 1 }).lean();
}

/** One property's details (as a plain object); unknown codes are refused. */
export async function getProperty(code) {
  assertPropertyCode(code);
  let property = await Property.findOne({ code }).lean();
  if (!property) {
    await ensureProperties();
    property = await Property.findOne({ code }).lean();
  }
  return property;
}

/** "CPA — Centre Point Amravati", or just the code until a name is set. */
export function propertyLabel(property) {
  if (!property) return '';
  return property.name ? `${property.code} — ${property.name}` : property.code;
}

/**
 * The client documents need at least the name and address; a property
 * that has not been filled in yet must not print another hotel's details.
 */
export function assertPrintable(property) {
  if (!property?.name || !property?.address) {
    throw new AppError(
      `Fill in ${property?.code || 'the property'}'s name and address under Banquet Setup → Property details before generating documents`,
      422,
      'PROPERTY_INCOMPLETE'
    );
  }
}

export async function updateProperty(code, body, actor, req) {
  const property = await Property.findOne({ code: assertPropertyCode(code) });
  if (!property) throw new AppError('Property not found', 404, 'NOT_FOUND');
  const { bank, roomTypes, ...rest } = body;
  Object.assign(property, rest);
  if (bank) property.bank = { ...(property.bank?.toObject?.() || {}), ...bank };
  if (roomTypes) {
    const names = new Set();
    for (const t of roomTypes) {
      const key = t.name.toLowerCase();
      if (names.has(key)) throw new AppError(`Room category "${t.name}" is listed twice`, 422, 'DUPLICATE');
      names.add(key);
    }
    // A category keeps its id so enquiries holding it still count against it.
    property.roomTypes = roomTypes.map((t) => (t._id ? { _id: t._id, name: t.name, count: t.count } : { name: t.name, count: t.count }));
  }
  property.updatedBy = actor?.id;
  await property.save();
  await writeAudit({
    req,
    actor,
    action: 'property.update',
    entityType: 'Property',
    entityId: property._id,
    summary: `Property details updated: ${code}${roomTypes ? ` (${totalRooms(property)} rooms)` : ''}`,
  });
  return property;
}

/** All the rooms a property has, across its categories. */
export function totalRooms(property) {
  return (property?.roomTypes || []).reduce((sum, t) => sum + (Number(t.count) || 0), 0);
}

/* ------------------------------- Migration -------------------------------- */

// Unique indexes from before properties existed: a name was unique across
// the whole hotel group; now it is unique within its property.
const LEGACY_INDEXES = [
  [Venue, 'name_1'],
  [BanquetSession, 'name_1'],
  [BanquetCatalog, 'kind_1_name_1'],
];

/**
 * Brings a database from before properties up to date, once, at start-up:
 * the properties exist, everything without a property belongs to HCP, the
 * old group-wide unique indexes are gone and HCP has its own settings.
 */
export async function migrateToProperties() {
  await ensureProperties();
  for (const M of [Venue, BanquetSession, BanquetCatalog, Enquiry]) {
    await M.updateMany({ property: { $exists: false } }, { $set: { property: 'HCP' } });
  }
  for (const [M, name] of LEGACY_INDEXES) {
    try {
      const indexes = await M.collection.indexes();
      if (indexes.some((ix) => ix.name === name)) await M.collection.dropIndex(name);
    } catch {
      // The collection does not exist yet — nothing to drop.
    }
  }
  await Promise.all([Venue.syncIndexes(), BanquetSession.syncIndexes(), BanquetCatalog.syncIndexes()]);
  // The slot rule and demand dates used to be group-wide; they become HCP's.
  const hcp = await BanquetSettings.findOne({ key: 'HCP' });
  if (!hcp) {
    const old = await BanquetSettings.findOne({ key: 'default' }).lean();
    await BanquetSettings.create({
      key: 'HCP',
      ...(old ? { slotRule: old.slotRule, demandDates: old.demandDates || [] } : {}),
    });
  }
}

export default {
  assertPropertyCode,
  ensureProperties,
  listProperties,
  getProperty,
  propertyLabel,
  assertPrintable,
  updateProperty,
  totalRooms,
  migrateToProperties,
};
