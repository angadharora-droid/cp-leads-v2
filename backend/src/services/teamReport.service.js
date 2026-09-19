import mongoose from 'mongoose';
import ExcelJS from 'exceljs';

import Enquiry from '../models/Enquiry.js';
import Lead from '../models/Lead.js';
import User from '../models/User.js';
import AuditLog from '../models/AuditLog.js';
import FunctionProspectus from '../models/FunctionProspectus.js';
import BanquetEstimate from '../models/BanquetEstimate.js';

/*
 * Management reports (admins and managers only):
 *
 *   Executive performance  — what each executive's leads produced in the
 *                            period: leads, enquiries, proposals and contracts
 *                            sent, won / lost / cancelled, conversion, days
 *                            to win, advance collected, and the open pipeline.
 *   Executive productivity — what each person did in the period: visits,
 *                            follow-ups, action points, emails, sheets made,
 *                            actions logged and the days they were active.
 *   Pipeline ageing        — every open enquiry with the days it has sat in
 *                            its stage, flagged once past the stage's limit.
 *   Audit report           — the audit log of the period, by user, by area
 *                            and by day, with the detail rows.
 *
 * Performance is credited to the executive the lead is assigned to;
 * productivity to the person who did the work. Money is the proposed rate.
 */

const OPEN_STAGES = ['enquiry', 'proposal', 'waitlist', 'provisional'];
const STAGE_LABELS = {
  enquiry: 'Enquiry',
  proposal: 'Proposal',
  waitlist: 'Waitlist',
  provisional: 'Provisional',
  won: 'Won',
  lost: 'Lost',
  cancelled: 'Cancelled',
};
// Days an enquiry may sit in a stage before it counts as stuck.
const STAGE_LIMIT_DAYS = { enquiry: 3, proposal: 7, waitlist: 14, provisional: 7 };
const DAY = 24 * 60 * 60 * 1000;
const AUDIT_ROW_LIMIT = 2000;
const UNASSIGNED = 'unassigned';

/* --------------------------------- Helpers --------------------------------- */

function isValidId(id) {
  return mongoose.Types.ObjectId.isValid(id);
}

function dayStart(value) {
  const d = new Date(value);
  d.setHours(0, 0, 0, 0);
  return d;
}

function dayEnd(value) {
  const d = new Date(value);
  d.setHours(23, 59, 59, 999);
  return d;
}

/** The reporting period: the dates given, else the last 30 days. */
function periodOf(filters) {
  const to = filters.to ? dayEnd(filters.to) : dayEnd(new Date());
  const from = filters.from ? dayStart(filters.from) : dayStart(new Date(to.getTime() - 29 * DAY));
  return { from, to };
}

function parseAmount(value) {
  const match = String(value || '').replace(/,/g, '').match(/\d+(?:\.\d+)?/);
  return match ? Number(match[0]) : 0;
}

/** A proposed rate of 0 with no offered line rates means "never set": the rack rate stands. */
function functionValue(fn) {
  const proposed = Number(fn.proposedRate) || 0;
  if (proposed > 0 || fn.lineRates?.length) return proposed;
  return Number(fn.rackRate) || 0;
}

function enquiryValue(enquiry) {
  return (enquiry.functions || []).reduce((sum, fn) => sum + functionValue(fn), 0);
}

function percent(part, whole) {
  return whole ? Math.round((part / whole) * 1000) / 10 : 0;
}

function average(values) {
  return values.length ? Math.round((values.reduce((a, b) => a + b, 0) / values.length) * 10) / 10 : 0;
}

/** When the enquiry entered the stage it is in now (the start of its latest run in that stage). */
function enteredCurrentStage(enquiry) {
  if (enquiry.stage === 'waitlist' && enquiry.waitlist?.since) return new Date(enquiry.waitlist.since);
  const history = [...(enquiry.stageHistory || [])].sort((a, b) => new Date(a.at) - new Date(b.at));
  let entered = null;
  for (let i = history.length - 1; i >= 0; i -= 1) {
    if (history[i].stage !== enquiry.stage) break;
    entered = history[i].at;
  }
  return new Date(entered || enquiry.createdAt);
}

