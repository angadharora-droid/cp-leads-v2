/**
 * Helpers for reading a banquet function off an enquiry.
 *
 * A function is held in a primary `venue` plus any `addOnRooms`, for one or
 * more sessions; `venues` is always primary + add-on rooms in that order.
 * Its options (type, menu, add-ons, liquor) are populated documents from
 * Banquet Setup. Enquiries created before the multi-select form hold a
 * single `venue`/`session` and a free-text `name`/`rate`, so every helper
 * falls back to those.
 */

/** Printed label: the function type, or the legacy free-text name. */
export function fnLabel(fn) {
  return fn?.functionType?.name || fn?.name || 'Function';
}

/** Every venue held — the primary first, then add-on rooms. */
export function fnVenues(fn) {
  const list = (fn?.venues || []).filter(Boolean);
  return list.length ? list : [fn?.venue, ...(fn?.addOnRooms || [])].filter(Boolean);
}

/** The primary venue (populated), if any. */
export function fnPrimaryVenue(fn) {
  return fnVenues(fn)[0] || null;
}

/** Add-on rooms held alongside the primary venue (populated). */
export function fnAddOnRooms(fn) {
  return fnVenues(fn).slice(1);
}

/** Populated sessions, newest shape first. */
export function fnSessions(fn) {
  const list = (fn?.sessions || []).filter(Boolean);
  return list.length ? list : [fn?.session].filter(Boolean);
}

/** "Primary venue" or "Primary venue (add-on rooms: A, B)". */
export function fnVenueNames(fn) {
  const [primary, ...addOns] = fnVenues(fn).map((v) => v?.name).filter(Boolean);
  if (!primary) return '';
  return addOns.length ? `${primary} (add-on rooms: ${addOns.join(', ')})` : primary;
}

export function fnSessionNames(fn) {
  return fnSessions(fn)
    .map((s) => s?.name)
    .filter(Boolean)
    .join(', ');
}

/** Menu, add-ons and liquor as one readable line. */
export function fnMenuSummary(fn) {
  const parts = [];
  if (fn?.menuType?.name) parts.push(fn.menuType.name);
  for (const item of fn?.addOns || []) if (item?.name) parts.push(item.name);
  for (const item of fn?.liquor || []) if (item?.name) parts.push(item.name);
  for (const item of fn?.requirements || []) if (item?.name) parts.push(item.name);
  if (fn?.additionalRequirement) parts.push(fn.additionalRequirement);
  return parts.join(' · ');
}

/** What is being offered for this function, in rupees. */
export function fnAmount(fn) {
  return Number(fn?.proposedRate ?? fn?.rackRate ?? 0) || 0;
}

/** Formatted amount, falling back to the legacy free-text rate. */
export function fnAmountLabel(fn) {
  const amount = fnAmount(fn);
  if (amount) return `Rs. ${amount.toLocaleString('en-IN')}`;
  return fn?.rate || '';
}

/** How many calendar slots the function occupies. */
export function fnSlotCount(fn) {
  return fnVenues(fn).length * fnSessions(fn).length;
}
