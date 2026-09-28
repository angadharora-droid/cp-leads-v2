/**
 * Special menu items: dishes added to a function's menu that are not in the
 * Banquet Setup catalog (a family recipe, a live counter the client asked
 * for). Each carries its own name and rate, per guest or flat, and is
 * priced as offered — there is no rack rate to compare it with.
 */

export const SPECIAL_PRICING = ['per_pax', 'flat'];

/** Cleans what the form sends: named items only, whole rupees. */
export function cleanSpecialItems(list) {
  return (list || [])
    .map((item) => ({
      name: String(item?.name || '').trim(),
      rate: Math.max(0, Math.round(Number(item?.rate) || 0)),
      pricing: item?.pricing === 'flat' ? 'flat' : 'per_pax',
    }))
    .filter((item) => item.name);
}

/**
 * The special items shaped like catalog add-on menus, so documents that list
 * a function's menu and add-ons print them the same way. The ids are not
 * catalog ids, so no offered line rate ever matches them.
 */
export function specialAsItems(fn) {
  return (fn?.specialItems || [])
    .filter((item) => item?.name)
    .map((item, index) => ({
      _id: `special-${index}`,
      name: item.name,
      rate: Number(item.rate) || 0,
      pricing: item.pricing === 'flat' ? 'flat' : 'per_pax',
      kind: 'addOn',
      special: true,
    }));
}
