import mongoose from 'mongoose';

const { Schema, model } = mongoose;

/**
 * One in-app notification for one user. A movement that concerns several
 * people is stored once per recipient, so each reads and clears their own.
 * Reminders (follow-ups due or overdue) carry a dedupeKey so the sweep that
 * raises them can run as often as it likes without repeating itself.
 */
const notificationSchema = new Schema(
  {
    user: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    // e.g. enquiry.stage, enquiry.won, document.sent, follow_up.overdue
    type: { type: String, required: true },
    title: { type: String, required: true },
    body: { type: String, default: '' },
    // In-app path the notification opens, e.g. /enquiries/<id>.
    link: { type: String, default: '' },
    entityType: { type: String, default: '' },
    entityId: { type: String, default: '' },
    actor: { type: Schema.Types.ObjectId, ref: 'User' },
    actorName: { type: String, default: '' },
    readAt: { type: Date, default: null },
    dedupeKey: { type: String },
  },
  { timestamps: true }
);

notificationSchema.index({ user: 1, createdAt: -1 });
notificationSchema.index({ user: 1, readAt: 1 });
notificationSchema.index(
  { user: 1, dedupeKey: 1 },
  { unique: true, partialFilterExpression: { dedupeKey: { $type: 'string' } } }
);
// Ninety days is plenty for a feed; the audit log keeps the permanent trail.
notificationSchema.index({ createdAt: 1 }, { expireAfterSeconds: 90 * 24 * 60 * 60 });

const Notification = model('Notification', notificationSchema);

export default Notification;
