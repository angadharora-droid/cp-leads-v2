import mongoose from 'mongoose';
import { z } from 'zod';

import Lead from '../models/Lead.js';
import { AppError } from '../utils/apiResponse.js';
import { writeAudit } from '../utils/audit.js';
import { isManager } from '../utils/access.js';
import { uploadBufferToGridFS, deleteGridFSFile, getKitFilesBucket } from '../utils/gridfs.js';
import { askForJson, isAiEnabled } from './ai.service.js';

/*
 * Company registration: the GST certificate and PAN card a manager attaches
 * when a company is registered. The documents are kept for reference; the
 * numbers on them are read by the Claude API (when a key is set up) and
 * filled in wherever the company has none yet. Numbers are always checked
 * against their official formats — GSTIN including its check digit — and a
 * GSTIN carries the PAN inside it (characters 3–12), so either fills the other.
 */

export const GSTIN_PATTERN = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/;
export const PAN_PATTERN = /^[A-Z]{5}[0-9]{4}[A-Z]$/;
const CHARSET = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';

/** The GSTIN check digit (15th character) for its first 14 characters. */
export function gstinCheckDigit(first14) {
  let sum = 0;
  for (let i = 0; i < 14; i += 1) {
    const value = CHARSET.indexOf(first14[i]);
    const product = value * (i % 2 === 0 ? 1 : 2);
    sum += Math.floor(product / 36) + (product % 36);
  }
  return CHARSET[(36 - (sum % 36)) % 36];
}

export function normalizeId(value) {
  return String(value || '')
    .toUpperCase()
    .replace(/[^0-9A-Z]/g, '');
}

/** '' when valid, otherwise why not. */
export function gstinProblem(value) {
  const gstin = normalizeId(value);
  if (!gstin) return '';
  if (!GSTIN_PATTERN.test(gstin)) return 'A GSTIN has 15 characters: state code, PAN, entity number, Z, check digit';
  if (gstinCheckDigit(gstin.slice(0, 14)) !== gstin[14]) return 'This GSTIN fails its check digit — check for a typo';
  return '';
}

export function panProblem(value) {
  const pan = normalizeId(value);
  if (!pan) return '';
  return PAN_PATTERN.test(pan) ? '' : 'A PAN is 5 letters, 4 digits and a letter (e.g. ABCDE1234F)';
}

/** The PAN inside a GSTIN (characters 3–12). */
export function panFromGstin(value) {
  const gstin = normalizeId(value);
  return GSTIN_PATTERN.test(gstin) ? gstin.slice(2, 12) : '';
}

const READABLE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'application/pdf']);
const ALLOWED_TYPES = new Set([...READABLE_TYPES, 'image/heic']);

const EXTRACTION_SCHEMA = {
  type: 'object',
  properties: {
    documentType: { type: 'string', enum: ['gst_certificate', 'pan_card', 'other'] },
    gstNumber: { type: 'string' },
    panNumber: { type: 'string' },
    legalName: { type: 'string' },
    tradeName: { type: 'string' },
    address: { type: 'string' },
  },
  required: ['documentType', 'gstNumber', 'panNumber', 'legalName', 'tradeName', 'address'],
  additionalProperties: false,
};

const extractionZod = z.object({
  documentType: z.enum(['gst_certificate', 'pan_card', 'other']),
  gstNumber: z.string(),
  panNumber: z.string(),
  legalName: z.string(),
  tradeName: z.string(),
  address: z.string(),
});

const EXTRACTION_PROMPT = `You read Indian tax registration documents for a hotel's sales team.
The document is either a GST registration certificate (Form GST REG-06) or a PAN card, possibly a phone photo or a scan.
Return exactly what is printed:
- gstNumber: the 15-character GSTIN, uppercase, no spaces ("" if none is printed).
- panNumber: the 10-character PAN, uppercase ("" if none is printed; do not derive it from the GSTIN).
- legalName: the legal name of the business / the name on the PAN card.
- tradeName: the trade name if printed, else "".
- address: the principal place of business on a GST certificate, else "".
Never guess a character you cannot read: leave that field "" instead.`;

