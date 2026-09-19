import mongoose from 'mongoose';

import Venue from '../models/Venue.js';
import BanquetSession from '../models/BanquetSession.js';
import BanquetSettings from '../models/BanquetSettings.js';
import BanquetCatalog from '../models/BanquetCatalog.js';
import Enquiry from '../models/Enquiry.js';
import { AppError } from '../utils/apiResponse.js';
import { writeAudit } from '../utils/audit.js';

const DEFAULT_SESSIONS = [
  { name: 'Morning', startTime: '08:00 AM', endTime: '12:00 PM', order: 1 },
  { name: 'Afternoon', startTime: '12:30 PM', endTime: '04:30 PM', order: 2 },
  { name: 'Evening', startTime: '06:00 PM', endTime: '11:00 PM', order: 3 },
];

function isValidId(id) {
  return mongoose.Types.ObjectId.isValid(id);
}

/** Loads (and lazily creates) the singleton settings doc, seeding default sessions once. */
export async function getSettings() {
  let settings = await BanquetSettings.findOne({ key: 'default' });
  if (!settings) settings = await BanquetSettings.create({});
  if (!settings.sessionsSeeded) {
    const count = await BanquetSession.countDocuments();
    if (count === 0) await BanquetSession.insertMany(DEFAULT_SESSIONS);
    settings.sessionsSeeded = true;
    await settings.save();
  }
  return settings;
}

export async function updateSettings(body, actor, req) {
  const settings = await getSettings();
  if (body.slotRule) settings.slotRule = body.slotRule;
  settings.updatedBy = actor?.id;
  await settings.save();
  await writeAudit({
    req,
    actor,
    action: 'banquet.settings.update',
    entityType: 'BanquetSettings',
    entityId: settings._id,
    summary: `Slot rule set to ${settings.slotRule}`,
  });
  return settings;
}

/** Everything the calendar/forms need in one call. */
export async function getConfig() {
  const settings = await getSettings();
  const [venues, sessions, catalog] = await Promise.all([
    Venue.find().sort({ order: 1, name: 1 }),
    BanquetSession.find().sort({ order: 1, name: 1 }),
    BanquetCatalog.find().sort({ kind: 1, order: 1, name: 1 }),
  ]);
  // Grouped by kind so the enquiry form can bind each dropdown directly.
  const byKind = { functionType: [], menuType: [], addOn: [], liquor: [], requirement: [] };
  for (const item of catalog) {
    if (byKind[item.kind]) byKind[item.kind].push(item);
  }
  return {
    settings,
    venues,
    sessions,
    functionTypes: byKind.functionType,
    menuTypes: byKind.menuType,
    addOns: byKind.addOn,
    liquorOptions: byKind.liquor,
    requirements: byKind.requirement,
  };
}

/* -------------------------------- Catalog --------------------------------- */
// Function types, menu types, add-on menus and liquor packages — the four
// dropdowns on the banquet function form.

const CATALOG_LABEL = {
  functionType: 'Function type',
  menuType: 'Menu type',
  addOn: 'Add-on menu',
  liquor: 'Liquor option',
  requirement: 'Additional requirement',
};

/** Which stored field an enquiry uses for each catalog kind. */
const CATALOG_USAGE_FIELD = {
  functionType: 'functions.functionType',
  menuType: 'functions.menuType',
  addOn: 'functions.addOns',
  liquor: 'functions.liquor',
  requirement: 'functions.requirements',
};

export async function createCatalogItem(body, actor, req) {
  const existing = await BanquetCatalog.findOne({ kind: body.kind, name: body.name });
  if (existing) {
    throw new AppError(`${CATALOG_LABEL[body.kind]} "${body.name}" already exists`, 409, 'DUPLICATE');
  }
  const item = await BanquetCatalog.create({ ...body, createdBy: actor?.id });
  await writeAudit({
    req,
    actor,
    action: 'banquet.catalog.create',
    entityType: 'BanquetCatalog',
    entityId: item._id,
    summary: `${CATALOG_LABEL[item.kind]} created: ${item.name}`,
  });
  return item;
}

export async function updateCatalogItem(id, body, actor, req) {
  if (!isValidId(id)) throw new AppError('Option not found', 404, 'NOT_FOUND');
  const item = await BanquetCatalog.findById(id);
  if (!item) throw new AppError('Option not found', 404, 'NOT_FOUND');
  if (body.name && body.name !== item.name) {
    const dup = await BanquetCatalog.findOne({
      kind: item.kind,
      name: body.name,
      _id: { $ne: item._id },
    });
    if (dup) {
      throw new AppError(`${CATALOG_LABEL[item.kind]} "${body.name}" already exists`, 409, 'DUPLICATE');
    }
  }
  // The kind is fixed once created — an add-on never becomes a menu.
  const { kind, ...rest } = body;
  Object.assign(item, rest);
  await item.save();
  await writeAudit({
    req,
    actor,
    action: 'banquet.catalog.update',
    entityType: 'BanquetCatalog',
    entityId: item._id,
    summary: `${CATALOG_LABEL[item.kind]} updated: ${item.name}`,
  });
  return item;
}

export async function deleteCatalogItem(id, actor, req) {
  if (!isValidId(id)) throw new AppError('Option not found', 404, 'NOT_FOUND');
  const item = await BanquetCatalog.findById(id);
  if (!item) throw new AppError('Option not found', 404, 'NOT_FOUND');
  const field = CATALOG_USAGE_FIELD[item.kind];
  const used = field ? await Enquiry.countDocuments({ [field]: item._id }) : 0;
  if (used > 0) {
    throw new AppError(
      `"${item.name}" is used by ${used} enquir${used === 1 ? 'y' : 'ies'} — deactivate it instead of deleting.`,
      409,
      'CATALOG_IN_USE'
    );
  }
  await item.deleteOne();
  await writeAudit({
    req,
    actor,
    action: 'banquet.catalog.delete',
    entityType: 'BanquetCatalog',
    entityId: id,
    summary: `${CATALOG_LABEL[item.kind]} deleted: ${item.name}`,
  });
  return { deleted: true };
}

