import asyncHandler from '../utils/asyncHandler.js';
import { sendOk } from '../utils/apiResponse.js';
import * as kitService from '../services/kit.service.js';

export const listForLead = asyncHandler(async (req, res) => {
  const result = await kitService.listKitsForLead(req.params.id, req.user);
  return sendOk(res, result);
});

export const create = asyncHandler(async (req, res) => {
  const kit = await kitService.createKit(req.params.id, req.body, req.user, req);
  return sendOk(res, { kit }, 201);
});

export const getOne = asyncHandler(async (req, res) => {
  const kit = await kitService.getKit(req.params.kitId, req.user);
  return sendOk(res, { kit });
});

export const update = asyncHandler(async (req, res) => {
  const kit = await kitService.updateKit(req.params.kitId, req.body, req.user, req);
  return sendOk(res, { kit });
});

export const remove = asyncHandler(async (req, res) => {
  const result = await kitService.deleteKit(req.params.kitId, req.user, req);
  return sendOk(res, result);
});

export const downloadPdf = asyncHandler(async (req, res) => {
  const { buffer, filename } = await kitService.generateKitPdf(
    req.params.kitId,
    req.query.doc || 'proposal',
    req.user
  );
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader(
    'Content-Disposition',
    `attachment; filename="${encodeURIComponent(filename)}"`
  );
  return res.send(buffer);
});

export const sendEmail = asyncHandler(async (req, res) => {
  const kit = await kitService.sendKitEmail(req.params.kitId, req.body, req.user, req);
  return sendOk(res, { kit });
});

export const uploadConfirmation = asyncHandler(async (req, res) => {
  const kit = await kitService.addConfirmationFiles(
    req.params.kitId,
    req.files,
    req.user,
    req
  );
  return sendOk(res, { kit }, 201);
});

export const downloadConfirmationFile = asyncHandler(async (req, res) => {
  const { meta, stream } = await kitService.getConfirmationFile(
    req.params.kitId,
    req.params.fileId,
    req.user
  );
  res.setHeader('Content-Type', meta.contentType || 'application/octet-stream');
  res.setHeader(
    'Content-Disposition',
    `inline; filename="${encodeURIComponent(meta.filename)}"`
  );
  stream.on('error', () => {
    if (!res.headersSent) res.status(404);
    res.end();
  });
  return stream.pipe(res);
});

export const removeConfirmationFile = asyncHandler(async (req, res) => {
  const kit = await kitService.removeConfirmationFile(
    req.params.kitId,
    req.params.fileId,
    req.user,
    req
  );
  return sendOk(res, { kit });
});

export default {
  listForLead,
  create,
  getOne,
  update,
  remove,
  downloadPdf,
  sendEmail,
  uploadConfirmation,
  downloadConfirmationFile,
  removeConfirmationFile,
};
