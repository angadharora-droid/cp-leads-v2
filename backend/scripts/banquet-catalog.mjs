/*
 * Hotel Centre Point Nagpur's banquet configuration — venues (list given by
 * the user, 2026-09-07), session timings from the 2026 menu packages, and the
 * catalog: event types from the Bingo Forge startup sheet, menu packages from
 * "NEW VEG 04 MENU PAKAGE 2026" / "NEW NON VEG PACKAGE NEW 2026" and
 * "BREAKFAST & HI-TEA MENU 2025", extras from the package sheets (per person)
 * and the startup sheet's banquet extras list (flat).
 *
 * Used by seed-demo.mjs (adds what is missing) and apply-banquet-catalog.mjs
 * (makes the database match this list exactly).
 */
// Hotel Centre Point Nagpur's banquet venues (list given by the user, 2026-09-07).
export const VENUES = [
  'Palacio A',
  'Palacio B',
  'Millenium',
  'Sammelan',
  'Bougainvillea',
  'Sapphire A',
  'Sapphire B',
  'Sapphire C',
  'Grand Millenium',
  'Hi Steak',
  'Golden',
  'Silver',
  'Board Room 1',
  'Board Room 2',
  'Board Room 3',
];

// Session timings printed on the 2026 menu packages.
export const SESSIONS = [
  { name: 'Breakfast', startTime: '08:00 AM', endTime: '10:30 AM', order: 1 },
  { name: 'Lunch', startTime: '11:00 AM', endTime: '04:00 PM', order: 2 },
  { name: 'High Tea', startTime: '03:00 PM', endTime: '05:30 PM', order: 3 },
  { name: 'Dinner', startTime: '07:00 PM', endTime: '11:30 PM', order: 4 },
  { name: 'Late Night Phere', startTime: '01:00 AM', endTime: '05:00 AM', order: 5 },
];

