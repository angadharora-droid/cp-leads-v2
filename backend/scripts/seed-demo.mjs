/**
 * Demo data for a walkthrough — additive, never destructive.
 *
 *   node scripts/seed-demo.mjs
 *
 * Upserts the banquet configuration (venues, sessions, function types, menus,
 * add-ons, liquor, requirements) and then creates a handful of leads with
 * enquiries and rate contracts, skipping anything that already exists. Run it
 * as often as you like; it only fills gaps.
 *
 * Point it at another database with MONGODB_URI=... node scripts/seed-demo.mjs
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
process.chdir(path.join(here, '..'));

const mongoose = (await import('mongoose')).default;
const bcrypt = (await import('bcryptjs')).default;

const { connectDB } = await import('../src/config/db.js');
const User = (await import('../src/models/User.js')).default;
const Lead = (await import('../src/models/Lead.js')).default;
const Venue = (await import('../src/models/Venue.js')).default;
const BanquetSession = (await import('../src/models/BanquetSession.js')).default;
const BanquetCatalog = (await import('../src/models/BanquetCatalog.js')).default;
const Enquiry = (await import('../src/models/Enquiry.js')).default;
const Arc = (await import('../src/models/Arc.js')).default;
const leadService = await import('../src/services/lead.service.js');
const enquiryService = await import('../src/services/enquiry.service.js');
const arcService = await import('../src/services/arc.service.js');
const kitService = await import('../src/services/kit.service.js');

const log = (...args) => console.log('[demo]', ...args);

await connectDB();

/* ------------------------------- Actor ----------------------------------- */

let admin = await User.findOne({ role: 'admin' });
if (!admin) {
  admin = await User.create({
    name: 'CPH Admin',
    email: 'admin@cph.local',
    passwordHash: await bcrypt.hash('Admin@123', 10),
    role: 'admin',
    isActive: true,
  });
  log('created admin admin@cph.local / Admin@123');
}
const actor = { id: String(admin._id), role: 'admin', user: admin };

/* --------------------------- Banquet configuration ------------------------ */

const { VENUES, SESSIONS, CATALOG } = await import('./banquet-catalog.mjs');

for (const [i, name] of VENUES.entries()) {
  await Venue.updateOne(
    { name },
    { $setOnInsert: { name, active: true, order: i + 1, createdBy: admin._id } },
    { upsert: true }
  );
}
for (const session of SESSIONS) {
  await BanquetSession.updateOne(
    { name: session.name },
    { $setOnInsert: { ...session, active: true, createdBy: admin._id } },
    { upsert: true }
  );
}
for (const item of CATALOG) {
  await BanquetCatalog.updateOne(
    { kind: item.kind, name: item.name },
    {
      $setOnInsert: {
        ...item,
        pricing: item.pricing || 'per_pax',
        rate: item.rate || 0,
        active: true,
        createdBy: admin._id,
      },
    },
    { upsert: true }
  );
}
log('banquet configuration ready');

const venues = Object.fromEntries((await Venue.find()).map((v) => [v.name, v]));
const sessions = Object.fromEntries((await BanquetSession.find()).map((s) => [s.name, s]));
const catalog = {};
for (const item of await BanquetCatalog.find()) catalog[`${item.kind}:${item.name}`] = item;
const cat = (kind, name) => catalog[`${kind}:${name}`]?._id;

/* --------------------------------- Leads ---------------------------------- */