/** The area of the app an audit action belongs to. */
function auditArea(log) {
  const action = String(log.action || '');
  if (action.startsWith('enquiry.')) return 'Enquiries';
  if (action.startsWith('prospectus.')) return 'Function prospectus';
  if (action.startsWith('estimate.')) return 'Banquet estimate';
  if (action.startsWith('kit.')) return 'Kits and rate contracts';
  if (action.startsWith('arc.')) return 'Rate contracts';
  if (action.startsWith('banquet.')) return 'Banquet setup';
  if (/^(lead|note|follow_up|visit_report|instruction|action_point)/.test(action)) return 'Leads';
  if (/^(user|login|logout|password|token)/.test(action)) return 'Users and sign-in';
  return log.entityType || 'Other';
}

/** "follow_up_closed" / "enquiry.proposal.email" as words. */
function actionLabel(action) {
  const words = String(action || '').replace(/[._]+/g, ' ').trim();
  return words ? words.charAt(0).toUpperCase() + words.slice(1) : '';
}

/* --------------------------------- Report ---------------------------------- */

/**
 * @param {{from?: string, to?: string, executive?: string}} filters
 */
export async function getTeamReport(filters = {}) {
  const { from, to } = periodOf(filters);
  const inPeriod = (date) => {
    if (!date) return false;
    const t = new Date(date).getTime();
    return t >= from.getTime() && t <= to.getTime();
  };
  const only = filters.executive && isValidId(filters.executive) ? String(filters.executive) : '';
  const now = new Date();
  const today = dayStart(now);

  const [users, leads, enquiries, logs, sheets, estimates] = await Promise.all([
    User.find().select('name email role isActive').sort({ name: 1 }).lean(),
    Lead.find().select('businessName reference assignedTo createdAt followUps actionPoints visitReports').lean(),
    Enquiry.find()
      .select('lead stage stageHistory functions.proposedRate functions.rackRate functions.lineRates functions.date functions.pax proposal contract advance won lostAt cancellation waitlist emails contactName createdAt')
      .populate({ path: 'lead', select: 'businessName reference assignedTo' })
      .lean(),
    AuditLog.find({ createdAt: { $gte: from, $lte: to } }).sort({ createdAt: -1 }).populate('actor', 'name').lean(),
    FunctionProspectus.find({ createdAt: { $gte: from, $lte: to } }).select('madeBy').lean(),
    BanquetEstimate.find({ createdAt: { $gte: from, $lte: to } }).select('madeBy').lean(),
  ]);

  const userName = new Map(users.map((u) => [String(u._id), u.name]));
  const nameOf = (id) => (id === UNASSIGNED ? 'Unassigned' : userName.get(String(id)) || 'Former user');
  const keyOf = (id) => (id ? String(id) : UNASSIGNED);
  const wanted = (key) => !only || key === only;

  /* ------------------------------ Performance ------------------------------ */
  const perf = new Map();
  const perfRow = (key) => {
    if (!perf.has(key)) {
      perf.set(key, {
        executiveId: key,
        executive: nameOf(key),
        leadsAdded: 0,
        enquiries: 0,
        proposalsSent: 0,
        contractsSent: 0,
        won: 0,
        wonValue: 0,
        lost: 0,
        cancelled: 0,
        advanceCollected: 0,
        openEnquiries: 0,
        openValue: 0,
        daysToWin: [],
      });
    }
    return perf.get(key);
  };

  for (const lead of leads) {
    const key = keyOf(lead.assignedTo);
    if (!wanted(key)) continue;
    const row = perfRow(key);
    if (inPeriod(lead.createdAt)) row.leadsAdded += 1;
  }
  for (const enquiry of enquiries) {
    const key = keyOf(enquiry.lead?.assignedTo);
    if (!wanted(key)) continue;
    const row = perfRow(key);
    const value = enquiryValue(enquiry);
    if (inPeriod(enquiry.createdAt)) row.enquiries += 1;
    if (inPeriod(enquiry.proposal?.sentAt)) row.proposalsSent += 1;
    if (inPeriod(enquiry.contract?.sentAt)) row.contractsSent += 1;
    const wonAt = enquiry.won?.at || (enquiry.stageHistory || []).find((h) => h.stage === 'won')?.at;
    if (wonAt && inPeriod(wonAt)) {
      row.won += 1;
      row.wonValue += value;
      row.daysToWin.push(Math.max(0, Math.round((new Date(wonAt) - new Date(enquiry.createdAt)) / DAY)));
    }
    if (inPeriod(enquiry.lostAt)) row.lost += 1;
    if (inPeriod(enquiry.cancellation?.at)) row.cancelled += 1;
    if (enquiry.advance?.received && inPeriod(enquiry.advance.date || enquiry.advance.recordedAt)) {
      row.advanceCollected += parseAmount(enquiry.advance.amount);
    }
    if (OPEN_STAGES.includes(enquiry.stage)) {
      row.openEnquiries += 1;
      row.openValue += value;
    }
  }
  const performance = [...perf.values()]
    .map(({ daysToWin, ...row }) => ({
      ...row,
      wonValue: Math.round(row.wonValue),
      openValue: Math.round(row.openValue),
      advanceCollected: Math.round(row.advanceCollected),
      // Of the enquiries that closed in the period, the share that were won.
      conversion: percent(row.won, row.won + row.lost + row.cancelled),
      avgDaysToWin: average(daysToWin),
    }))
    .filter((r) => r.executiveId !== UNASSIGNED || r.leadsAdded || r.enquiries || r.won || r.openEnquiries)
    .sort((a, b) => b.wonValue - a.wonValue || b.enquiries - a.enquiries || a.executive.localeCompare(b.executive));

  /* ------------------------------ Productivity ----------------------------- */
  const prod = new Map();
  const prodRow = (id) => {
    const key = keyOf(id);
    if (!prod.has(key)) {
      prod.set(key, {
        userId: key,
        user: nameOf(key),
        visits: 0,
        followUpsScheduled: 0,
        followUpsClosed: 0,
        followUpsOverdue: 0,
        actionPointsCleared: 0,
        actionPointsOpen: 0,
        emailsSent: 0,
        sheetsMade: 0,
        actions: 0,
        activeDays: new Set(),
        lastActive: null,
      });
    }
    return prod.get(key);
  };

  for (const lead of leads) {
    for (const visit of lead.visitReports || []) {
      if (visit.createdBy && inPeriod(visit.visitDate)) prodRow(visit.createdBy).visits += 1;
    }
    for (const fu of lead.followUps || []) {
      if (fu.createdBy && inPeriod(fu.createdAt)) prodRow(fu.createdBy).followUpsScheduled += 1;
      if (fu.status === 'closed' && fu.closedBy && inPeriod(fu.closedAt)) prodRow(fu.closedBy).followUpsClosed += 1;
      // Overdue now, against whoever owns the lead.
      if (fu.status === 'open' && lead.assignedTo && new Date(fu.dueDate) < today) prodRow(lead.assignedTo).followUpsOverdue += 1;
    }
    for (const ap of lead.actionPoints || []) {
      if (ap.cleared && ap.clearedBy && inPeriod(ap.clearedAt)) prodRow(ap.clearedBy).actionPointsCleared += 1;
      if (!ap.cleared && lead.assignedTo) prodRow(lead.assignedTo).actionPointsOpen += 1;
    }
  }
  for (const enquiry of enquiries) {
    for (const mail of enquiry.emails || []) {
      if (mail.by && inPeriod(mail.at)) prodRow(mail.by).emailsSent += 1;
    }
  }
  for (const doc of [...sheets, ...estimates]) {
    if (doc.madeBy) prodRow(doc.madeBy).sheetsMade += 1;
  }
  for (const log of logs) {
    const actor = log.actor?._id || log.actor;
    if (!actor) continue;
    const row = prodRow(actor);
    row.actions += 1;
    row.activeDays.add(new Date(log.createdAt).toISOString().slice(0, 10));
    if (!row.lastActive || new Date(log.createdAt) > new Date(row.lastActive)) row.lastActive = log.createdAt;
  }
  const productivity = [...prod.values()]
    .filter((r) => r.userId !== UNASSIGNED && wanted(r.userId))
    .map(({ activeDays, ...row }) => ({ ...row, activeDays: activeDays.size }))
    .sort((a, b) => b.actions - a.actions || a.user.localeCompare(b.user));

  /* ----------------------------- Pipeline ageing ---------------------------- */
  const ageingRows = enquiries
    .filter((e) => OPEN_STAGES.includes(e.stage) && wanted(keyOf(e.lead?.assignedTo)))
    .map((e) => {
      const entered = enteredCurrentStage(e);
      const days = Math.max(0, Math.floor((now - entered) / DAY));
      const dates = (e.functions || []).map((f) => f.date).filter(Boolean).map((d) => new Date(d)).sort((a, b) => a - b);
      return {
        enquiryId: String(e._id),
        businessName: e.lead?.businessName || e.contactName || 'Guest',
        reference: e.lead?.reference || '',
        executive: nameOf(keyOf(e.lead?.assignedTo)),
        stage: e.stage,
        stageLabel: STAGE_LABELS[e.stage],
        enteredAt: entered,
        days,
        limit: STAGE_LIMIT_DAYS[e.stage],
        overdue: days > STAGE_LIMIT_DAYS[e.stage],
        value: Math.round(enquiryValue(e)),
        firstDate: dates[0] || null,
        contactName: e.contactName || '',
      };
    })
    .sort((a, b) => Number(b.overdue) - Number(a.overdue) || b.days - a.days);
  const ageingByStage = OPEN_STAGES.map((stage) => {
    const rows = ageingRows.filter((r) => r.stage === stage);
    return {
      stage,
      label: STAGE_LABELS[stage],
      limit: STAGE_LIMIT_DAYS[stage],
      count: rows.length,
      overdue: rows.filter((r) => r.overdue).length,
      avgDays: average(rows.map((r) => r.days)),
      oldestDays: rows.reduce((max, r) => Math.max(max, r.days), 0),
      value: rows.reduce((sum, r) => sum + r.value, 0),
    };
  });

  /* ---------------------------------- Audit --------------------------------- */
  const auditLogs = logs.filter((log) => !only || String(log.actor?._id || log.actor || '') === only);
  const byUser = new Map();
  const byArea = new Map();
  const byDay = new Map();
  for (const log of auditLogs) {
    const actorId = String(log.actor?._id || log.actor || '');
    const who = log.actor?.name || (actorId ? nameOf(actorId) : log.actorEmail || 'Not signed in');
    const area = auditArea(log);
    const day = new Date(log.createdAt).toISOString().slice(0, 10);

    const u = byUser.get(who) || { user: who, actions: 0, days: new Set(), areas: new Map(), lastAt: null };
    u.actions += 1;
    u.days.add(day);
    u.areas.set(area, (u.areas.get(area) || 0) + 1);
    if (!u.lastAt || new Date(log.createdAt) > new Date(u.lastAt)) u.lastAt = log.createdAt;
    byUser.set(who, u);

    const a = byArea.get(area) || { area, actions: 0, users: new Set() };
    a.actions += 1;
    a.users.add(who);
    byArea.set(area, a);

    byDay.set(day, (byDay.get(day) || 0) + 1);
  }
  const audit = {
    total: auditLogs.length,
    byUser: [...byUser.values()]
      .map((u) => ({
        user: u.user,
        actions: u.actions,
        activeDays: u.days.size,
        busiestArea: [...u.areas.entries()].sort((x, y) => y[1] - x[1])[0]?.[0] || '',
        lastAt: u.lastAt,
      }))
      .sort((x, y) => y.actions - x.actions),
    byArea: [...byArea.values()].map((a) => ({ area: a.area, actions: a.actions, users: a.users.size })).sort((x, y) => y.actions - x.actions),
    byDay: [...byDay.entries()].map(([day, actions]) => ({ day, actions })).sort((x, y) => x.day.localeCompare(y.day)),
    rows: auditLogs.slice(0, AUDIT_ROW_LIMIT).map((log) => ({
      at: log.createdAt,
      user: log.actor?.name || log.actorEmail || 'Not signed in',
      area: auditArea(log),
      action: actionLabel(log.action),
      summary: log.summary || '',
      ip: log.ip || '',
    })),
    truncated: auditLogs.length > AUDIT_ROW_LIMIT,
  };

  const totals = performance.reduce(
    (t, r) => ({
      enquiries: t.enquiries + r.enquiries,
      won: t.won + r.won,
      wonValue: t.wonValue + r.wonValue,
      lost: t.lost + r.lost,
      cancelled: t.cancelled + r.cancelled,
      advanceCollected: t.advanceCollected + r.advanceCollected,
    }),
    { enquiries: 0, won: 0, wonValue: 0, lost: 0, cancelled: 0, advanceCollected: 0 }
  );

  return {
    period: { from, to },
    executives: users.filter((u) => u.isActive !== false).map((u) => ({ _id: u._id, name: u.name })),
    summary: {
      ...totals,
      conversion: percent(totals.won, totals.won + totals.lost + totals.cancelled),
      openEnquiries: ageingRows.length,
      stuck: ageingRows.filter((r) => r.overdue).length,
      auditActions: audit.total,
      activeUsers: audit.byUser.length,
    },
    performance,
    productivity,
    ageing: { byStage: ageingByStage, rows: ageingRows },
    audit,
  };
}

