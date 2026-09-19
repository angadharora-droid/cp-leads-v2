import asyncHandler from '../utils/asyncHandler.js';
import { sendOk } from '../utils/apiResponse.js';
import * as notifications from '../services/notification.service.js';

/** GET /api/notifications?page&limit&unread -> { items, total, page, limit, unreadCount } */
export const list = asyncHandler(async (req, res) => {
  const { page, limit, unread } = req.query;
  const result = await notifications.listNotifications(req.user, { page, limit, unread: unread === 'true' });
  return sendOk(res, result);
});

/** GET /api/notifications/unread-count -> { count, latestAt } */
export const unreadCount = asyncHandler(async (req, res) => {
  return sendOk(res, await notifications.countUnread(req.user));
});

/** POST /api/notifications/:id/read -> { notification } */
export const read = asyncHandler(async (req, res) => {
  const notification = await notifications.markRead(req.user, req.params.id);
  return sendOk(res, { notification });
});

/** POST /api/notifications/read-all -> { updated } */
export const readAll = asyncHandler(async (req, res) => {
  return sendOk(res, await notifications.markAllRead(req.user));
});

export default { list, unreadCount, read, readAll };
