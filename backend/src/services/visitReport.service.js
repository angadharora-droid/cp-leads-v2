import mongoose from 'mongoose';
import ExcelJS from 'exceljs';
import Lead from '../models/Lead.js';

/**
 * Flatten visit reports across all leads the current user is allowed to see.
 *
 * Scoping:
 *  - admin       -> all leads
 *  - sales_exec  -> only leads where assignedTo === self
 *
 * Returns rows sorted by visitDate (newest first):
 *  [{ leadId, visitReportId, reference, businessName, city, contactPerson,
 *     visitDate, note, followUpDate, followUpNote, actionPoint,
 *     createdByName, createdAt }]
 */
export async function getVisitReports(currentUser) {
  if (!currentUser || !currentUser.id) {
    return [];
  }

  const match = {};
  if (currentUser.role !== 'admin') {
    match.assignedTo = new mongoose.Types.ObjectId(currentUser.id);
  }

  const pipeline = [
    { $match: match },
    { $match: { 'visitReports.0': { $exists: true } } },
    {
      $project: {
        reference: 1,
        businessName: 1,
        city: 1,
        contactPerson: 1,
        visitReports: 1,
      },
    },
  ];

  const leads = await Lead.aggregate(pipeline);

  const reports = [];
  for (const lead of leads) {
    const leadId = String(lead._id);
    for (const vr of lead.visitReports || []) {
      reports.push({
        leadId,
        visitReportId: vr._id ? String(vr._id) : null,
        reference: lead.reference || '',
        businessName: lead.businessName || '',
        city: lead.city || '',
        contactPerson: lead.contactPerson || '',
        visitDate: vr.visitDate || null,
        note: vr.note || '',
        followUpDate: vr.followUpDate || null,
        followUpNote: vr.followUpNote || '',
        actionPoint: vr.actionPoint || 'No action',
        createdByName: vr.createdByName || '',
        createdAt: vr.createdAt || null,
      });
    }
  }

  reports.sort((a, b) => {
    const av = a.visitDate ? new Date(a.visitDate).getTime() : 0;
    const bv = b.visitDate ? new Date(b.visitDate).getTime() : 0;
    return bv - av;
  });

  return reports;
}

/**
 * Build an .xlsx workbook of all visit reports visible to the current user.
 * Returns { buffer, filename, contentType } for the download controller.
 */
export async function generateVisitReportsExcel(currentUser) {
  const reports = await getVisitReports(currentUser);

  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'Centre Point Leads CRM';
  workbook.created = new Date();

  const sheet = workbook.addWorksheet('Visit Reports', {
    views: [{ state: 'frozen', ySplit: 1 }],
  });

  sheet.columns = [
    { header: 'Visit Date', key: 'visitDate', width: 14, style: { numFmt: 'dd mmm yyyy' } },
    { header: 'Lead Reference', key: 'reference', width: 22 },
    { header: 'Business Name', key: 'businessName', width: 30 },
    { header: 'City', key: 'city', width: 16 },
    { header: 'Contact Person', key: 'contactPerson', width: 22 },
    { header: 'Visit Note', key: 'note', width: 55 },
    { header: 'Next Follow-up', key: 'followUpDate', width: 15, style: { numFmt: 'dd mmm yyyy' } },
    { header: 'Follow-up Note', key: 'followUpNote', width: 40 },
    { header: 'Action Point', key: 'actionPoint', width: 24 },
    { header: 'Recorded By', key: 'createdByName', width: 20 },
    { header: 'Recorded At', key: 'createdAt', width: 18, style: { numFmt: 'dd mmm yyyy hh:mm' } },
  ];

  const header = sheet.getRow(1);
  header.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  header.fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FF17766B' },
  };
  header.alignment = { vertical: 'middle' };
  header.height = 20;

  for (const r of reports) {
    const row = sheet.addRow({
      ...r,
      visitDate: r.visitDate ? new Date(r.visitDate) : null,
      followUpDate: r.followUpDate ? new Date(r.followUpDate) : null,
      createdAt: r.createdAt ? new Date(r.createdAt) : null,
    });
    row.alignment = { vertical: 'top' };
    row.getCell('note').alignment = { vertical: 'top', wrapText: true };
    row.getCell('followUpNote').alignment = { vertical: 'top', wrapText: true };
  }

  const stamp = new Date().toISOString().slice(0, 10);
  const buffer = Buffer.from(await workbook.xlsx.writeBuffer());

  return {
    buffer,
    filename: `visit-reports-${stamp}.xlsx`,
    contentType:
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  };
}

export default { getVisitReports, generateVisitReportsExcel };
