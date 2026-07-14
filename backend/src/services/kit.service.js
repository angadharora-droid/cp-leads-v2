import mongoose from 'mongoose';

import Kit from '../models/Kit.js';
import Lead from '../models/Lead.js';
import { AppError } from '../utils/apiResponse.js';
import { writeAudit } from '../utils/audit.js';
import { uploadBufferToGridFS, deleteGridFSFile, getKitFilesBucket } from '../utils/gridfs.js';
import { buildKitPdf } from './pdf.service.js';
import { sendMail } from './email.service.js';

const CONTRACT_NUMBER_START = 29500;

function isAdmin(actor) {
  return actor?.role === 'admin';
}

function isValidId(id) {
  return mongoose.Types.ObjectId.isValid(id);
}

/**
 * Loads a lead enforcing visibility scope (admins see all, sales execs only
 * leads assigned to them). Throws 404 when missing or out of scope.
 */
async function loadLeadScoped(leadId, actor) {
  if (!isValidId(leadId)) throw new AppError('Lead not found', 404, 'NOT_FOUND');
  const filter = { _id: leadId };
  if (!isAdmin(actor)) {
    filter.assignedTo = new mongoose.Types.ObjectId(actor.id);
  }
  const lead = await Lead.findOne(filter);
  if (!lead) throw new AppError('Lead not found', 404, 'NOT_FOUND');
  return lead;
}

/** Loads a kit plus its (scope-checked) lead. */
async function loadKitScoped(kitId, actor) {
  if (!isValidId(kitId)) throw new AppError('Kit not found', 404, 'NOT_FOUND');
  const kit = await Kit.findById(kitId);
  if (!kit) throw new AppError('Kit not found', 404, 'NOT_FOUND');
  const lead = await loadLeadScoped(kit.lead, actor);
  return { kit, lead };
}

async function nextContractNumber() {
  const kits = await Kit.find({ contractNumber: /^\d+$/ })
    .select('contractNumber')
    .lean();
  let max = CONTRACT_NUMBER_START - 1;
  for (const doc of kits) {
    const n = parseInt(doc.contractNumber, 10);
    if (Number.isFinite(n) && n > max) max = n;
  }
  return String(max + 1);
}

function pushHistory(lead, actor, type, summary) {
  lead.history.push({
    type,
    summary,
    by: actor?.id,
    byName: actor?.name,
  });
}

function kitLabel(kit) {
  if (kit.kitType === 'corporate') {
    return kit.corporate?.companyName || 'Corporate rate agreement';
  }
  return kit.event?.guestName || 'Event proposal';
}

/* --------------------------------- CRUD ---------------------------------- */

export async function listKitsForLead(leadId, actor) {
  await loadLeadScoped(leadId, actor);
  const kits = await Kit.find({ lead: leadId }).sort({ createdAt: -1 });
  return { kits };
}

export async function createKit(leadId, body, actor, req) {
  const lead = await loadLeadScoped(leadId, actor);

  const kit = new Kit({
    lead: lead._id,
    kitType: body.kitType,
    createdBy: actor?.id,
    createdByName: actor?.name,
  });

  if (body.kitType === 'event') {
    kit.event = body.event || {};
    kit.contractNumber = body.contractNumber || (await nextContractNumber());
  } else {
    kit.corporate = body.corporate || {};
  }

  await kit.save();

  pushHistory(
    lead,
    actor,
    'kit_created',
    `${body.kitType === 'corporate' ? 'Corporate rate kit' : 'Event kit'} created: ${kitLabel(kit)}`
  );
  await lead.save();

  await writeAudit({
    req,
    actor,
    action: 'kit.create',
    entityType: 'Kit',
    entityId: kit._id,
    summary: `Created ${kit.kitType} kit for lead ${lead.reference}`,
  });

  return kit;
}

export async function getKit(kitId, actor) {
  const { kit } = await loadKitScoped(kitId, actor);
  return kit;
}

export async function updateKit(kitId, body, actor, req) {
  const { kit, lead } = await loadKitScoped(kitId, actor);

  if (kit.kitType === 'event') {
    if (body.event) kit.event = body.event;
    if (body.contractNumber !== undefined) {
      kit.contractNumber = body.contractNumber;
    }
  } else if (body.corporate) {
    kit.corporate = body.corporate;
  }

  await kit.save();

  await writeAudit({
    req,
    actor,
    action: 'kit.update',
    entityType: 'Kit',
    entityId: kit._id,
    summary: `Updated ${kit.kitType} kit for lead ${lead.reference}`,
  });

  return kit;
}

export async function deleteKit(kitId, actor, req) {
  const { kit, lead } = await loadKitScoped(kitId, actor);

  for (const file of kit.confirmationFiles || []) {
    await deleteGridFSFile(file.fileId);
  }
  await kit.deleteOne();

  await writeAudit({
    req,
    actor,
    action: 'kit.delete',
    entityType: 'Kit',
    entityId: kitId,
    summary: `Deleted ${kit.kitType} kit for lead ${lead.reference}`,
  });

  return { deleted: true };
}

/* ---------------------------------- PDF ----------------------------------- */

export async function generateKitPdf(kitId, docType, actor) {
  const { kit } = await loadKitScoped(kitId, actor);
  return buildKitPdf(kit, docType);
}

/* --------------------------------- Email ---------------------------------- */

