import ExcelJS from 'exceljs';
import Lead from '../models/Lead.js';
import Kit from '../models/Kit.js';

function escapeRegex(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Lead-level filters: role scope + status/city/free-text search.
 */
function buildLeadMatch(currentUser, filters = {}) {
  const match = {};
  if (currentUser.role !== 'admin') {
    match.assignedTo = currentUser.id;
  }
  if (filters.status) {
    match.status = filters.status;
  }
  if (filters.city) {
    match.city = new RegExp(escapeRegex(filters.city), 'i');
  }
  if (filters.q) {
    const rx = new RegExp(escapeRegex(filters.q), 'i');
    match.$or = [
      { businessName: rx },
      { reference: rx },
      { contactPerson: rx },
    ];
  }
  return match;
}

/**
 * Date-range predicate for activity records (visits, follow-ups, actions).
 * Bounds are inclusive; either side may be missing.
 */
function makeRangeCheck(filters = {}) {
  const from = filters.from ? new Date(filters.from) : null;
  const to = filters.to ? new Date(filters.to) : null;
  if (to) to.setHours(23, 59, 59, 999);
  return (value) => {
    if (!from && !to) return true;
    if (!value) return false;
    const time = new Date(value).getTime();
    if (from && time < from.getTime()) return false;
    if (to && time > to.getTime()) return false;
    return true;
  };
}

function latestDate(items, field) {
  let latest = null;
  for (const item of items) {
    const value = item?.[field] ? new Date(item[field]).getTime() : null;
    if (value && (!latest || value > latest)) latest = value;
  }
  return latest ? new Date(latest) : null;
}

function nextOpenFollowUpDate(followUps) {
  let next = null;
  for (const fu of followUps) {
    if (fu.status !== 'open' || !fu.dueDate) continue;
    const value = new Date(fu.dueDate).getTime();
    if (!next || value < next) next = value;
  }
  return next ? new Date(next) : null;
}

/**
 * Collect the filtered report data once; the overview endpoint and the Excel
 * export both render from this.
 *
 * Lead filters (q/status/city) pick the leads; from/to narrows the activity
 * (visits by visit date, follow-ups by due date, action points by created
 * date). Per-lead counts and the summary reflect the narrowed activity.
 */
export async function getReportData(currentUser, filters = {}) {
  if (!currentUser || !currentUser.id) {
    return { summary: null, rows: [], visits: [], followUps: [], actionPoints: [] };
  }

  const leads = await Lead.find(buildLeadMatch(currentUser, filters))
    .populate('assignedTo', 'name email')
    .sort({ createdAt: -1 })
    .lean();

  // Per-lead kit rollup: best status (confirmed > sent > draft) and the most
  // recent successful email delivery across all of the lead's kits. "Delivered"
  // means the kit document was emailed to the client (status sent/confirmed).
  const kits = leads.length
    ? await Kit.find({ lead: { $in: leads.map((l) => l._id) } })
        .select('lead status emailLog.status emailLog.sentAt')
        .lean()
    : [];
  const KIT_RANK = { draft: 1, sent: 2, confirmed: 3 };
  const kitByLead = new Map();
  let kitsDelivered = 0;
  for (const kit of kits) {
    if (kit.status === 'sent' || kit.status === 'confirmed') kitsDelivered += 1;
    const key = String(kit.lead);
    const info = kitByLead.get(key) || { count: 0, status: '', deliveredAt: null };
    info.count += 1;
    if ((KIT_RANK[kit.status] || 0) > (KIT_RANK[info.status] || 0)) {
      info.status = kit.status;
    }
    for (const log of kit.emailLog || []) {
      if (log.status !== 'sent' || !log.sentAt) continue;
      const time = new Date(log.sentAt).getTime();
      if (!info.deliveredAt || time > info.deliveredAt.getTime()) {
        info.deliveredAt = new Date(time);
      }
    }
    kitByLead.set(key, info);
  }

  const inRange = makeRangeCheck(filters);

  const rows = [];
  const visits = [];
  const followUps = [];
  const actionPoints = [];

  for (const lead of leads) {
    const leadId = String(lead._id);
    const base = {
      leadId,
      reference: lead.reference || '',
      businessName: lead.businessName || '',
      city: lead.city || '',
    };

    const leadVisits = (lead.visitReports || []).filter((v) =>
      inRange(v.visitDate)
    );
    const leadFollowUps = (lead.followUps || []).filter((f) =>
      inRange(f.dueDate)
    );
    const leadActions = (lead.actionPoints || []).filter((a) =>
      inRange(a.createdAt)
    );

    const leadKits = kitByLead.get(leadId);
    rows.push({
      ...base,
      status: lead.status || '',
      kitCount: leadKits?.count || 0,
      kitStatus: leadKits?.status || '',
      kitDeliveredDate: leadKits?.deliveredAt || null,
      assignedToName: lead.assignedTo?.name || '',
      contactPerson: lead.contactPerson || '',
      designation: lead.designation || '',
      mobile: lead.mobile || '',
      email: lead.email || '',
      businessType: lead.businessType || '',
      contactedFor: Array.isArray(lead.contactedFor)
        ? lead.contactedFor.join(', ')
        : lead.contactedFor || '',
      leadDate: lead.leadDate || null,
      createdAt: lead.createdAt || null,
      visitCount: leadVisits.length,
      lastVisitDate: latestDate(leadVisits, 'visitDate'),
      openFollowUps: leadFollowUps.filter((f) => f.status === 'open').length,
      nextFollowUpDate: nextOpenFollowUpDate(leadFollowUps),
      openActionPoints: leadActions.filter((a) => !a.cleared).length,
    });

    for (const vr of leadVisits) {
      visits.push({
        ...base,
        visitReportId: vr._id ? String(vr._id) : null,
        visitDate: vr.visitDate || null,
        note: vr.note || '',
        followUpDate: vr.followUpDate || null,
        followUpNote: vr.followUpNote || '',
        actionPoint: vr.actionPoint || 'No action',
        createdByName: vr.createdByName || '',
        createdAt: vr.createdAt || null,
      });
    }

    for (const fu of leadFollowUps) {
      followUps.push({
        ...base,
        followUpId: fu._id ? String(fu._id) : null,
        dueDate: fu.dueDate || null,
        note: fu.note || '',
        status: fu.status || 'open',
        closingNote: fu.closingNote || '',
        closedAt: fu.closedAt || null,
        createdByName: fu.createdByName || '',
      });
    }

    for (const ap of leadActions) {
      actionPoints.push({
        ...base,
        actionPointId: ap._id ? String(ap._id) : null,
        text: ap.text || '',
        status: ap.cleared ? 'cleared' : 'open',
        createdByName: ap.createdByName || '',
        createdAt: ap.createdAt || null,
        clearedAt: ap.clearedAt || null,
      });
    }
  }

  const byDateDesc = (field) => (a, b) =>
    (b[field] ? new Date(b[field]).getTime() : 0) -
    (a[field] ? new Date(a[field]).getTime() : 0);
  visits.sort(byDateDesc('visitDate'));
  followUps.sort(byDateDesc('dueDate'));
  actionPoints.sort(byDateDesc('createdAt'));

  const summary = {
    totalLeads: rows.length,
    contracted: rows.filter((r) => r.status === 'Contracted').length,
    kitsDelivered,
    totalVisits: visits.length,
    openFollowUps: followUps.filter((f) => f.status === 'open').length,
    openActionPoints: actionPoints.filter((a) => a.status === 'open').length,
  };

  return { summary, rows, visits, followUps, actionPoints };
}

/* ----------------------------- Excel rendering ---------------------------- */

const HEADER_FILL = {
  type: 'pattern',
  pattern: 'solid',
  fgColor: { argb: 'FF17766B' },
};

function addSheet(workbook, name, columns) {
  const sheet = workbook.addWorksheet(name, {
    views: [{ state: 'frozen', ySplit: 1 }],
  });
  sheet.columns = columns;
  const header = sheet.getRow(1);
  header.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  header.fill = HEADER_FILL;
  header.alignment = { vertical: 'middle' };
  header.height = 20;
  return sheet;
}

const DATE_FMT = { numFmt: 'dd mmm yyyy' };
const DATETIME_FMT = { numFmt: 'dd mmm yyyy hh:mm' };

function asDate(value) {
  return value ? new Date(value) : null;
}

/**
 * Overall .xlsx report honoring the same filters as the overview: one
 * workbook with Leads, Visit Reports, Follow-ups and Action Points sheets.
 * Returns { buffer, filename, contentType } for the download controller.
 */
export async function generateOverallExcel(currentUser, filters = {}) {
  const { rows, visits, followUps, actionPoints } = await getReportData(
    currentUser,
    filters
  );

  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'Centre Point Leads CRM';
  workbook.created = new Date();

  const leadSheet = addSheet(workbook, 'Leads', [
    { header: 'Reference', key: 'reference', width: 22 },
    { header: 'Business Name', key: 'businessName', width: 30 },
    { header: 'Contact Person', key: 'contactPerson', width: 22 },
    { header: 'Designation', key: 'designation', width: 18 },
    { header: 'Mobile', key: 'mobile', width: 15 },
    { header: 'Email', key: 'email', width: 26 },
    { header: 'City', key: 'city', width: 15 },
    { header: 'Business Type', key: 'businessType', width: 18 },
    { header: 'Contacted For', key: 'contactedFor', width: 15 },
    { header: 'Lead Date', key: 'leadDate', width: 14, style: DATE_FMT },
    { header: 'Status', key: 'status', width: 16 },
    { header: 'Kit Status', key: 'kitStatusLabel', width: 14 },
    { header: 'Email Delivered On', key: 'kitDeliveredDate', width: 17, style: DATE_FMT },
    { header: 'Assigned To', key: 'assignedToName', width: 20 },
    { header: 'Visits', key: 'visitCount', width: 8 },
    { header: 'Last Visit', key: 'lastVisitDate', width: 14, style: DATE_FMT },
    { header: 'Open Follow-ups', key: 'openFollowUps', width: 15 },
    { header: 'Next Follow-up', key: 'nextFollowUpDate', width: 15, style: DATE_FMT },
    { header: 'Open Action Points', key: 'openActionPoints', width: 17 },
    { header: 'Created At', key: 'createdAt', width: 18, style: DATETIME_FMT },
  ]);
  const KIT_STATUS_LABELS = { draft: 'Draft', sent: 'Delivered', confirmed: 'Confirmed' };
  for (const row of rows) {
    leadSheet.addRow({
      ...row,
      kitStatusLabel: KIT_STATUS_LABELS[row.kitStatus] || '',
      kitDeliveredDate: asDate(row.kitDeliveredDate),
      leadDate: asDate(row.leadDate),
      lastVisitDate: asDate(row.lastVisitDate),
      nextFollowUpDate: asDate(row.nextFollowUpDate),
      createdAt: asDate(row.createdAt),
    });
  }

  const visitSheet = addSheet(workbook, 'Visit Reports', [
    { header: 'Visit Date', key: 'visitDate', width: 14, style: DATE_FMT },
    { header: 'Lead Reference', key: 'reference', width: 22 },
    { header: 'Business Name', key: 'businessName', width: 30 },
    { header: 'City', key: 'city', width: 15 },
    { header: 'Visit Note', key: 'note', width: 55 },
    { header: 'Next Follow-up', key: 'followUpDate', width: 15, style: DATE_FMT },
    { header: 'Follow-up Note', key: 'followUpNote', width: 40 },
    { header: 'Action Point', key: 'actionPoint', width: 24 },
    { header: 'Recorded By', key: 'createdByName', width: 20 },
    { header: 'Recorded At', key: 'createdAt', width: 18, style: DATETIME_FMT },
  ]);
  for (const row of visits) {
    const added = visitSheet.addRow({
      ...row,
      visitDate: asDate(row.visitDate),
      followUpDate: asDate(row.followUpDate),
      createdAt: asDate(row.createdAt),
    });
    added.alignment = { vertical: 'top' };
    added.getCell('note').alignment = { vertical: 'top', wrapText: true };
    added.getCell('followUpNote').alignment = {
      vertical: 'top',
      wrapText: true,
    };
  }

  const followUpSheet = addSheet(workbook, 'Follow-ups', [
    { header: 'Due Date', key: 'dueDate', width: 14, style: DATE_FMT },
    { header: 'Lead Reference', key: 'reference', width: 22 },
    { header: 'Business Name', key: 'businessName', width: 30 },
    { header: 'Note', key: 'note', width: 45 },
    { header: 'Status', key: 'status', width: 10 },
    { header: 'Closing Note', key: 'closingNote', width: 40 },
    { header: 'Closed At', key: 'closedAt', width: 14, style: DATE_FMT },
    { header: 'Scheduled By', key: 'createdByName', width: 20 },
  ]);
  for (const row of followUps) {
    const added = followUpSheet.addRow({
      ...row,
      dueDate: asDate(row.dueDate),
      closedAt: asDate(row.closedAt),
    });
    added.getCell('note').alignment = { wrapText: true };
    added.getCell('closingNote').alignment = { wrapText: true };
  }

  const actionSheet = addSheet(workbook, 'Action Points', [
    { header: 'Action', key: 'text', width: 45 },
    { header: 'Lead Reference', key: 'reference', width: 22 },
    { header: 'Business Name', key: 'businessName', width: 30 },
    { header: 'Status', key: 'status', width: 10 },
    { header: 'Created By', key: 'createdByName', width: 20 },
    { header: 'Created At', key: 'createdAt', width: 14, style: DATE_FMT },
    { header: 'Cleared At', key: 'clearedAt', width: 14, style: DATE_FMT },
  ]);
  for (const row of actionPoints) {
    const added = actionSheet.addRow({
      ...row,
      createdAt: asDate(row.createdAt),
      clearedAt: asDate(row.clearedAt),
    });
    added.getCell('text').alignment = { wrapText: true };
  }

  const stamp = new Date().toISOString().slice(0, 10);
  const buffer = Buffer.from(await workbook.xlsx.writeBuffer());

  return {
    buffer,
    filename: `leads-report-${stamp}.xlsx`,
    contentType:
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  };
}

export default { getReportData, generateOverallExcel };