/** Asks Claude to read the numbers off a GST certificate or PAN card. */
export async function extractFromDocument(buffer, contentType) {
  const data = buffer.toString('base64');
  const source = { type: 'base64', media_type: contentType, data };
  const block = contentType === 'application/pdf' ? { type: 'document', source } : { type: 'image', source };
  return askForJson({
    system: EXTRACTION_PROMPT,
    content: [block, { type: 'text', text: 'Read this document.' }],
    jsonSchema: EXTRACTION_SCHEMA,
    zodSchema: extractionZod,
    effort: 'low',
    maxTokens: 4000,
  });
}

function actorName(actor) {
  return actor?.user?.name || '';
}

async function loadCompany(leadId, actor, { manage = false } = {}) {
  if (!mongoose.isValidObjectId(leadId)) throw new AppError('Company not found', 404, 'NOT_FOUND');
  const lead = await Lead.findById(leadId);
  if (!lead) throw new AppError('Company not found', 404, 'NOT_FOUND');
  if (!isManager(actor) && String(lead.assignedTo || '') !== actor.id) {
    throw new AppError('Company not found', 404, 'NOT_FOUND');
  }
  if (lead.leadType === 'individual') {
    throw new AppError('Registration documents are kept for companies only', 422, 'NOT_A_COMPANY');
  }
  if (manage && !isManager(actor)) {
    throw new AppError('Only a manager can change a company’s registration', 403, 'FORBIDDEN');
  }
  return lead;
}

function registrationView(lead) {
  return {
    legalName: lead.legalName || '',
    gstNumber: lead.gstNumber || '',
    panNumber: lead.panNumber || '',
    registeredAddress: lead.registeredAddress || '',
    documents: (lead.registrationDocs || []).map((d) => (d.toObject ? d.toObject() : d)),
    problems: {
      gstNumber: gstinProblem(lead.gstNumber),
      panNumber: panProblem(lead.panNumber),
      mismatch:
        lead.gstNumber && lead.panNumber && panFromGstin(lead.gstNumber) && panFromGstin(lead.gstNumber) !== lead.panNumber
          ? 'The PAN inside the GSTIN does not match the PAN on record'
          : '',
    },
    aiEnabled: isAiEnabled(),
  };
}

export async function getRegistration(leadId, actor) {
  return registrationView(await loadCompany(leadId, actor));
}

/** Saves the registration numbers typed or corrected by a manager. */
export async function updateRegistration(leadId, body, actor, req) {
  const lead = await loadCompany(leadId, actor, { manage: true });
  if (body.gstNumber !== undefined) {
    const gstin = normalizeId(body.gstNumber);
    const problem = gstinProblem(gstin);
    if (problem) throw new AppError(problem, 422, 'INVALID_GSTIN');
    lead.gstNumber = gstin;
    if (!lead.panNumber && gstin) lead.panNumber = panFromGstin(gstin);
  }
  if (body.panNumber !== undefined) {
    const pan = normalizeId(body.panNumber);
    const problem = panProblem(pan);
    if (problem) throw new AppError(problem, 422, 'INVALID_PAN');
    lead.panNumber = pan;
  }
  if (body.legalName !== undefined) lead.legalName = String(body.legalName).trim();
  if (body.registeredAddress !== undefined) lead.registeredAddress = String(body.registeredAddress).trim();
  lead.history.push({
    type: 'registration',
    summary: `Registration updated${lead.gstNumber ? ` — GSTIN ${lead.gstNumber}` : ''}${lead.panNumber ? `, PAN ${lead.panNumber}` : ''}`,
    at: new Date(),
    by: actor.id,
    byName: actorName(actor),
  });
  await lead.save();
  await writeAudit({
    req,
    actor: actor.user,
    action: 'lead.registration.update',
    entityType: 'Lead',
    entityId: lead._id,
    summary: `Registration updated on ${lead.reference}`,
  });
  return registrationView(lead);
}

/**
 * Stores a GST certificate or PAN card and reads it. Numbers read off the
 * document fill the company's empty fields; ones that differ from what is on
 * record are returned for the manager to accept, never overwritten.
 */