const COMPANIES = [
  {
    businessName: 'Mahindra Logistics Ltd',
    contactPerson: 'Amit Kulkarni',
    designation: 'Admin Manager',
    mobile: '9876543210',
    email: 'amit@mahindralogistics.example',
    city: 'Nagpur',
    businessType: 'Logistics',
    contactedFor: ['CPH', 'CPA'],
    departments: [
      { branch: 'Nagpur', name: 'HR' },
      { branch: 'Nagpur', name: 'Purchase' },
      { branch: 'Pune', name: 'Admin' },
    ],
  },
  {
    businessName: 'Persistent Systems',
    contactPerson: 'Sneha Rao',
    designation: 'Travel Desk',
    mobile: '9822001122',
    email: 'sneha@persistent.example',
    city: 'Pune',
    businessType: 'IT Services',
    contactedFor: ['CPH'],
    departments: [
      { branch: '', name: 'Travel Desk' },
      { branch: '', name: 'Learning & Development' },
    ],
  },
  {
    businessName: 'Haldiram Foods',
    contactPerson: 'Vikas Agarwal',
    designation: 'Director',
    mobile: '9765432100',
    email: 'vikas@haldiram.example',
    city: 'Nagpur',
    businessType: 'FMCG',
    contactedFor: ['CPNM'],
    departments: [{ branch: '', name: 'Corporate Office' }],
  },
  {
    businessName: 'Orange City Hospital',
    contactPerson: 'Dr. Meera Joshi',
    designation: 'Medical Director',
    mobile: '9922334455',
    email: 'meera@orangecity.example',
    city: 'Nagpur',
    businessType: 'Healthcare',
    contactedFor: ['CPH', 'CPA'],
    departments: [
      { branch: '', name: 'Administration' },
      { branch: '', name: 'Events' },
    ],
  },
];

const INDIVIDUALS = [
  {
    businessName: 'Ravi Sharma',
    mobile: '9876500000',
    email: 'ravi.sharma@example.com',
    city: 'Nagpur',
    contactedFor: ['CPH'],
  },
  {
    businessName: 'Anjali Mehta',
    mobile: '9000011111',
    email: 'anjali.mehta@example.com',
    city: 'Amravati',
    contactedFor: ['CPA'],
  },
];

/** Creates a lead only when no lead with that name exists yet. */
async function ensureLead(payload) {
  const existing = await Lead.findOne({ businessName: payload.businessName });
  if (existing) {
    log(`lead exists, skipped: ${payload.businessName}`);
    return existing;
  }
  const lead = await leadService.createLead(payload, actor);
  log(`lead created: ${lead.businessName} (${lead.reference})`);
  return Lead.findById(lead._id);
}

const leads = {};
for (const company of COMPANIES) {
  leads[company.businessName] = await ensureLead({
    leadType: 'company',
    ...company,
    notes: [{ body: 'Met at the Nagpur trade fair; wants corporate rates for visiting staff.' }],
    followUps: [
      {
        dueDate: new Date(Date.now() + 2 * 86400000).toISOString(),
        note: 'Share the rate sheet and banquet menus',
      },
    ],
  });
}
for (const person of INDIVIDUALS) {
  leads[person.businessName] = await ensureLead({ leadType: 'individual', ...person });
}

/* ------------------------------- Enquiries -------------------------------- */

const day = (offset) => {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  d.setHours(12, 0, 0, 0);
  return d.toISOString().slice(0, 10);
};

const deptId = (lead, name) =>
  String((lead.departments || []).find((d) => d.name === name)?._id || '');