// Real catalog: event types from the Bingo Forge startup sheet, menu
// packages from "NEW VEG 04 MENU PAKAGE 2026" / "NEW NON VEG PACKAGE NEW 2026"
// and "BREAKFAST & HI-TEA MENU 2025", extras from the package sheets (per
// person) and the startup sheet's banquet extras list (flat).
export const CATALOG = [
  { kind: 'functionType', name: 'Meetings', order: 1 },
  { kind: 'functionType', name: 'Conference', order: 2 },
  { kind: 'functionType', name: 'Weddings', order: 3 },
  { kind: 'functionType', name: 'Social', order: 4 },
  { kind: 'functionType', name: 'Business Social', order: 5 },
  { kind: 'functionType', name: 'Exhibition', order: 6 },

  // Per-person rates for the course packages are not printed on the 2026
  // sheets ("rates are till October") — set them in Banquet Setup. `courses`
  // are the headings of each package sheet; a prospectus lists its dishes
  // under exactly these (the main course is one course, its sub-lines are
  // not split out).
  { kind: 'menuType', name: '04 Course Veg Meal Menu', courses: ['Soups', 'Salads', 'Main Course', 'Desserts'], rate: 0, order: 1, notes: 'Veg package 01 — 02 welcome drinks, main course (02 curds, 01 paneer, 02 vegetable dishes, 01 dal, 02 rice + biryani, 03 Indian breads), 03 desserts' },
  { kind: 'menuType', name: '06 Course Veg Meal', courses: ['Welcome Drinks', 'Starters', 'Soups', 'Salads', 'Main Course', 'Desserts'], rate: 0, order: 2, notes: 'Veg package 02 — 02 welcome drinks, 03 starters, main course (02 curds, 01 paneer, 03 vegetable dishes, 01 dal, 02 rice + 01 biryani, 03 Indian breads, 01 live counter), 03 desserts' },
  { kind: 'menuType', name: '06 Course Veg Gold Meal', courses: ['Welcome Drinks', 'Starters', 'Soups', 'Salads', 'Main Course', 'Desserts'], rate: 0, order: 3, notes: 'Veg package 03 — 03 welcome drinks, 04 starters, main course (02 curds, 02 paneer, 04 vegetable dishes, 02 dal, 02 rice + 01 veg biryani, 04 Indian breads, 02 live counters), 04 desserts' },
  { kind: 'menuType', name: '04 Course Non Veg', courses: ['Soups', 'Salads', 'Main Course', 'Desserts'], rate: 0, order: 4, notes: 'Non-veg package 01 — 02 welcome drinks, main course (02 curds, 01 non-veg dish, 01 paneer, 03 vegetable dishes, 01 dal, 02 rice + 1 chicken biryani, 03 Indian breads), 03 desserts' },
  { kind: 'menuType', name: '06 Course Non Veg', courses: ['Welcome Drinks', 'Starters', 'Soups', 'Salads', 'Main Course', 'Desserts'], rate: 0, order: 5, notes: 'Non-veg package 02 — 02 welcome drinks, 04 starters, main course (02 curds, 01 non-veg dish, 01 paneer, 02 vegetable dishes, 01 dal, 02 rice + 01 mutton biryani, 03 Indian breads), 03 desserts' },
  { kind: 'menuType', name: '06 Course Non-Veg Gold', courses: ['Welcome Drinks', 'Starters', 'Soups', 'Salads', 'Main Course', 'Desserts'], rate: 0, order: 6, notes: 'Non-veg package 03 — 02 welcome drinks, starters, main course (02 curds, 02 non-veg dishes, 02 paneer, 04 vegetable dishes, 02 dal, 02 rice + mutton biryani, 04 Indian breads, 02 live counters), 04 desserts' },
  { kind: 'menuType', name: 'Vegetarian Breakfast', courses: ['Juices', 'Breads', 'Cereals', 'Cut Fruits', 'Live Counter / Egg', 'South Indian', 'North Indian', 'Western', 'Dessert', 'Tea, Coffee & Cookies'], rate: 850, order: 7, notes: '02 juices, assorted breads, cereals, cut fruits, 1 live counter / egg, 02 South Indian, 02 North Indian, 01 Western, 01 dessert, tea, coffee & cookies' },
  { kind: 'menuType', name: 'Vegetarian Hi-Tea', courses: ['Welcome Drinks', 'Bread Item', 'Veg Heavy Snacks', 'Veg Light Snacks', 'Dessert', 'Tea, Coffee & Cookies'], rate: 850, order: 8, notes: '02 welcome drinks, 1 bread item, 01 veg heavy snack, 02 veg light snacks, 01 dessert, tea, coffee & cookies' },
  { kind: 'menuType', name: 'Mix Hi-Tea', courses: ['Welcome Drinks', 'Bread Item', 'Non-Veg Snacks', 'Veg Heavy Snacks', 'Veg Light Snacks', 'Dessert', 'Tea, Coffee & Cookies'], rate: 950, order: 9, notes: '02 welcome drinks, 1 bread item, 01 non-veg snack (chicken), 01 veg heavy snack, 02 veg light snacks, 01 dessert, tea, coffee & cookies' },

  // Extras — items not included in the menu package, charged per person.
  { kind: 'addOn', name: 'Mocktail Live Counter', rate: 100, order: 1 },
  { kind: 'addOn', name: 'Chat Counter', rate: 175, order: 2 },
  { kind: 'addOn', name: 'Paneer in Snacks / Main Course', rate: 100, order: 3 },
  { kind: 'addOn', name: 'Veg Dish in Snacks / Main Course', rate: 75, order: 4 },
  { kind: 'addOn', name: 'Chicken in Snacks / Main Course', rate: 100, order: 5 },
  { kind: 'addOn', name: 'Mutton in Snacks / Main Course', rate: 200, order: 6 },
  { kind: 'addOn', name: 'Fish in Snacks / Main Course', rate: 150, order: 7 },
  { kind: 'addOn', name: 'Prawns in Snacks / Main Course', rate: 300, order: 8 },
  { kind: 'addOn', name: 'Tawa Veg Live Counter', rate: 100, order: 9 },
  { kind: 'addOn', name: 'Tawa Non Veg (Mutton) Live Counter', rate: 250, order: 10 },
  { kind: 'addOn', name: 'Phulka Live Counter', rate: 100, order: 11 },
  { kind: 'addOn', name: 'Dessert / Sweet Live Counter', rate: 100, order: 12 },
  { kind: 'addOn', name: 'Chinese Live Counter', rate: 150, order: 13 },
  { kind: 'addOn', name: 'Pasta Live Counter', rate: 150, order: 14 },
  { kind: 'addOn', name: 'Oriental Live Counter', rate: 200, order: 15 },
  { kind: 'addOn', name: 'Lebanese Live Counter', rate: 200, order: 16 },
  { kind: 'addOn', name: 'Dal Factory Live Counter', rate: 150, order: 17 },
  { kind: 'addOn', name: 'Egg Live Counter', rate: 150, order: 18 },
  { kind: 'addOn', name: 'Maggie Live Counter', rate: 100, order: 19 },
  { kind: 'addOn', name: 'Pan Asian Live Counter', rate: 200, order: 20 },
  { kind: 'addOn', name: 'Paneer Shawarma Live Counter', rate: 250, order: 21 },
  { kind: 'addOn', name: 'Chicken Shawarma Live Counter', rate: 350, order: 22 },
  { kind: 'addOn', name: 'Sit-down dining / Pangat / Sajan Goth', rate: 300, order: 23 },

  { kind: 'liquor', name: 'Liquor License', rate: 25000, pricing: 'flat', order: 1 },
  { kind: 'liquor', name: 'Beverage Corkage', rate: 2500, pricing: 'flat', order: 2 },
  { kind: 'liquor', name: 'Pot Corkage', rate: 2500, pricing: 'flat', order: 3 },
  { kind: 'liquor', name: 'Plug-in Charge', rate: 250, pricing: 'flat', order: 4 },

  { kind: 'requirement', name: 'LCD Projector with 6x4 Tripod Screen (3000 Lumens)', rate: 3000, pricing: 'flat', order: 1 },
  { kind: 'requirement', name: 'Laptop', rate: 1200, pricing: 'flat', order: 2 },
  { kind: 'requirement', name: 'Big Screen 6x8', rate: 1000, pricing: 'flat', order: 3 },
  { kind: 'requirement', name: 'Slide Changer', rate: 1000, pricing: 'flat', order: 4 },
  { kind: 'requirement', name: 'Plasma 42 inch with Stand', rate: 2500, pricing: 'flat', order: 5 },
  { kind: 'requirement', name: 'Plasma 52 inch with Stand', rate: 3000, pricing: 'flat', order: 6 },
  { kind: 'requirement', name: 'LED Wall (per sq.ft.)', rate: 200, pricing: 'flat', order: 7, notes: 'Rs. 200 per sq.ft. — multiply by the wall size' },
  { kind: 'requirement', name: 'Small PA System with 2 Monitor & 1 Mic', rate: 3000, pricing: 'flat', order: 8 },
  { kind: 'requirement', name: 'Screen Masking 10x10 ft with 6x8 ft Back Projection', rate: 3000, pricing: 'flat', order: 9 },
  { kind: 'requirement', name: 'Switcher or Splitter', rate: 1500, pricing: 'flat', order: 10 },
  { kind: 'requirement', name: 'Podium Mic', rate: 1000, pricing: 'flat', order: 11 },
  { kind: 'requirement', name: 'Cordless Mic', rate: 1000, pricing: 'flat', order: 12 },
  { kind: 'requirement', name: 'Lapel or Collar Mic', rate: 1000, pricing: 'flat', order: 13 },
  { kind: 'requirement', name: 'DJ System with Dance Floor & 3 LED lights', rate: 15000, pricing: 'flat', order: 14 },
  { kind: 'requirement', name: 'Big DJ System with Dance Floor, 6 LED lights & Smoke Machine', rate: 20000, pricing: 'flat', order: 15 },
  { kind: 'requirement', name: 'DJ System without Floor', rate: 12000, pricing: 'flat', order: 16 },
  { kind: 'requirement', name: 'Dance Floor', rate: 5000, pricing: 'flat', order: 17 },
  { kind: 'requirement', name: 'Karaoke Mic', rate: 3000, pricing: 'flat', order: 18 },
  { kind: 'requirement', name: 'LAN Connection', rate: 2500, pricing: 'flat', order: 19 },
];