/* ---------------------------------- Excel ---------------------------------- */

const DATE_FMT = { numFmt: 'dd-mmm-yyyy' };
const DATETIME_FMT = { numFmt: 'dd-mmm-yyyy hh:mm' };
const MONEY_FMT = { numFmt: '#,##0' };

function asDate(value) {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

function addSheet(workbook, name, columns) {
  const sheet = workbook.addWorksheet(name, { views: [{ state: 'frozen', ySplit: 1 }] });
  sheet.columns = columns;
  sheet.getRow(1).font = { bold: true };
  sheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEFEFEF' } };
  sheet.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: columns.length } };
  return sheet;
}

/** The management reports as an .xlsx: one sheet per report, same filters as the page. */
export async function generateTeamExcel(filters = {}) {
  const data = await getTeamReport(filters);
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'Centre Point Leads CRM';
  workbook.created = new Date();
  const day = (d) => new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });

  const summary = addSheet(workbook, 'Summary', [
    { header: 'Measure', key: 'measure', width: 38 },
    { header: 'Value', key: 'value', width: 22 },
  ]);
  const s = data.summary;
  [
    ['Period', `${day(data.period.from)} to ${day(data.period.to)}`],
    ['Enquiries raised', s.enquiries],
    ['Won', s.won],
    ['Won value (Rs.)', s.wonValue],
    ['Lost', s.lost],
    ['Cancelled', s.cancelled],
    ['Conversion (won / closed) %', s.conversion],
    ['Advance collected (Rs.)', s.advanceCollected],
    ['Open enquiries now', s.openEnquiries],
    ['Stuck past their stage limit', s.stuck],
    ['Actions in the audit log', s.auditActions],
    ['People active', s.activeUsers],
  ].forEach(([measure, value]) => summary.addRow({ measure, value }));

  const perf = addSheet(workbook, 'Executive performance', [
    { header: 'Executive', key: 'executive', width: 24 },
    { header: 'Leads added', key: 'leadsAdded', width: 13 },
    { header: 'Enquiries', key: 'enquiries', width: 11 },
    { header: 'Proposals sent', key: 'proposalsSent', width: 15 },
    { header: 'Contracts sent', key: 'contractsSent', width: 15 },
    { header: 'Won', key: 'won', width: 8 },
    { header: 'Won value (Rs.)', key: 'wonValue', width: 17, style: MONEY_FMT },
    { header: 'Lost', key: 'lost', width: 8 },
    { header: 'Cancelled', key: 'cancelled', width: 11 },
    { header: 'Conversion %', key: 'conversion', width: 13 },
    { header: 'Avg days to win', key: 'avgDaysToWin', width: 16 },
    { header: 'Advance collected (Rs.)', key: 'advanceCollected', width: 22, style: MONEY_FMT },
    { header: 'Open enquiries', key: 'openEnquiries', width: 15 },
    { header: 'Open value (Rs.)', key: 'openValue', width: 17, style: MONEY_FMT },
  ]);
  data.performance.forEach((r) => perf.addRow(r));

  const prod = addSheet(workbook, 'Executive productivity', [
    { header: 'Person', key: 'user', width: 24 },
    { header: 'Visits', key: 'visits', width: 9 },
    { header: 'Follow-ups scheduled', key: 'followUpsScheduled', width: 20 },
    { header: 'Follow-ups closed', key: 'followUpsClosed', width: 18 },
    { header: 'Follow-ups overdue (now)', key: 'followUpsOverdue', width: 24 },
    { header: 'Action points cleared', key: 'actionPointsCleared', width: 21 },
    { header: 'Action points open (now)', key: 'actionPointsOpen', width: 24 },
    { header: 'Client emails sent', key: 'emailsSent', width: 18 },
    { header: 'Sheets made (FP + estimate)', key: 'sheetsMade', width: 27 },
    { header: 'Actions logged', key: 'actions', width: 15 },
    { header: 'Days active', key: 'activeDays', width: 12 },
    { header: 'Last active', key: 'lastActive', width: 20, style: DATETIME_FMT },
  ]);
  data.productivity.forEach((r) => prod.addRow({ ...r, lastActive: asDate(r.lastActive) }));

  const ageing = addSheet(workbook, 'Pipeline ageing', [
    { header: 'Company / Guest', key: 'businessName', width: 30 },
    { header: 'Lead Ref', key: 'reference', width: 18 },
    { header: 'Executive', key: 'executive', width: 22 },
    { header: 'Stage', key: 'stageLabel', width: 14 },
    { header: 'In stage since', key: 'enteredAt', width: 16, style: DATE_FMT },
    { header: 'Days in stage', key: 'days', width: 14 },
    { header: 'Limit (days)', key: 'limit', width: 13 },
    { header: 'Stuck', key: 'overdue', width: 8 },
    { header: 'Value (Rs.)', key: 'value', width: 15, style: MONEY_FMT },
    { header: 'First function date', key: 'firstDate', width: 19, style: DATE_FMT },
    { header: 'Contact', key: 'contactName', width: 22 },
  ]);
  data.ageing.rows.forEach((r) => ageing.addRow({ ...r, enteredAt: asDate(r.enteredAt), firstDate: asDate(r.firstDate), overdue: r.overdue ? 'Yes' : '' }));

  const byUser = addSheet(workbook, 'Audit by user', [
    { header: 'User', key: 'user', width: 26 },
    { header: 'Actions', key: 'actions', width: 10 },
    { header: 'Days active', key: 'activeDays', width: 12 },
    { header: 'Busiest area', key: 'busiestArea', width: 26 },
    { header: 'Last action', key: 'lastAt', width: 20, style: DATETIME_FMT },
  ]);
  data.audit.byUser.forEach((r) => byUser.addRow({ ...r, lastAt: asDate(r.lastAt) }));

  const byArea = addSheet(workbook, 'Audit by area', [
    { header: 'Area', key: 'area', width: 28 },
    { header: 'Actions', key: 'actions', width: 10 },
    { header: 'People', key: 'users', width: 10 },
  ]);
  data.audit.byArea.forEach((r) => byArea.addRow(r));

  const log = addSheet(workbook, 'Audit log', [
    { header: 'When', key: 'at', width: 20, style: DATETIME_FMT },
    { header: 'User', key: 'user', width: 24 },
    { header: 'Area', key: 'area', width: 24 },
    { header: 'Action', key: 'action', width: 28 },
    { header: 'Details', key: 'summary', width: 70 },
    { header: 'IP address', key: 'ip', width: 18 },
  ]);
  data.audit.rows.forEach((r) => log.addRow({ ...r, at: asDate(r.at) }));

  const buffer = await workbook.xlsx.writeBuffer();
  // Local date parts: the period's bounds are local midnights.
  const stamp = (d) => {
    const x = new Date(d);
    return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`;
  };
  return {
    buffer: Buffer.from(buffer),
    filename: `Management Report ${stamp(data.period.from)} to ${stamp(data.period.to)}.xlsx`,
    contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  };
}

export default { getTeamReport, generateTeamExcel };
