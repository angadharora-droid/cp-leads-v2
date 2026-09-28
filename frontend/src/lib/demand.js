/**
 * Demand dates and session revenue targets (Banquet Setup). A date's demand
 * level — normal, high or peak — picks which of a session's targets applies.
 * Dates are compared as calendar days (yyyy-mm-dd), the way the pipeline
 * stores them (UTC midnight).
 */

export const DEMAND_LABELS = { normal: 'Normal demand', high: 'High demand', peak: 'Peak demand' };

function dayKey(value) {
  if (!value) return '';
  if (typeof value === 'string' && /^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(value)) return value;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? '' : d.toISOString().slice(0, 10);
}

/** The demand period covering a date, the busiest one if they overlap. */
export function demandFor(date, demandDates = []) {
  const key = dayKey(date);
  if (!key) return null;
  let found = null;
  for (const period of demandDates || []) {
    if (dayKey(period.from) <= key && key <= dayKey(period.to)) {
      if (!found || (period.level === 'peak' && found.level !== 'peak')) found = period;
    }
  }
  return found;
}

export function demandLevel(date, demandDates = []) {
  return demandFor(date, demandDates)?.level || 'normal';
}

/** A session's target at a demand level (the normal target when that level has none). */
export function sessionTarget(session, level = 'normal') {
  const targets = session?.targets || {};
  return Number(targets[level]) || Number(targets.normal) || 0;
}

/** The target for one function: the sum over the sessions it holds on its date. */
export function functionTarget(fn, sessions = [], demandDates = []) {
  const level = demandLevel(fn?.date, demandDates);
  const byId = new Map((sessions || []).map((s) => [String(s._id), s]));
  const held = (fn?.sessions || []).map((s) => byId.get(String(s?._id || s))).filter(Boolean);
  const target = held.reduce((sum, s) => sum + sessionTarget(s, level), 0);
  return { level, target, sessions: held, period: demandFor(fn?.date, demandDates) };
}
