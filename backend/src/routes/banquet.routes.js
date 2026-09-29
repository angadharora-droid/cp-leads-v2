import { Router } from 'express';

import { authenticate } from '../middleware/auth.js';
import { requireRole } from '../middleware/rbac.js';
import { validate } from '../middleware/validate.js';

import * as configController from '../controllers/banquetConfig.controller.js';
import * as enquiryController from '../controllers/enquiry.controller.js';

import {
  venueSchema,
  venueUpdateSchema,
  sessionSchema,
  sessionUpdateSchema,
  settingsSchema,
  catalogSchema,
  catalogUpdateSchema,
  copySetupSchema,
  bulkAddSchema,
} from '../validation/banquetConfig.validation.js';
import { calendarQuerySchema, calendarSheetQuerySchema, configQuerySchema } from '../validation/enquiry.validation.js';

const router = Router();

router.use(authenticate);

// One property's venues + sessions + menus + slot rule in one call (used by forms and the calendar).
router.get('/config', validate(configQuerySchema, 'query'), configController.getConfig);

// Availability calendar feed — visible to every signed-in user.
router.get('/calendar', validate(calendarQuerySchema, 'query'), enquiryController.calendar);

// Rooms held night by night on a property with rooms (CPA for now).
router.get('/room-calendar', validate(calendarQuerySchema, 'query'), enquiryController.roomCalendar);

// The same grid as an Excel workbook, and as a landscape PDF to print.
router.get('/calendar/export', validate(calendarSheetQuerySchema, 'query'), enquiryController.calendarExport);
router.get('/calendar/print', validate(calendarSheetQuerySchema, 'query'), enquiryController.calendarPrint);

/* ------------------------- Admin-only configuration ------------------------ */

// Copy one property's venues, sessions, menus (and rules) into other properties.
router.post('/copy', requireRole('admin'), validate(copySetupSchema), configController.copySetup);

// Many venues, sessions or menu options for one property at once.
router.post('/bulk', requireRole('admin'), validate(bulkAddSchema), configController.bulkAdd);

router.put(
  '/settings',
  requireRole('admin'),
  validate(settingsSchema),
  configController.updateSettings
);

router.post('/venues', requireRole('admin'), validate(venueSchema), configController.createVenue);

router.patch(
  '/venues/:venueId',
  requireRole('admin'),
  validate(venueUpdateSchema),
  configController.updateVenue
);

router.delete('/venues/:venueId', requireRole('admin'), configController.deleteVenue);

router.post(
  '/sessions',
  requireRole('admin'),
  validate(sessionSchema),
  configController.createSession
);

router.patch(
  '/sessions/:sessionId',
  requireRole('admin'),
  validate(sessionUpdateSchema),
  configController.updateSession
);

router.delete('/sessions/:sessionId', requireRole('admin'), configController.deleteSession);

/* --- Function types, menu types, add-on menus and liquor packages --------- */

router.post(
  '/catalog',
  requireRole('admin'),
  validate(catalogSchema),
  configController.createCatalogItem
);

router.patch(
  '/catalog/:itemId',
  requireRole('admin'),
  validate(catalogUpdateSchema),
  configController.updateCatalogItem
);

router.delete('/catalog/:itemId', requireRole('admin'), configController.removeCatalogItem);

export default router;
