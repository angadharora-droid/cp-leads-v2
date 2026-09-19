import { Router } from 'express';

import { authenticate } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import * as controller from '../controllers/notification.controller.js';
import { listNotificationsQuerySchema } from '../validation/notification.validation.js';

const router = Router();

// Every account has a feed, whatever sections it holds.
router.use(authenticate);

router.get('/', validate(listNotificationsQuerySchema, 'query'), controller.list);
router.get('/unread-count', controller.unreadCount);
router.post('/read-all', controller.readAll);
router.post('/:id/read', controller.read);

export default router;
