/**
 * Sections of the app, assigned per user on the Users page. Admins open
 * everything; an account with no assignment is a Leads CRM user.
 */
export const MODULES = [
  { key: 'leads', label: 'Leads CRM', hint: 'Leads, enquiries, rate contracts, calendar, reports' },
  { key: 'prospectus', label: 'Function Prospectus', hint: 'Prospectus sheets for confirmed functions' },
  { key: 'estimates', label: 'Banquet Estimate', hint: 'Finance estimates raised from prospectus sheets' },
];

export const MODULE_KEYS = MODULES.map((m) => m.key);

/** Where each section starts, used for the cross-links and the landing page. */
export const MODULE_HOME = {
  leads: '/',
  prospectus: '/prospectus',
  estimates: '/estimates',
};

export function userModules(user) {
  if (!user) return [];
  if (user.role === 'admin') return MODULE_KEYS;
  return user.modules?.length ? user.modules : ['leads'];
}

export function hasModule(user, key) {
  return userModules(user).includes(key);
}

/** Where a user lands after signing in: the first section they hold. */
export function homeFor(user) {
  const mine = userModules(user);
  const first = MODULE_KEYS.find((key) => mine.includes(key));
  return MODULE_HOME[first] || '/';
}

export function moduleLabel(key) {
  return MODULES.find((m) => m.key === key)?.label || key;
}
