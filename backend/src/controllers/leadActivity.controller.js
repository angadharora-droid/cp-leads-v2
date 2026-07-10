import asyncHandler from '../utils/asyncHandler.js';
import { sendOk } from '../utils/apiResponse.js';
import * as activityService from '../services/leadActivity.service.js';

/* ----------------------------- Notes ----------------------------- */

export const addNote = asyncHandler(async (req, res) => {
  const lead = await activityService.addNote(
    req.params.id,
    req.body.body,
    req.user,
    req
  );
  return sendOk(res, { lead }, 201);
});

export const editNote = asyncHandler(async (req, res) => {
  const lead = await activityService.editNote(
    req.params.id,
    req.params.noteId,
    req.body.body,
    req.user,
    req
  );
  return sendOk(res, { lead });
});

export const deleteNote = asyncHandler(async (req, res) => {
  const lead = await activityService.deleteNote(
    req.params.id,
    req.params.noteId,
    req.user,
    req
  );
  return sendOk(res, { lead });
});

/* ------------------------- Action points ------------------------- */

export const addActionPoint = asyncHandler(async (req, res) => {
  const lead = await activityService.addActionPoint(
    req.params.id,
    req.body.text,
    req.user,
    req
  );
  return sendOk(res, { lead }, 201);
});

export const clearActionPoint = asyncHandler(async (req, res) => {
  const lead = await activityService.clearActionPoint(
    req.params.id,
    req.params.apId,
    req.user,
    req
  );
  return sendOk(res, { lead });
});

/* --------------------------- Follow-ups -------------------------- */

export const scheduleFollowUp = asyncHandler(async (req, res) => {
  const lead = await activityService.scheduleFollowUp(
    req.params.id,
    { dueDate: req.body.dueDate, note: req.body.note },
    req.user,
    req
  );
  return sendOk(res, { lead }, 201);
});

export const closeFollowUp = asyncHandler(async (req, res) => {
  const lead = await activityService.closeFollowUp(
    req.params.id,
    req.params.fuId,
    req.body.closingNote,
    req.user,
    req
  );
  return sendOk(res, { lead });
});

/* -------------------------- Instructions ------------------------- */

export const issueInstruction = asyncHandler(async (req, res) => {
  const lead = await activityService.issueInstruction(
    req.params.id,
    req.body.text,
    req.user,
    req
  );
  return sendOk(res, { lead }, 201);
});

export const completeInstruction = asyncHandler(async (req, res) => {
  const lead = await activityService.completeInstruction(
    req.params.id,
    req.params.insId,
    req.user,
    req
  );
  return sendOk(res, { lead });
});

export default {
  addNote,
  editNote,
  deleteNote,
  addActionPoint,
  clearActionPoint,
  scheduleFollowUp,
  closeFollowUp,
  issueInstruction,
  completeInstruction,
};
