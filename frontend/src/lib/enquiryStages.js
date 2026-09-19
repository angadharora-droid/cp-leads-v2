/**
 * The unified enquiry pipeline. Stages advance from actions —
 * create → generate proposal → email the contract — and the manual moves are
 * Won (advance received, or PPS on one-time credit), Lost, and Cancelled (a
 * provisional or confirmed booking the client backed out of). Waitlist is
 * a holding column: the slot is held by another enquiry; the enquiry drops
 * back to its real stage the moment the slot frees.
 */
export const ENQUIRY_STAGES = [
  {
    key: 'enquiry',
    label: 'Enquiry',
    color: '#64748b',
    hint: 'New enquiry — nothing sent yet',
  },
  {
    key: 'proposal',
    label: 'Proposal',
    color: '#2563eb',
    hint: 'Proposal generated / emailed — client considering',
  },
  {
    key: 'waitlist',
    label: 'Waitlist',
    color: '#d97706',
    hint: 'Slot held by another enquiry — waiting for it to free up',
  },
  {
    key: 'provisional',
    label: 'Provisional',
    color: '#9333ea',
    hint: 'Contract sent — awaiting the advance',
  },
  {
    key: 'won',
    label: 'Won',
    color: '#16a34a',
    hint: 'Advance received or credit approved — booking confirmed',
  },
  {
    key: 'lost',
    label: 'Lost',
    color: '#dc2626',
    hint: 'Enquiry dropped',
  },
  {
    key: 'cancelled',
    label: 'Cancelled',
    color: '#9f1239',
    hint: 'Booking cancelled after the contract went out or it was confirmed',
  },
];

/** Stages nothing more happens in. */
export const CLOSED_STAGE_KEYS = ['won', 'lost', 'cancelled'];

export const STAGE_MAP = Object.fromEntries(ENQUIRY_STAGES.map((s) => [s.key, s]));

export const ACTIVE_STAGE_KEYS = ['enquiry', 'proposal', 'waitlist', 'provisional', 'won'];

export function stageInfo(key) {
  return STAGE_MAP[key] || { key, label: key || 'Unknown', color: '#64748b', hint: '' };
}

/** The hotel's lost reasons — the same list the API accepts. */
export const LOST_REASONS = [
  { code: 'no_response', label: 'No response from client' },
  { code: 'event_cancelled', label: 'Event cancelled' },
  { code: 'rooms_unavailable', label: 'Rooms not available' },
  { code: 'low_budget', label: 'Low on budget' },
  { code: 'venue_unavailable', label: 'Unavailability of venue' },
  { code: 'booked_other_venue', label: 'Booked another venue' },
  { code: 'booked_competitor', label: 'Booked competition hotel' },
  { code: 'date_passed', label: 'Date passed without confirmation' },
  { code: 'other', label: 'Other' },
];

/** Why a provisional or confirmed booking was cancelled — the same list the API accepts. */
export const CANCEL_REASONS = [
  { code: 'client_cancelled', label: 'Client cancelled the event' },
  { code: 'postponed', label: 'Event postponed' },
  { code: 'budget_cut', label: 'Budget cut' },
  { code: 'booked_other_venue', label: 'Booked another venue' },
  { code: 'advance_not_received', label: 'Advance not received' },
  { code: 'force_majeure', label: 'Force majeure' },
  { code: 'other', label: 'Other' },
];

/** What became of an advance already received when the booking was cancelled. */
export const ADVANCE_OUTCOMES = [
  { key: 'refunded', label: 'Refunded' },
  { key: 'forfeited', label: 'Forfeited' },
  { key: 'adjusted', label: 'Adjusted against another booking' },
];

export function advanceOutcomeLabel(key) {
  return ADVANCE_OUTCOMES.find((o) => o.key === key)?.label || key || '';
}

function startOfToday() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

/** Latest function date on the enquiry (or the room check-out), as a Date. */
export function lastEventDate(enquiry) {
  const dates = (enquiry?.functions || [])
    .map((fn) => (fn?.date ? new Date(fn.date) : null))
    .filter((d) => d && !Number.isNaN(d.getTime()));
  if (!dates.length && enquiry?.room?.checkOut) {
    const d = new Date(enquiry.room.checkOut);
    if (!Number.isNaN(d.getTime())) return d;
  }
  return dates.length ? new Date(Math.max(...dates)) : null;
}

/** True when every date has gone by and the enquiry was never won, lost or cancelled. */
export function isDatePassed(enquiry) {
  if (!enquiry || CLOSED_STAGE_KEYS.includes(enquiry.stage)) return false;
  const last = lastEventDate(enquiry);
  return Boolean(last) && last < startOfToday();
}

/** How the advance was paid, as offered in the "Mark as won" dialog. */
export const ADVANCE_MODES = [
  { key: 'cash', label: 'Cash' },
  { key: 'upi', label: 'UPI' },
  { key: 'neft', label: 'NEFT / RTGS / IMPS' },
  { key: 'cheque', label: 'Cheque' },
  { key: 'card', label: 'Card' },
  { key: 'other', label: 'Other' },
];

export function advanceModeLabel(key) {
  return ADVANCE_MODES.find((m) => m.key === key)?.label || key || '';
}

/** The edit button's name follows the document the client holds. */
export function editLabelFor(enquiry) {
  if (enquiry?.contract?.number) return 'Edit contract';
  if (enquiry?.proposal?.number) return 'Edit proposal';
  return 'Edit enquiry';
}
