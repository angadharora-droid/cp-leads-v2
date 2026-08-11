import ExcelJS from 'exceljs';
import Lead from '../models/Lead.js';

/**
 * Load every lead the current user may see, fully populated for reporting.
 *
 * Scoping:
 *  - admin       -> all leads
 *  - sales_exec  -> only leads where assignedTo === self
 */
async function loadScopedLeads(currentUser) {
  if (!currentUser || !currentUser.id) return [];
  const match = {};
  if (currentUser.role !== 'admin') {
    match.assignedTo = currentUser.id;
  }
  return Lead.find(match)
    .populate('assignedTo', 'name email')
    .sort({ createdAt: -1 })
    .lean();
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
 * Overall per-lead overview for the Reports page, plus headline totals.
 */
export async function getReportOverview(currentUser) {
  const leads = await loadScopedLeads(currentUser);

  const rows = leads.map((lead) => {
    const visits = lead.visitReports || [];
    const followUps = lead.followUps || [];
    const actionPoints = lead.actionPoints || [];
    return {
      leadId: String(lead._id),
      reference: lead.reference || '',
      businessName: lead.businessName || '',
      city: lead.city || '',
      status: lead.status || '',
      assignedToName: lead.assignedTo?.name || '',
      leadDate: lead.leadDate || null,
      visitCount: visits.length,
      lastVisitDate: latestDate(visits, 'visitDate'),
      openFollowUps: followUps.filter((f) => f.status === 'open').length,
      nextFollowUpDate: nextOpenFollowUpDate(followUps),
      openActionPoints: actionPoints.filter((a) => !a.cleared).length,
    };
  });

  const summary = {
    totalLeads: rows.length,
    contracted: rows.filter((r) => r.status === 'Contracted').length,
    totalVisits: rows.reduce((sum, r) => sum + r.visitCount, 0),
    openFollowUps: rows.reduce((sum, r) => sum + r.openFollowUps, 0),
    openActionPoints: rows.reduce((sum, r) => sum + r.openActionPoints, 0),
  };

  return { summary, rows };
}

const HEADER_FILL = {
  type: 'pattern',
  pattern: 'solid',
  fgColor: { argb: 'FF17766B' },
};

function styleHeader(sheet) {
  const header = sheet.getRow(1);
  header.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  header.fill = HEADER_FILL;
  header.alignment = { vertical: 'middle' };
  header.height = 20;
}

function addSheet(workbook, name, columns) {
  const sheet = workbook.addWorksheet(name, {
    views: [{ state: 'frozen', ySplit: 1 }],
  });
  sheet.columns = columns;
  styleHeader(sheet);
  return sheet;
}

const DATE_FMT = { numFmt: 'dd mmm yyyy' };
const DATETIME_FMT = { numFmt: 'dd mmm yyyy hh:mm' };

function asDate(value) {
  return value ? new Date(value) : null;
}

/**
 * Build the overall .xlsx report: one workbook with a sheet per aspect —
 * Leads, Visit Reports, Follow-ups, Action Points.
 * Returns { buffer, filename, contentType } for the download controller.
 */
export async function generateOverallExcel(currentUser) {
  const leads = await loadScopedLeads(currentUser);

  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'Centre Point Leads CRM';
  workbook.created = new Date();

  /* ------------------------------- Leads ------------------------------- */
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
    { header: 'Assigned To', key: 'assignedTo', width: 20 },
    { header: 'Visits', key: 'visits', width: 8 },
    { header: 'Open Follow-ups', key: 'openFollowUps', width: 15 },
    { header: 'Open Action Points', key: 'openActionPoints', width: 17 },
    { header: 'Created At', key: 'createdAt', width: 18, style: DATETIME_FMT },
  ]);

  /* ---------------------------- Visit reports --------------------------- */
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

  /* ------------------------------ Follow-ups ---------------------------- */
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

  /* ----------------------------- Action points -------------------------- */
  const actionSheet = addSheet(workbook, 'Action Points', [
    { header: 'Action', key: 'text', width: 45 },
    { header: 'Lead Reference', key: 'reference', width: 22 },
    { header: 'Business Name', key: 'businessName', width: 30 },
    { header: 'Status', key: 'status', width: 10 },
    { header: 'Created By', key: 'createdByName', width: 20 },
    { header: 'Created At', key: 'createdAt', width: 14, style: DATE_FMT },
    { header: 'Cleared At', key: 'clearedAt', width: 14, style: DATE_FMT },
  ]);

  const visitRows = [];
  const followUpRows = [];
  const actionRows = [];

  for (const lead of leads) {
    const base = {
      reference: lead.reference || '',
      businessName: lead.businessName || '',
      city: lead.city || '',
    };

    leadSheet.addRow({
      ...base,
      contactPerson: lead.contactPerson || '',
      designation: lead.designation || '',
      mobile: lead.mobile || '',
      email: lead.email || '',
      businessType: lead.businessType || '',
      contactedFor: (lead.contactedFor || []).join(', '),
      leadDate: asDate(lead.leadDate),
      status: lead.status || '',
      assignedTo: lead.assignedTo?.name || '',
      visits: (lead.visitReports || []).length,
      openFollowUps: (lead.followUps || []).filter((f) => f.status === 'open')
        .length,
      openActionPoints: (lead.actionPoints || []).filter((a) => !a.cleared)
        .length,
      createdAt: asDate(lead.createdAt),
    });

    for (const vr of lead.visitReports || []) {
      visitRows.push({
        ...base,
        visitDate: asDate(vr.visitDate),
        note: vr.note || '',
        followUpDate: asDate(vr.followUpDate),
        followUpNote: vr.followUpNote || '',
        actionPoint: vr.actionPoint || 'No action',
        createdByName: vr.createdByName || '',
        createdAt: asDate(vr.createdAt),
      });
    }

    for (const fu of lead.followUps || []) {
      followUpRows.push({
        ...base,
        dueDate: asDate(fu.dueDate),
        note: fu.note || '',
        status: fu.status || 'open',
        closingNote: fu.closingNote || '',
        closedAt: asDate(fu.closedAt),
        createdByName: fu.createdByName || '',
      });
    }

    for (const ap of lead.actionPoints || []) {
      actionRows.push({
        ...base,
        text: ap.text || '',
        status: ap.cleared ? 'cleared' : 'open',
        createdByName: ap.createdByName || '',
        createdAt: asDate(ap.createdAt),
        clearedAt: asDate(ap.clearedAt),
      });
    }
  }

  const byDateDesc = (field) => (a, b) =>
    (b[field] ? b[field].getTime() : 0) - (a[field] ? a[field].getTime() : 0);

  visitRows.sort(byDateDesc('visitDate'));
  followUpRows.sort(byDateDesc('dueDate'));
  actionRows.sort(byDateDesc('createdAt'));

  for (const row of visitRows) {
    const added = visitSheet.addRow(row);
    added.alignment = { vertical: 'top' };
    added.getCell('note').alignment = { vertical: 'top', wrapText: true };
    added.getCell('followUpNote').alignment = {
      vertical: 'top',
      wrapText: true,
    };
  }
  for (const row of followUpRows) {
    const added = followUpSheet.addRow(row);
    added.getCell('note').alignment = { wrapText: true };
    added.getCell('closingNote').alignment = { wrapText: true };
  }
  for (const row of actionRows) {
    const added = actionSheet.addRow(row);
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

export default { getReportOverview, generateOverallExcel };
