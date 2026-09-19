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
} from '../validation/banquetConfig.validation.js';
import { calendarQuerySchema } from '../validation/enquiry.validation.js';

const router = Router();

router.use(authenticate);

// Venues + sessions + slot rule in one call (used by forms and the calendar).
router.get('/config', configController.getConfig);

// Availability calendar feed — visible to every signed-in user.
router.get('/calendar', validate(calendarQuerySchema, 'query'), enquiryController.calendar);

/* ------------------------- Admin-only configuration ------------------------ */

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
