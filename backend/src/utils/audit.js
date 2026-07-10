import AuditLog from '../models/AuditLog.js';

/**
 * Writes an audit log entry. Never throws — failures are swallowed and logged.
 * @param {object} opts
 * @param {object} [opts.req] - Express request (used to derive ip/userAgent + actor fallback).
 * @param {object} [opts.actor] - Acting user document or { id, email }.
 * @param {string} opts.action - Audit action key (required).
 * @param {string} [opts.entityType]
 * @param {string|object} [opts.entityId]
 * @param {string} [opts.summary]
 * @param {object} [opts.meta]
 */
export async function writeAudit({
  req,
  actor,
  action,
  entityType,
  entityId,
  summary,
  meta,
} = {}) {
  try {
    const reqActor = req?.user?.user || req?.user;
    const resolvedActor = actor || reqActor;

    const actorId =
      resolvedActor?._id || resolvedActor?.id || req?.user?.id || null;
    const actorEmail =
      resolvedActor?.email || req?.user?.user?.email || '';

    const ip =
      req?.headers?.['x-forwarded-for']?.split(',')[0]?.trim() ||
      req?.ip ||
      req?.socket?.remoteAddress ||
      '';
    const userAgent = req?.headers?.['user-agent'] || '';

    await AuditLog.create({
      actor: actorId || undefined,
      actorEmail,
      action,
      entityType,
      entityId: entityId != null ? String(entityId) : undefined,
      summary,
      meta,
      ip,
      userAgent,
    });
  } catch (err) {
    console.error('[audit] failed to write audit log:', err?.message || err);
  }
}

export default writeAudit;