/* --------------------------------- Venues --------------------------------- */

/**
 * Why a venue or session cannot be deleted: the enquiries still holding it,
 * by lead and stage, so the team knows what to look at.
 */
async function inUseMessage(what, filter) {
  const holders = await Enquiry.find(filter)
    .select('stage lead')
    .sort({ updatedAt: -1 })
    .limit(50)
    .populate('lead', 'businessName');
  if (!holders.length) return '';
  const names = holders.slice(0, 3).map((e) => `${e.lead?.businessName || 'an enquiry'} (${e.stage})`);
  const more = holders.length > 3 ? ` and ${holders.length - 3} more` : '';
  return `This ${what} is used by ${holders.length} enquir${holders.length === 1 ? 'y' : 'ies'}: ${names.join(', ')}${more}. Deactivate it instead of deleting.`;
}

export async function createVenue(body, actor, req) {
  const existing = await Venue.findOne({ name: body.name });
  if (existing) throw new AppError('A venue with this name already exists', 409, 'DUPLICATE');
  const venue = await Venue.create({ ...body, createdBy: actor?.id });
  await writeAudit({
    req,
    actor,
    action: 'banquet.venue.create',
    entityType: 'Venue',
    entityId: venue._id,
    summary: `Venue created: ${venue.name}`,
  });
  return venue;
}

export async function updateVenue(id, body, actor, req) {
  if (!isValidId(id)) throw new AppError('Venue not found', 404, 'NOT_FOUND');
  const venue = await Venue.findById(id);
  if (!venue) throw new AppError('Venue not found', 404, 'NOT_FOUND');
  if (body.name && body.name !== venue.name) {
    const dup = await Venue.findOne({ name: body.name, _id: { $ne: venue._id } });
    if (dup) throw new AppError('A venue with this name already exists', 409, 'DUPLICATE');
  }
  Object.assign(venue, body);
  await venue.save();
  await writeAudit({
    req,
    actor,
    action: 'banquet.venue.update',
    entityType: 'Venue',
    entityId: venue._id,
    summary: `Venue updated: ${venue.name}`,
  });
  return venue;
}

export async function deleteVenue(id, actor, req) {
  if (!isValidId(id)) throw new AppError('Venue not found', 404, 'NOT_FOUND');
  const inUse = await inUseMessage('venue', {
    $or: [{ 'functions.venues': id }, { 'functions.venue': id }, { 'functions.addOnRooms': id }],
  });
  if (inUse) throw new AppError(inUse, 409, 'VENUE_IN_USE');
  const venue = await Venue.findByIdAndDelete(id);
  if (!venue) throw new AppError('Venue not found', 404, 'NOT_FOUND');
  await writeAudit({
    req,
    actor,
    action: 'banquet.venue.delete',
    entityType: 'Venue',
    entityId: id,
    summary: `Venue deleted: ${venue.name}`,
  });
  return { deleted: true };
}

/* -------------------------------- Sessions -------------------------------- */

export async function createSession(body, actor, req) {
  const existing = await BanquetSession.findOne({ name: body.name });
  if (existing) throw new AppError('A session with this name already exists', 409, 'DUPLICATE');
  const session = await BanquetSession.create({ ...body, createdBy: actor?.id });
  await writeAudit({
    req,
    actor,
    action: 'banquet.session.create',
    entityType: 'BanquetSession',
    entityId: session._id,
    summary: `Session created: ${session.name}`,
  });
  return session;
}

export async function updateSession(id, body, actor, req) {
  if (!isValidId(id)) throw new AppError('Session not found', 404, 'NOT_FOUND');
  const session = await BanquetSession.findById(id);
  if (!session) throw new AppError('Session not found', 404, 'NOT_FOUND');
  if (body.name && body.name !== session.name) {
    const dup = await BanquetSession.findOne({ name: body.name, _id: { $ne: session._id } });
    if (dup) throw new AppError('A session with this name already exists', 409, 'DUPLICATE');
  }
  Object.assign(session, body);
  await session.save();
  await writeAudit({
    req,
    actor,
    action: 'banquet.session.update',
    entityType: 'BanquetSession',
    entityId: session._id,
    summary: `Session updated: ${session.name}`,
  });
  return session;
}

export async function deleteSession(id, actor, req) {
  if (!isValidId(id)) throw new AppError('Session not found', 404, 'NOT_FOUND');
  const inUse = await inUseMessage('session', {
    $or: [{ 'functions.sessions': id }, { 'functions.session': id }],
  });
  if (inUse) throw new AppError(inUse, 409, 'SESSION_IN_USE');
  const session = await BanquetSession.findByIdAndDelete(id);
  if (!session) throw new AppError('Session not found', 404, 'NOT_FOUND');
  await writeAudit({
    req,
    actor,
    action: 'banquet.session.delete',
    entityType: 'BanquetSession',
    entityId: id,
    summary: `Session deleted: ${session.name}`,
  });
  return { deleted: true };
}

export default {
  getSettings,
  updateSettings,
  getConfig,
  createCatalogItem,
  updateCatalogItem,
  deleteCatalogItem,
  createVenue,
  updateVenue,
  deleteVenue,
  createSession,
  updateSession,
  deleteSession,
};