export async function uploadRegistrationDoc(leadId, kind, file, actor, req) {
  const lead = await loadCompany(leadId, actor, { manage: true });
  if (!['gst', 'pan'].includes(kind)) throw new AppError('Say whether this is the GST certificate or the PAN card', 422, 'VALIDATION_ERROR');
  if (!file) throw new AppError('Attach the document', 422, 'VALIDATION_ERROR');
  if (!ALLOWED_TYPES.has(file.mimetype)) {
    throw new AppError('Attach a PDF or a photo (JPG, PNG, WebP)', 422, 'UNSUPPORTED_FILE');
  }

  let extracted = null;
  let readError = '';
  if (isAiEnabled() && READABLE_TYPES.has(file.mimetype)) {
    try {
      extracted = await extractFromDocument(file.buffer, file.mimetype);
    } catch (err) {
      readError = err?.message || 'The document could not be read';
    }
  } else if (!isAiEnabled()) {
    readError = 'Automatic reading is not set up — type the numbers in';
  } else {
    readError = 'This file type cannot be read automatically — type the numbers in';
  }

  const fileId = await uploadBufferToGridFS(file.buffer, file.originalname, file.mimetype);
  const gstRead = extracted ? normalizeId(extracted.gstNumber) : '';
  const panRead = extracted ? normalizeId(extracted.panNumber) || panFromGstin(gstRead) : '';
  const gstValid = gstRead && !gstinProblem(gstRead);
  const panValid = panRead && !panProblem(panRead);

  lead.registrationDocs.push({
    kind,
    fileId,
    filename: file.originalname,
    contentType: file.mimetype,
    size: file.size,
    extracted: extracted
      ? {
          gstNumber: gstRead,
          panNumber: panRead,
          legalName: extracted.legalName || '',
          address: extracted.address || '',
          readBy: 'ai',
        }
      : { readBy: '' },
    uploadedBy: actor.id,
    uploadedByName: actorName(actor),
  });

  // Fill what is empty; report what differs.
  const filled = [];
  const differs = {};
  if (gstValid) {
    if (!lead.gstNumber) {
      lead.gstNumber = gstRead;
      filled.push('GSTIN');
    } else if (lead.gstNumber !== gstRead) differs.gstNumber = gstRead;
  }
  if (panValid) {
    if (!lead.panNumber) {
      lead.panNumber = panRead;
      filled.push('PAN');
    } else if (lead.panNumber !== panRead) differs.panNumber = panRead;
  }
  if (extracted?.legalName) {
    if (!lead.legalName) {
      lead.legalName = extracted.legalName.trim();
      filled.push('legal name');
    } else if (lead.legalName !== extracted.legalName.trim()) differs.legalName = extracted.legalName.trim();
  }
  if (extracted?.address && !lead.registeredAddress) {
    lead.registeredAddress = extracted.address.trim();
    filled.push('address');
  }
  const unreadable = extracted && ((gstRead && !gstValid) || (extracted.panNumber && !panValid));
  lead.history.push({
    type: 'registration_doc',
    summary: `${kind === 'gst' ? 'GST certificate' : 'PAN card'} attached${filled.length ? `; filled ${filled.join(', ')}` : ''}`,
    at: new Date(),
    by: actor.id,
    byName: actorName(actor),
  });
  await lead.save();
  await writeAudit({
    req,
    actor: actor.user,
    action: 'lead.registration.document',
    entityType: 'Lead',
    entityId: lead._id,
    summary: `${kind === 'gst' ? 'GST certificate' : 'PAN card'} attached to ${lead.reference}`,
  });
  return {
    ...registrationView(lead),
    read: {
      ok: Boolean(extracted),
      filled,
      differs,
      error: readError || (unreadable ? 'Some characters could not be read reliably — check the numbers' : ''),
      documentType: extracted?.documentType || '',
    },
  };
}

export async function removeRegistrationDoc(leadId, docId, actor, req) {
  const lead = await loadCompany(leadId, actor, { manage: true });
  const doc = lead.registrationDocs.id(docId);
  if (!doc) throw new AppError('Document not found', 404, 'NOT_FOUND');
  const fileId = doc.fileId;
  doc.deleteOne();
  await lead.save();
  await deleteGridFSFile(fileId);
  await writeAudit({
    req,
    actor: actor.user,
    action: 'lead.registration.document_removed',
    entityType: 'Lead',
    entityId: lead._id,
    summary: `Registration document removed from ${lead.reference}`,
  });
  return registrationView(lead);
}

export async function openRegistrationDoc(leadId, docId, actor) {
  const lead = await loadCompany(leadId, actor);
  const doc = lead.registrationDocs.id(docId);
  if (!doc) throw new AppError('Document not found', 404, 'NOT_FOUND');
  return {
    stream: getKitFilesBucket().openDownloadStream(new mongoose.Types.ObjectId(String(doc.fileId))),
    filename: doc.filename || 'document',
    contentType: doc.contentType || 'application/octet-stream',
  };
}
