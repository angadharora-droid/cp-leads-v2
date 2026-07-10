import mongoose from 'mongoose';

const { Schema, model } = mongoose;

const auditLogSchema = new Schema(
  {
    actor: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    actorEmail: { type: String, default: '' },
    action: { type: String, required: true, index: true },
    entityType: { type: String },
    entityId: { type: String },
    summary: { type: String },
    meta: { type: Schema.Types.Mixed },
    ip: { type: String },
    userAgent: { type: String },
  },
  { timestamps: true }
);

auditLogSchema.index({ createdAt: -1 });

const AuditLog = model('AuditLog', auditLogSchema);

export default AuditLog;
