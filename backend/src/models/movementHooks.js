/**
 * "Something moved" detector for the pipeline models.
 *
 * A movement is a new record, or a change of its stage/status field,
 * whichever path saved it: a manual action, the waitlist engine freeing a
 * slot, or the client signing a contract. Hanging the detector on the schema
 * means no code path can forget to announce itself.
 *
 * The pre-save hook records what is about to change (isModified is reset
 * once the save completes). The post-save hook hands the saved document to
 * the notification service without holding up the save. The service is
 * loaded lazily because it looks up these very models.
 */

const recentStageNotices = new Map();
const STAGE_NOTICE_WINDOW_MS = 10 * 1000;

/**
 * Remembers that a stage notice just went out for an entity, so a document
 * event written moments later (the audit entry for the same action) does not
 * say the same thing twice.
 */
export function rememberStageNotice(key, at = Date.now()) {
  recentStageNotices.set(key, at);
  if (recentStageNotices.size > 1000) {
    for (const [k, t] of recentStageNotices) {
      if (at - t > STAGE_NOTICE_WINDOW_MS) recentStageNotices.delete(k);
    }
  }
}

export function hadRecentStageNotice(key, now = Date.now()) {
  const at = recentStageNotices.get(key);
  return at !== undefined && now - at < STAGE_NOTICE_WINDOW_MS;
}

/**
 * @param {import('mongoose').Schema} schema
 * @param {{ entityType: string, field: string }} config the stage/status field to watch
 */
export function attachMovementHooks(schema, { entityType, field }) {
  schema.pre('save', async function recordMovement() {
    this.$locals.movement = {
      isNew: this.isNew,
      changed: !this.isNew && this.isModified(field),
      // A service may name who is acting when the record itself does not say
      // (a prospectus edited back to draft, for instance).
      actorId: this.$locals.movementActor ? String(this.$locals.movementActor) : '',
    };
  });

  schema.post('save', function announceMovement(doc) {
    const movement = doc.$locals?.movement;
    if (doc.$locals) doc.$locals.movement = undefined;
    if (!movement || (!movement.isNew && !movement.changed)) return;
    if (movement.changed) rememberStageNotice(`${entityType}:${doc._id}`);
    import('../services/notification.service.js')
      .then(({ notifyModelMovement }) => notifyModelMovement(doc, { entityType, field, ...movement }))
      .catch((err) => {
        console.error(`[notify] ${entityType} movement failed:`, err?.message || err);
      });
  });
}

export default attachMovementHooks;