const ENQUIRIES = [
  {
    lead: 'Mahindra Logistics Ltd',
    department: 'HR',
    kind: 'banquet',
    contactName: 'Amit Kulkarni',
    functions: [
      {
        functionType: cat('functionType', 'Business Social'),
        date: day(14),
        venues: [venues['Grand Millenium']?._id],
        sessions: [sessions.Dinner?._id],
        pax: 350,
        menuType: cat('menuType', '06 Course Non Veg'),
        addOns: [cat('addOn', 'Chat Counter'), cat('addOn', 'Mocktail Live Counter')],
        liquor: [],
        requirements: [cat('requirement', 'Small PA System with 2 Monitor & 1 Mic'), cat('requirement', 'DJ System with Dance Floor & 3 LED lights')],
        additionalRequirement: 'Branded backdrop with the company logo.',
      },
    ],
  },
  {
    lead: 'Persistent Systems',
    department: 'Learning & Development',
    kind: 'both',
    contactName: 'Sneha Rao',
    functions: [
      {
        functionType: cat('functionType', 'Conference'),
        date: day(21),
        venues: [venues['Board Room 1']?._id],
        sessions: [sessions.Breakfast?._id, sessions.Lunch?._id],
        pax: 40,
        menuType: cat('menuType', 'Vegetarian Hi-Tea'),
        addOns: [],
        liquor: [],
        requirements: [cat('requirement', 'LCD Projector with 6x4 Tripod Screen (3000 Lumens)')],
      },
    ],
    room: { checkIn: day(20), checkOut: day(22), rooms: '12', notes: 'Twin sharing, CP plan' },
  },
  {
    lead: 'Ravi Sharma',
    kind: 'banquet',
    contactName: 'Ravi Sharma',
    functions: [
      {
        functionType: cat('functionType', 'Social'),
        date: day(30),
        venues: [venues['Bougainvillea']?._id],
        sessions: [sessions.Dinner?._id],
        pax: 250,
        menuType: cat('menuType', '06 Course Veg Meal'),
        addOns: [cat('addOn', 'Pasta Live Counter'), cat('addOn', 'Dessert / Sweet Live Counter')],
        liquor: [cat('liquor', 'Liquor License')],
        requirements: [cat('requirement', 'DJ System with Dance Floor & 3 LED lights'), cat('requirement', 'Dance Floor')],
      },
      {
        functionType: cat('functionType', 'Weddings'),
        date: day(31),
        venues: [venues['Grand Millenium']?._id, venues['Palacio A']?._id],
        sessions: [sessions.Dinner?._id],
        pax: 600,
        menuType: cat('menuType', '06 Course Non-Veg Gold'),
        addOns: [cat('addOn', 'Mocktail Live Counter'), cat('addOn', 'Maggie Live Counter')],
        liquor: [cat('liquor', 'Beverage Corkage')],
        requirements: [cat('requirement', 'Small PA System with 2 Monitor & 1 Mic'), cat('requirement', 'Big DJ System with Dance Floor, 6 LED lights & Smoke Machine')],
        additionalRequirement: 'Vidaai at 1 am, valet parking for 200 cars.',
      },
    ],
  },
  {
    lead: 'Orange City Hospital',
    department: 'Events',
    kind: 'banquet',
    contactName: 'Dr. Meera Joshi',
    functions: [
      {
        functionType: cat('functionType', 'Conference'),
        date: day(9),
        venues: [venues['Palacio A']?._id],
        sessions: [sessions.Breakfast?._id],
        pax: 200,
        menuType: cat('menuType', 'Vegetarian Hi-Tea'),
        addOns: [cat('addOn', 'Mocktail Live Counter')],
        liquor: [],
        requirements: [cat('requirement', 'LCD Projector with 6x4 Tripod Screen (3000 Lumens)')],
      },
    ],
  },
  {
    lead: 'Anjali Mehta',
    kind: 'banquet',
    contactName: 'Anjali Mehta',
    functions: [
      {
        functionType: cat('functionType', 'Social'),
        date: day(6),
        venues: [venues['Golden']?._id],
        sessions: [sessions.Dinner?._id],
        pax: 80,
        menuType: cat('menuType', '04 Course Veg Meal Menu'),
        addOns: [cat('addOn', 'Dessert / Sweet Live Counter')],
        liquor: [],
        requirements: [cat('requirement', 'Dance Floor')],
      },
    ],
  },
];

