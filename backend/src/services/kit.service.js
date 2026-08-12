import mongoose from 'mongoose';

import Kit from '../models/Kit.js';
import Lead from '../models/Lead.js';
import { AppError } from '../utils/apiResponse.js';
import { writeAudit } from '../utils/audit.js';
import { decryptSecret } from '../utils/mailCrypto.js';
import { uploadBufferToGridFS, deleteGridFSFile, getKitFilesBucket } from '../utils/gridfs.js';
import { buildKitPdf } from './pdf.service.js';
import { convertWordToPdf } from './docxToPdf.service.js';
import { sendMail, isEmailConfigured } from './email.service.js';

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

// req.user is { id, role, user } — the display name lives on the user doc.
function actorName(actor) {
  return actor?.user?.name || actor?.name || '';
}

function pushHistory(lead, actor, type, summary) {
  lead.history.push({
    type,
    summary,
    by: actor?.id,
    byName: actorName(actor) || undefined,
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
    createdByName: actorName(actor) || undefined,
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
  if (kit.agreementFile?.fileId) {
    await deleteGridFSFile(kit.agreementFile.fileId);
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

/** Reads a GridFS file fully into a buffer (for email attachments). */
async function readGridFSFileBuffer(fileId) {
  const stream = getKitFilesBucket().openDownloadStream(
    new mongoose.Types.ObjectId(String(fileId))
  );
  const chunks = [];
  for await (const chunk of stream) chunks.push(chunk);
  return Buffer.concat(chunks);
}

export async function sendKitEmail(kitId, payload, actor, req) {
  const { kit, lead } = await loadKitScoped(kitId, actor);
  const docType = kit.kitType === 'corporate' ? 'proposal' : payload.docType || 'proposal';

  // Send from the exec's linked official mailbox when available; otherwise
  // fall back to the shared SMTP_* account from the environment.
  const senderName = actorName(actor);
  const linked = actor?.user?.emailSender;
  let account;
  let from;
  let fromAddress;
  if (linked?.email && linked?.passEnc) {
    account = {
      host: linked.host,
      port: linked.port,
      secure: linked.secure,
      user: linked.email,
      pass: decryptSecret(linked.passEnc),
    };
    from = senderName ? `"${senderName}" <${linked.email}>` : linked.email;
    fromAddress = linked.email;
  } else if (!isEmailConfigured()) {
    throw new AppError(
      'No sending mailbox is linked to your account. Open the user menu → Email settings to link your official email ID.',
      503,
      'EMAIL_NOT_CONFIGURED'
    );
  }

  const useUploaded = payload.attachment === 'uploaded';
  let attachment;
  if (useUploaded) {
    if (!kit.agreementFile) {
      throw new AppError(
        'No uploaded agreement on this kit — upload one first or send the generated document.',
        422,
        'NO_UPLOADED_AGREEMENT'
      );
    }
    attachment = {
      filename: kit.agreementFile.filename,
      content: await readGridFSFileBuffer(kit.agreementFile.fileId),
      contentType: kit.agreementFile.contentType,
    };
  } else {
    const { buffer, filename, contentType } = await buildKitPdf(kit, docType);
    attachment = { filename, content: buffer, contentType };
  }

  // Clients always receive PDFs — Word documents (the generated corporate
  // letter or an uploaded edited agreement) are converted before sending.
  if (attachment.contentType !== 'application/pdf') {
    attachment = {
      filename: `${attachment.filename.replace(/\.[^./\\]+$/, '')}.pdf`,
      content: await convertWordToPdf(attachment.content, attachment.filename),
      contentType: 'application/pdf',
    };
  }

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
    `Dear Guest,\n\nGreetings from Centre Point Hotels & Resorts!\n\nPlease find attached the ${docName.toLowerCase()} for your kind perusal. We look forward to hosting you.\n\nWarm regards,\n${senderName || 'Centre Point Hotels & Resorts'}`;

  const logEntry = {
    to: payload.to,
    cc: payload.cc,
    subject,
    docType,
    from: fromAddress,
    sentBy: actor?.id,
    sentByName: senderName || undefined,
  };

  try {
    await sendMail({
      to: payload.to,
      cc: payload.cc,
      subject,
      text,
      attachments: [attachment],
      account,
      from,
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

  pushHistory(
    lead,
    actor,
    'proposal_sent',
    `${docName}${useUploaded ? ' (uploaded copy)' : ''} emailed to ${payload.to}`
  );
  await lead.save();

  await writeAudit({
    req,
    actor,
    action: 'kit.email',
    entityType: 'Kit',
    entityId: kit._id,
    summary: `Emailed ${docName}${useUploaded ? ' (uploaded copy)' : ''} to ${payload.to} (lead ${lead.reference})`,
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
      uploadedByName: actorName(actor) || undefined,
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

/* --------------------------- Uploaded agreement ---------------------------- */

// Word only: the exec edits the agreement in Word; it is converted to PDF
// when emailed to the client.
const ALLOWED_AGREEMENT_TYPES = new Set([
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
]);

export async function setAgreementFile(kitId, file, actor, req) {
  if (!file) throw new AppError('No file uploaded', 400, 'NO_FILES');
  if (!ALLOWED_AGREEMENT_TYPES.has(file.mimetype)) {
    throw new AppError(
      `Unsupported file type: ${file.mimetype}. Upload a Word document (DOC/DOCX).`,
      422,
      'UNSUPPORTED_FILE_TYPE'
    );
  }

  const { kit, lead } = await loadKitScoped(kitId, actor);

  // A kit keeps a single working agreement — re-uploading replaces it.
  if (kit.agreementFile?.fileId) {
    await deleteGridFSFile(kit.agreementFile.fileId);
  }

  const fileId = await uploadBufferToGridFS(
    file.buffer,
    file.originalname,
    file.mimetype
  );
  kit.agreementFile = {
    fileId,
    filename: file.originalname,
    contentType: file.mimetype,
    size: file.size,
    uploadedBy: actor?.id,
    uploadedByName: actorName(actor) || undefined,
  };
  await kit.save();

  pushHistory(
    lead,
    actor,
    'agreement_uploaded',
    `Edited agreement uploaded (${file.originalname}) for ${kitLabel(kit)}`
  );
  await lead.save();

  await writeAudit({
    req,
    actor,
    action: 'kit.agreement_upload',
    entityType: 'Kit',
    entityId: kit._id,
    summary: `Uploaded agreement ${file.originalname} for lead ${lead.reference}`,
  });

  return kit;
}

export async function getAgreementFile(kitId, actor) {
  const { kit } = await loadKitScoped(kitId, actor);
  const meta = kit.agreementFile;
  if (!meta) throw new AppError('File not found', 404, 'NOT_FOUND');
  const stream = getKitFilesBucket().openDownloadStream(
    new mongoose.Types.ObjectId(String(meta.fileId))
  );
  return { meta, stream };
}

export async function removeAgreementFile(kitId, actor, req) {
  const { kit, lead } = await loadKitScoped(kitId, actor);
  if (!kit.agreementFile) throw new AppError('File not found', 404, 'NOT_FOUND');

  const removed = kit.agreementFile;
  await deleteGridFSFile(removed.fileId);
  kit.agreementFile = undefined;
  await kit.save();

  await writeAudit({
    req,
    actor,
    action: 'kit.agreement_delete',
    entityType: 'Kit',
    entityId: kit._id,
    summary: `Removed uploaded agreement ${removed.filename} (lead ${lead.reference})`,
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
  setAgreementFile,
  getAgreementFile,
  removeAgreementFile,
};
