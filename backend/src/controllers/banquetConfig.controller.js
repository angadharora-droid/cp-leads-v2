import asyncHandler from '../utils/asyncHandler.js';
import { sendOk } from '../utils/apiResponse.js';
import * as configService from '../services/banquetConfig.service.js';

export const getConfig = asyncHandler(async (_req, res) => {
  const result = await configService.getConfig();
  return sendOk(res, result);
});

export const updateSettings = asyncHandler(async (req, res) => {
  const settings = await configService.updateSettings(req.body, req.user, req);
  return sendOk(res, { settings });
});

export const createCatalogItem = asyncHandler(async (req, res) => {
  const item = await configService.createCatalogItem(req.body, req.user, req);
  return sendOk(res, { item }, 201);
});

export const updateCatalogItem = asyncHandler(async (req, res) => {
  const item = await configService.updateCatalogItem(req.params.itemId, req.body, req.user, req);
  return sendOk(res, { item });
});

export const removeCatalogItem = asyncHandler(async (req, res) => {
  const result = await configService.deleteCatalogItem(req.params.itemId, req.user, req);
  return sendOk(res, result);
});

export const createVenue = asyncHandler(async (req, res) => {
  const venue = await configService.createVenue(req.body, req.user, req);
  return sendOk(res, { venue }, 201);
});

export const updateVenue = asyncHandler(async (req, res) => {
  const venue = await configService.updateVenue(req.params.venueId, req.body, req.user, req);
  return sendOk(res, { venue });
});

export const deleteVenue = asyncHandler(async (req, res) => {
  const result = await configService.deleteVenue(req.params.venueId, req.user, req);
  return sendOk(res, result);
});

export const createSession = asyncHandler(async (req, res) => {
  const session = await configService.createSession(req.body, req.user, req);
  return sendOk(res, { session }, 201);
});

export const updateSession = asyncHandler(async (req, res) => {
  const session = await configService.updateSession(req.params.sessionId, req.body, req.user, req);
  return sendOk(res, { session });
});

export const deleteSession = asyncHandler(async (req, res) => {
  const result = await configService.deleteSession(req.params.sessionId, req.user, req);
  return sendOk(res, result);
});

export default {
  getConfig,
  updateSettings,
  createCatalogItem,
  updateCatalogItem,
  removeCatalogItem,
  createVenue,
  updateVenue,
  deleteVenue,
  createSession,
  updateSession,
  deleteSession,
};