const createdEnquiries = [];
for (const spec of ENQUIRIES) {
  const lead = leads[spec.lead];
  if (!lead) continue;
  const already = await Enquiry.countDocuments({ lead: lead._id });
  if (already) {
    log(`enquiry exists, skipped: ${spec.lead}`);
    continue;
  }
  const body = {
    kind: spec.kind,
    contactName: spec.contactName,
    contactEmail: lead.email,
    contactPhone: lead.mobile,
    functions: spec.functions.map((fn) => ({
      ...fn,
      venues: fn.venues.filter(Boolean),
      sessions: fn.sessions.filter(Boolean),
      addOns: (fn.addOns || []).filter(Boolean),
      liquor: (fn.liquor || []).filter(Boolean),
      requirements: (fn.requirements || []).filter(Boolean),
    })),
    room: spec.room,
  };
  if (spec.department) body.department = deptId(lead, spec.department);
  try {
    const enquiry = await enquiryService.createEnquiry(lead._id, body, actor);
    createdEnquiries.push(enquiry);
    log(`enquiry created: ${spec.lead} (${enquiry.functions.length} function(s))`);
  } catch (err) {
    log(`enquiry skipped for ${spec.lead}: ${err.message}`);
  }
}

// Move a couple along so the board is not all in one column: proposals for
// the first two, and a contract for the first (emailing is left to a real
// mailbox, so the stage stops at Proposal).
for (const enquiry of createdEnquiries.slice(0, 2)) {
  try {
    await enquiryService.generateProposal(enquiry._id, actor);
    log('proposal generated for an enquiry');
  } catch (err) {
    log(`proposal skipped: ${err.message}`);
  }
}
if (createdEnquiries[0]) {
  try {
    await enquiryService.generateContract(createdEnquiries[0]._id, actor);
    log('contract made for an enquiry');
  } catch (err) {
    log(`contract skipped: ${err.message}`);
  }
}

/* ----------------------------- Rate contracts ----------------------------- */

const CONTRACTS = [
  { lead: 'Mahindra Logistics Ltd', department: 'Purchase', advance: 'proposal' },
  { lead: 'Persistent Systems', department: 'Travel Desk', advance: 'none' },
  { lead: 'Haldiram Foods', department: 'Corporate Office', advance: 'contracted' },
];

for (const spec of CONTRACTS) {
  const lead = leads[spec.lead];
  if (!lead) continue;
  const already = await Arc.countDocuments({ lead: lead._id });
  if (already) {
    log(`rate contract exists, skipped: ${spec.lead}`);
    continue;
  }
  try {
    const arc = await arcService.createArc(
      lead._id,
      {
        department: deptId(lead, spec.department),
        title: `Rate contract ${new Date().getFullYear()}-${String(
          new Date().getFullYear() + 1
        ).slice(-2)}`,
        contactName: lead.contactPerson,
        contactEmail: lead.email,
        contactPhone: lead.mobile,
      },
      actor
    );
    const kit = await kitService.createKit(
      lead._id,
      {
        kitType: 'corporate',
        arc: String(arc._id),
        corporate: {
          companyName: lead.businessName,
          contactPerson: lead.contactPerson || '',
          mobile: lead.mobile || '',
          email: lead.email || '',
          address: lead.city || '',
          properties: [],
        },
      },
      actor
    );
    if (spec.advance !== 'none') {
      await kitService.generateKitPdf(kit._id, 'proposal', actor);
    }
    if (spec.advance === 'contracted') {
      await kitService.addConfirmationFiles(
        kit._id,
        [
          {
            mimetype: 'application/pdf',
            buffer: Buffer.from('%PDF-1.4 demo signed agreement'),
            originalname: 'signed-agreement.pdf',
            size: 30,
          },
        ],
        actor
      );
    }
    log(`rate contract created: ${spec.lead} (${spec.advance})`);
  } catch (err) {
    log(`rate contract skipped for ${spec.lead}: ${err.message}`);
  }
}

const counts = {
  leads: await Lead.countDocuments(),
  enquiries: await Enquiry.countDocuments(),
  rateContracts: await Arc.countDocuments(),
  venues: await Venue.countDocuments(),
  sessions: await BanquetSession.countDocuments(),
  catalogOptions: await BanquetCatalog.countDocuments(),
};
log('done:', JSON.stringify(counts));

await mongoose.disconnect();
process.exit(0);