export async function sendKitEmail(kitId, payload, actor, req) {
  const { kit, lead } = await loadKitScoped(kitId, actor);
  const docType = kit.kitType === 'corporate' ? 'proposal' : payload.docType || 'proposal';

  const { buffer, filename } = await buildKitPdf(kit, docType);

  const docName =
    kit.kitType === 'corporate'
      ? 'Corporate Rate Agreement'
      : docType === 'confirmation'
        ? 'Confirmation Contract'
        : 'Proposal';

  const subject =
    payload.subject || `${docName} — ${kitLabel(kit)} — Centre Point Hotels & Resorts`;
  const text =
    payload.message ||
    `Dear Guest,\n\nGreetings from Centre Point Hotels & Resorts!\n\nPlease find attached the ${docName.toLowerCase()} for your kind perusal. We look forward to hosting you.\n\nWarm regards,\n${actor?.name || 'Centre Point Hotels & Resorts'}`;

  const logEntry = {
    to: payload.to,
    cc: payload.cc,
    subject,
    docType,
    sentBy: actor?.id,
    sentByName: actor?.name,
  };

  try {
    await sendMail({
      to: payload.to,
      cc: payload.cc,
      subject,
      text,
      attachments: [{ filename, content: buffer, contentType: 'application/pdf' }],
    });
  } catch (err) {
    // Configuration errors surface as-is; transport errors are logged on the kit.
    if (err instanceof AppError) throw err;
    kit.emailLog.push({ ...logEntry, status: 'failed', error: err?.message });
    await kit.save();
    throw new AppError(
      `Failed to send email: ${err?.message || 'unknown error'}`,
      502,
      'EMAIL_SEND_FAILED'
    );
  }

  kit.emailLog.push({ ...logEntry, status: 'sent' });
  if (kit.status === 'draft') kit.status = 'sent';
  await kit.save();

  pushHistory(lead, actor, 'proposal_sent', `${docName} emailed to ${payload.to}`);
  await lead.save();

  await writeAudit({
    req,
    actor,
    action: 'kit.email',
    entityType: 'Kit',
    entityId: kit._id,
    summary: `Emailed ${docName} to ${payload.to} (lead ${lead.reference})`,
  });

  return kit;
}

/* -------------------------- Confirmation uploads -------------------------- */

const ALLOWED_UPLOAD_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/heic',
  'application/pdf',
]);

export async function addConfirmationFiles(kitId, files, actor, req) {
  if (!files || files.length === 0) {
    throw new AppError('No files uploaded', 400, 'NO_FILES');
  }
  for (const file of files) {
    if (!ALLOWED_UPLOAD_TYPES.has(file.mimetype)) {
      throw new AppError(
        `Unsupported file type: ${file.mimetype}. Upload photos (JPG/PNG/WEBP) or PDFs.`,
        422,
        'UNSUPPORTED_FILE_TYPE'
      );
    }
  }

  const { kit, lead } = await loadKitScoped(kitId, actor);

  for (const file of files) {
    const fileId = await uploadBufferToGridFS(
      file.buffer,
      file.originalname,
      file.mimetype
    );
    kit.confirmationFiles.push({
      fileId,
      filename: file.originalname,
      contentType: file.mimetype,
      size: file.size,
      uploadedBy: actor?.id,
      uploadedByName: actor?.name,
    });
  }

  kit.status = 'confirmed';
  await kit.save();

  pushHistory(
    lead,
    actor,
    'confirmation_uploaded',
    `Signed confirmation uploaded (${files.length} file${files.length > 1 ? 's' : ''}) for ${kitLabel(kit)}`
  );
  if (lead.status !== 'Contracted') {
    lead.status = 'Contracted';
    pushHistory(lead, actor, 'status_change', 'Status changed to Contracted (signed confirmation received)');
  }
  await lead.save();

  await writeAudit({
    req,
    actor,
    action: 'kit.confirmation_upload',
    entityType: 'Kit',
    entityId: kit._id,
    summary: `Uploaded ${files.length} signed confirmation file(s) for lead ${lead.reference}`,
  });

  return kit;
}

export async function getConfirmationFile(kitId, fileId, actor) {
  const { kit } = await loadKitScoped(kitId, actor);
  const meta = (kit.confirmationFiles || []).find(
    (f) => String(f.fileId) === String(fileId)
  );
  if (!meta) throw new AppError('File not found', 404, 'NOT_FOUND');
  const stream = getKitFilesBucket().openDownloadStream(
    new mongoose.Types.ObjectId(String(fileId))
  );
  return { meta, stream };
}

export async function removeConfirmationFile(kitId, fileId, actor, req) {
  const { kit, lead } = await loadKitScoped(kitId, actor);
  const idx = (kit.confirmationFiles || []).findIndex(
    (f) => String(f.fileId) === String(fileId)
  );
  if (idx === -1) throw new AppError('File not found', 404, 'NOT_FOUND');

  const [removed] = kit.confirmationFiles.splice(idx, 1);
  await deleteGridFSFile(fileId);
  if (kit.confirmationFiles.length === 0 && kit.status === 'confirmed') {
    kit.status = kit.emailLog.some((e) => e.status === 'sent') ? 'sent' : 'draft';
  }
  await kit.save();

  await writeAudit({
    req,
    actor,
    action: 'kit.confirmation_delete',
    entityType: 'Kit',
    entityId: kit._id,
    summary: `Removed confirmation file ${removed.filename} (lead ${lead.reference})`,
  });

  return kit;
}

export default {
  listKitsForLead,
  createKit,
  getKit,
  updateKit,
  deleteKit,
  generateKitPdf,
  sendKitEmail,
  addConfirmationFiles,
  getConfirmationFile,
  removeConfirmationFile,
};
