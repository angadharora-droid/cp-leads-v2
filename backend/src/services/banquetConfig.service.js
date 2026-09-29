import mongoose from 'mongoose';

import Venue from '../models/Venue.js';
import BanquetSession from '../models/BanquetSession.js';
import BanquetSettings from '../models/BanquetSettings.js';
import BanquetCatalog from '../models/BanquetCatalog.js';
import Enquiry from '../models/Enquiry.js';
import { AppError } from '../utils/apiResponse.js';
import { writeAudit } from '../utils/audit.js';
import { assertPropertyCode, getProperty, totalRooms } from './property.service.js';

function isValidId(id) {
  return mongoose.Types.ObjectId.isValid(id);
}

/** The group-wide settings document (stage TAT, payment schedule, recipients). */
export async function getSettings() {
  let settings = await BanquetSettings.findOne({ key: 'default' });
  if (!settings) settings = await BanquetSettings.create({ key: 'default' });
  return settings;
}

/** One property's settings document (slot rule, demand dates). */
export async function getPropertySettings(property = 'HCP') {
  const key = assertPropertyCode(property);
  let settings = await BanquetSettings.findOne({ key });
  if (!settings) settings = await BanquetSettings.create({ key });
  return settings;
}

/**
 * Everything a form or report reads as "the settings" for a property: the
 * group-wide values with that property's slot rule and demand dates.
 */
async function mergedSettings(property) {
  const [group, own] = await Promise.all([getSettings(), getPropertySettings(property)]);
  return { ...group.toObject(), slotRule: own.slotRule, demandDates: own.demandDates, property };
}

export async function updateSettings(body, actor, req) {
  const property = body.property || 'HCP';
  const [group, own] = await Promise.all([getSettings(), getPropertySettings(property)]);
  const changed = [];
  if (body.slotRule) {
    own.slotRule = body.slotRule;
    changed.push(`${property} slot rule ${body.slotRule}`);
  }
  if (body.demandDates) {
    own.demandDates = body.demandDates;
    changed.push(`${property} demand dates`);
  }
  if (body.stageTatDays) {
    for (const [stage, days] of Object.entries(body.stageTatDays)) {
      if (days !== undefined) group.stageTatDays[stage] = days;
    }
    changed.push('stage TAT');
  }
  if (body.paymentSchedule) {
    group.paymentSchedule = body.paymentSchedule;
    changed.push('payment schedule');
  }
  own.updatedBy = actor?.id;
  group.updatedBy = actor?.id;
  await Promise.all([own.save(), group.save()]);
  await writeAudit({
    req,
    actor,
    action: 'banquet.settings.update',
    entityType: 'BanquetSettings',
    entityId: own._id,
    summary: `Banquet settings updated: ${changed.join(', ') || 'no change'}`,
  });
  return mergedSettings(property);
}

/** Everything the calendar and the forms need for one property in one call. */
export async function getConfig(property = 'HCP') {
  assertPropertyCode(property);
  const [settings, details, venues, sessions, catalog] = await Promise.all([
    mergedSettings(property),
    getProperty(property),
    Venue.find({ property }).sort({ order: 1, name: 1 }),
    BanquetSession.find({ property }).sort({ order: 1, name: 1 }),
    BanquetCatalog.find({ property }).sort({ kind: 1, order: 1, name: 1 }),
  ]);
  // Grouped by kind so the enquiry form can bind each dropdown directly.
  const byKind = { functionType: [], menuType: [], addOn: [], liquor: [], requirement: [] };
  for (const item of catalog) {
    if (byKind[item.kind]) byKind[item.kind].push(item);
  }
  return {
    property,
    // Enough of the property for the forms: who it is and its room categories.
    propertyInfo: {
      code: details.code,
      name: details.name,
      roomTypes: details.roomTypes || [],
      totalRooms: totalRooms(details),
    },
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
  const existing = await BanquetCatalog.findOne({ property: body.property, kind: body.kind, name: body.name });
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
    summary: `${item.property} ${CATALOG_LABEL[item.kind]} created: ${item.name}`,
  });
  return item;
}

export async function updateCatalogItem(id, body, actor, req) {
  if (!isValidId(id)) throw new AppError('Option not found', 404, 'NOT_FOUND');
  const item = await BanquetCatalog.findById(id);
  if (!item) throw new AppError('Option not found', 404, 'NOT_FOUND');
  if (body.name && body.name !== item.name) {
    const dup = await BanquetCatalog.findOne({
      property: item.property,
      kind: item.kind,
      name: body.name,
      _id: { $ne: item._id },
    });
    if (dup) {
      throw new AppError(`${CATALOG_LABEL[item.kind]} "${body.name}" already exists`, 409, 'DUPLICATE');
    }
  }
  // The kind and the property are fixed once created — an add-on never becomes a menu.
  const { kind, property, ...rest } = body;
  Object.assign(item, rest);
  await item.save();
  await writeAudit({
    req,
    actor,
    action: 'banquet.catalog.update',
    entityType: 'BanquetCatalog',
    entityId: item._id,
    summary: `${item.property} ${CATALOG_LABEL[item.kind]} updated: ${item.name}`,
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
    summary: `${item.property} ${CATALOG_LABEL[item.kind]} deleted: ${item.name}`,
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
  const existing = await Venue.findOne({ property: body.property, name: body.name });
  if (existing) throw new AppError('A venue with this name already exists', 409, 'DUPLICATE');
  const venue = await Venue.create({ ...body, createdBy: actor?.id });
  await writeAudit({
    req,
    actor,
    action: 'banquet.venue.create',
    entityType: 'Venue',
    entityId: venue._id,
    summary: `${venue.property} venue created: ${venue.name}`,
  });
  return venue;
}

export async function updateVenue(id, body, actor, req) {
  if (!isValidId(id)) throw new AppError('Venue not found', 404, 'NOT_FOUND');
  const venue = await Venue.findById(id);
  if (!venue) throw new AppError('Venue not found', 404, 'NOT_FOUND');
  if (body.name && body.name !== venue.name) {
    const dup = await Venue.findOne({ property: venue.property, name: body.name, _id: { $ne: venue._id } });
    if (dup) throw new AppError('A venue with this name already exists', 409, 'DUPLICATE');
  }
  const { property, ...rest } = body;
  Object.assign(venue, rest);
  await venue.save();
  await writeAudit({
    req,
    actor,
    action: 'banquet.venue.update',
    entityType: 'Venue',
    entityId: venue._id,
    summary: `${venue.property} venue updated: ${venue.name}`,
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
    summary: `${venue.property} venue deleted: ${venue.name}`,
  });
  return { deleted: true };
}

/* -------------------------------- Sessions -------------------------------- */

export async function createSession(body, actor, req) {
  const existing = await BanquetSession.findOne({ property: body.property, name: body.name });
  if (existing) throw new AppError('A session with this name already exists', 409, 'DUPLICATE');
  const session = await BanquetSession.create({ ...body, createdBy: actor?.id });
  await writeAudit({
    req,
    actor,
    action: 'banquet.session.create',
    entityType: 'BanquetSession',
    entityId: session._id,
    summary: `${session.property} session created: ${session.name}`,
  });
  return session;
}

export async function updateSession(id, body, actor, req) {
  if (!isValidId(id)) throw new AppError('Session not found', 404, 'NOT_FOUND');
  const session = await BanquetSession.findById(id);
  if (!session) throw new AppError('Session not found', 404, 'NOT_FOUND');
  if (body.name && body.name !== session.name) {
    const dup = await BanquetSession.findOne({ property: session.property, name: body.name, _id: { $ne: session._id } });
    if (dup) throw new AppError('A session with this name already exists', 409, 'DUPLICATE');
  }
  const { targets, property, ...rest } = body;
  Object.assign(session, rest);
  if (targets) {
    for (const [level, amount] of Object.entries(targets)) {
      if (amount !== undefined) session.targets[level] = amount;
    }
  }
  await session.save();
  await writeAudit({
    req,
    actor,
    action: 'banquet.session.update',
    entityType: 'BanquetSession',
    entityId: session._id,
    summary: `${session.property} session updated: ${session.name}`,
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
    summary: `${session.property} session deleted: ${session.name}`,
  });
  return { deleted: true };
}

/* ------------------------- Copy between properties ------------------------ */

// What can be copied, and the fields that travel with each entry.
const COPY_PARTS = {
  venues: { model: Venue, fields: ['hallCharge', 'active', 'order'] },
  sessions: { model: BanquetSession, fields: ['startTime', 'endTime', 'targets', 'active', 'order'] },
  functionType: { model: BanquetCatalog, kind: 'functionType', fields: ['rate', 'pricing', 'notes', 'courses', 'active', 'order'] },
  menuType: { model: BanquetCatalog, kind: 'menuType', fields: ['rate', 'pricing', 'notes', 'courses', 'active', 'order'] },
  addOn: { model: BanquetCatalog, kind: 'addOn', fields: ['rate', 'pricing', 'notes', 'courses', 'active', 'order'] },
  requirement: { model: BanquetCatalog, kind: 'requirement', fields: ['rate', 'pricing', 'notes', 'courses', 'active', 'order'] },
  liquor: { model: BanquetCatalog, kind: 'liquor', fields: ['rate', 'pricing', 'notes', 'courses', 'active', 'order'] },
};

/**
 * Copies one property's Banquet Setup into others, for entries every hotel
 * shares. An entry is matched by name: one the target lacks is added; one
 * it already has is left alone unless `overwrite`, which brings its rate,
 * times and status in line. Nothing is ever deleted, and the copies are
 * independent — a later change in the source does not follow them.
 * `rules` copies the slot rule and demand dates.
 */
export async function copySetup(body, actor, req) {
  const { from, to, parts, overwrite = false } = body;
  const targets = [...new Set(to)].filter((code) => code !== from);
  if (!targets.length) throw new AppError('Pick at least one other property to copy to', 422, 'NO_TARGET');
  const result = {};
  for (const target of targets) {
    const counts = { added: 0, updated: 0, unchanged: 0 };
    for (const part of parts.filter((p) => COPY_PARTS[p])) {
      const { model, kind, fields } = COPY_PARTS[part];
      const scope = kind ? { kind } : {};
      const source = await model.find({ property: from, ...scope }).lean();
      for (const item of source) {
        const values = Object.fromEntries(fields.filter((f) => item[f] !== undefined).map((f) => [f, item[f]]));
        const existing = await model.findOne({ property: target, ...scope, name: item.name });
        if (!existing) {
          await model.create({ property: target, ...scope, name: item.name, ...values, createdBy: actor?.id });
          counts.added += 1;
        } else if (overwrite) {
          Object.assign(existing, values);
          await existing.save();
          counts.updated += 1;
        } else {
          counts.unchanged += 1;
        }
      }
    }
    if (parts.includes('rules')) {
      const [own, theirs] = await Promise.all([getPropertySettings(from), getPropertySettings(target)]);
      theirs.slotRule = own.slotRule;
      theirs.demandDates = own.demandDates.map((d) => ({ from: d.from, to: d.to, level: d.level, note: d.note }));
      theirs.updatedBy = actor?.id;
      await theirs.save();
    }
    result[target] = counts;
  }
  await writeAudit({
    req,
    actor,
    action: 'banquet.setup.copy',
    entityType: 'BanquetSettings',
    summary: `Banquet Setup copied from ${from} to ${targets.join(', ')} (${parts.join(', ')})${overwrite ? ', existing entries updated' : ''}: ${targets
      .map((t) => `${t} +${result[t].added}${overwrite ? ` ~${result[t].updated}` : ''}`)
      .join(', ')}`,
  });
  return { from, result };
}

export default {
  getSettings,
  getPropertySettings,
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
  copySetup,
};
