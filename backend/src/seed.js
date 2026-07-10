import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';

import env from './config/env.js';
import { connectDB } from './config/db.js';
import { generateLeadReference } from './utils/reference.js';

import User from './models/User.js';
import Lead from './models/Lead.js';
import RefreshToken from './models/RefreshToken.js';
import AuditLog from './models/AuditLog.js';

/**
 * Seed script for the CPH Leads CRM.
 *
 * Wipes users, leads, refresh tokens and audit logs, then recreates:
 *   - 1 admin
 *   - 2 sales executives
 *   - 12 sample leads spread across cities / units (CPA, CPH, CPNM) /
 *     statuses (Non Contracted, Contracted), several enriched with notes,
 *     action points, follow-ups, instructions and history.
 *
 * Run with: npm run seed
 */

function daysFromNow(days) {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d;
}

function daysAgo(days) {
  return daysFromNow(-days);
}

async function hashPassword(plain) {
  return bcrypt.hash(plain, env.BCRYPT_ROUNDS);
}

async function run() {
  await connectDB();

  console.log('[seed] clearing existing collections...');
  await Promise.all([
    User.deleteMany({}),
    Lead.deleteMany({}),
    RefreshToken.deleteMany({}),
    AuditLog.deleteMany({}),
  ]);

  console.log('[seed] creating users...');
  const [adminHash, raviHash, nehaHash] = await Promise.all([
    hashPassword('Admin@123'),
    hashPassword('Exec@123'),
    hashPassword('Exec@123'),
  ]);

  const admin = await User.create({
    name: 'CPH Admin',
    email: 'admin@cph.local',
    passwordHash: adminHash,
    role: 'admin',
    isActive: true,
  });

  const ravi = await User.create({
    name: 'Ravi Sharma',
    email: 'ravi@cph.local',
    passwordHash: raviHash,
    role: 'sales_exec',
    isActive: true,
  });

  const neha = await User.create({
    name: 'Neha Verma',
    email: 'neha@cph.local',
    passwordHash: nehaHash,
    role: 'sales_exec',
    isActive: true,
  });

  console.log('[seed] creating sample leads...');

  // Definitions for the sample leads. References are generated sequentially
  // so the reference helper sees previously inserted rows for the same
  // city/date bucket and increments correctly.
  const leadDefs = [
    {
      businessName: 'Orchid Bloom Hotel',
      contactPerson: 'Thomas George',
      designation: 'Purchase Manager',
      businessType: 'Hotel',
      contactedFor: 'CPH',
      mobile: '9847012345',
      email: 'thomas.george@orchidbloom.example',
      city: 'Kochi',
      leadDate: daysAgo(32),
      status: 'Non Contracted',
      assignedTo: ravi,
      createdBy: admin,
      notes: [
        {
          body: 'First call done. 95-room property near Marine Drive, unhappy with current linen vendor.',
          author: ravi,
        },
        {
          body: 'Emailed the CPH catalogue and standard rate card. Asked for bath linen samples.',
          author: ravi,
        },
      ],
      actionPoints: [
        { text: 'Dispatch bath linen sample kit', createdBy: ravi, cleared: true },
        { text: 'Prepare comparison sheet vs current vendor', createdBy: ravi, cleared: false },
      ],
      followUps: [
        {
          dueDate: daysFromNow(2),
          note: 'Confirm samples reached and collect feedback',
          status: 'open',
          createdBy: ravi,
        },
      ],
      instructions: [
        {
          text: 'Vendor-switch opportunity — move fast, quote within the week.',
          issuedBy: admin,
          status: 'open',
        },
      ],
    },
    {
      businessName: 'Saffron Courtyard Restaurant',
      contactPerson: 'Lakshmi Reddy',
      designation: 'Owner',
      businessType: 'Restaurant',
      contactedFor: 'CPA',
      mobile: '9848523697',
      email: 'lakshmi@saffroncourtyard.example',
      city: 'Hyderabad',
      leadDate: daysAgo(26),
      status: 'Non Contracted',
      assignedTo: neha,
      createdBy: neha,
      notes: [
        {
          body: 'Fine-dining restaurant, 2 branches. Wants table linen and chef coats.',
          author: neha,
        },
      ],
      followUps: [
        {
          dueDate: daysAgo(3),
          note: 'Send quotation for both branches',
          status: 'closed',
          createdBy: neha,
          closingNote: 'Quote shared. Owner comparing with one more supplier.',
          closedBy: neha,
          closedAt: daysAgo(3),
        },
        {
          dueDate: daysFromNow(3),
          note: 'Decision follow-up call',
          status: 'open',
          createdBy: neha,
        },
      ],
    },
    {
      businessName: 'Emerald Bay Resort',
      contactPerson: 'Maria D’Souza',
      designation: 'General Manager',
      businessType: 'Resort',
      contactedFor: 'CPH',
      mobile: '9847536912',
      email: 'maria@emeraldbay.example',
      city: 'Alleppey',
      leadDate: daysAgo(48),
      status: 'Contracted',
      assignedTo: neha,
      createdBy: admin,
      notes: [
        {
          body: 'Annual contract signed — full room and spa linen for 70 cottages.',
          author: neha,
        },
      ],
      actionPoints: [
        { text: 'Hand over delivery calendar to operations', createdBy: neha, cleared: true },
      ],
      followUps: [
        {
          dueDate: daysAgo(8),
          note: 'Contract signing at the property',
          status: 'closed',
          createdBy: neha,
          closingNote: 'Signed for 12 months. First delivery scheduled.',
          closedBy: neha,
          closedAt: daysAgo(8),
        },
      ],
      instructions: [
        {
          text: 'Flagship account for Kerala — ensure white-glove service.',
          issuedBy: admin,
          status: 'done',
          doneAt: daysAgo(7),
        },
      ],
    },
    {
      businessName: 'City Lights Banquets',
      contactPerson: 'Prakash Deshpande',
      designation: 'Manager',
      businessType: 'Banquet Hall',
      contactedFor: 'CPNM',
      mobile: '9822145078',
      email: 'prakash@citylights.example',
      city: 'Nagpur',
      leadDate: daysAgo(20),
      status: 'Non Contracted',
      assignedTo: ravi,
      createdBy: admin,
      notes: [
        {
          body: 'Hosts 15–20 events a month. Interested in chair covers, drapes and table linen.',
          author: ravi,
        },
      ],
      actionPoints: [
        { text: 'Share event-season bulk pricing', createdBy: ravi, cleared: false },
      ],
      followUps: [
        {
          dueDate: daysAgo(1),
          note: 'Call about wedding-season requirements',
          status: 'open',
          createdBy: ravi,
        },
      ],
    },
    {
      businessName: 'Maple Leaf Caterers',
      contactPerson: 'Sandeep Malviya',
      designation: 'Director',
      businessType: 'Caterer',
      contactedFor: 'CPA',
      mobile: '9826407531',
      email: 'sandeep@mapleleaf.example',
      city: 'Indore',
      leadDate: daysAgo(14),
      status: 'Non Contracted',
      assignedTo: ravi,
      createdBy: admin,
      instructions: [
        {
          text: 'Big corporate-catering client base — pitch the rental-plus-purchase combo.',
          issuedBy: admin,
          status: 'open',
        },
      ],
    },
    {
      businessName: 'The Brew House Café',
      contactPerson: 'Aditi Rao',
      designation: 'Operations Manager',
      businessType: 'Café',
      contactedFor: 'CPH',
      mobile: '9880254613',
      email: 'aditi@brewhouse.example',
      city: 'Bengaluru',
      leadDate: daysAgo(11),
      status: 'Non Contracted',
      assignedTo: neha,
      createdBy: neha,
      notes: [
        {
          body: 'Chain of 5 cafés across the city. Needs aprons, napkins and barista uniforms.',
          author: neha,
        },
      ],
      followUps: [
        {
          dueDate: daysFromNow(4),
          note: 'Send starter-pack pricing for all outlets',
          status: 'open',
          createdBy: neha,
        },
      ],
    },
    {
      businessName: 'Lotus Grand Residency',
      contactPerson: 'Senthil Kumar',
      designation: 'Owner',
      businessType: 'Hotel',
      contactedFor: 'CPA',
      mobile: '9842078965',
      email: 'senthil@lotusgrand.example',
      city: 'Coimbatore',
      leadDate: daysAgo(40),
      status: 'Contracted',
      assignedTo: ravi,
      createdBy: ravi,
      notes: [
        {
          body: 'Signed 6-month agreement for bed and bath linen, 55 rooms. Renewal likely.',
          author: ravi,
        },
      ],
      followUps: [
        {
          dueDate: daysAgo(12),
          note: 'Final negotiation meeting',
          status: 'closed',
          createdBy: ravi,
          closingNote: 'Agreement signed same day after rate revision.',
          closedBy: ravi,
          closedAt: daysAgo(12),
        },
      ],
    },
    {
      businessName: 'Regal Crown Banquet Hall',
      contactPerson: 'Faisal Khan',
      designation: 'Manager',
      businessType: 'Banquet Hall',
      contactedFor: 'CPNM',
      mobile: '9838521470',
      email: 'faisal@regalcrown.example',
      city: 'Kanpur',
      leadDate: daysAgo(7),
      status: 'Non Contracted',
      assignedTo: neha,
      createdBy: admin,
      notes: [
        {
          body: 'Referred by City Lights Banquets. Wants a similar drapes-and-linen package.',
          author: neha,
        },
      ],
      followUps: [
        {
          dueDate: daysFromNow(6),
          note: 'Property visit with sample kit',
          status: 'open',
          createdBy: neha,
        },
      ],
      instructions: [
        {
          text: 'Referral lead — quote in line with the City Lights proposal.',
          issuedBy: admin,
          status: 'open',
        },
      ],
    },
    {
      businessName: 'Riverside Retreat',
      contactPerson: 'Nitin Rawat',
      designation: 'Resort Manager',
      businessType: 'Resort',
      contactedFor: 'CPH',
      mobile: '9758203641',
      email: 'nitin@riversideretreat.example',
      city: 'Rishikesh',
      leadDate: daysAgo(5),
      status: 'Non Contracted',
      assignedTo: ravi,
      createdBy: ravi,
    },
    {
      businessName: 'The Colonial Club',
      contactPerson: 'Ananya Bose',
      designation: 'Procurement Head',
      businessType: 'Club',
      contactedFor: 'CPNM',
      mobile: '9831456982',
      email: 'ananya.bose@colonialclub.example',
      city: 'Kolkata',
      leadDate: daysAgo(17),
      status: 'Non Contracted',
      assignedTo: neha,
      createdBy: admin,
      notes: [
        {
          body: 'Heritage club with dining hall and 30 guest rooms. Formal tender process expected.',
          author: neha,
        },
      ],
      actionPoints: [
        { text: 'Collect tender documents from the club office', createdBy: neha, cleared: false },
      ],
      followUps: [
        {
          dueDate: daysAgo(2),
          note: 'Check tender release date',
          status: 'open',
          createdBy: neha,
        },
      ],
    },
    {
      businessName: 'Golden Dunes Camp Resort',
      contactPerson: 'Mahendra Bhati',
      designation: 'Owner',
      businessType: 'Camp Resort',
      contactedFor: 'CPNM',
      mobile: '9950362718',
      email: 'mahendra@goldendunes.example',
      city: 'Jaisalmer',
      leadDate: daysAgo(36),
      status: 'Contracted',
      assignedTo: ravi,
      createdBy: admin,
      notes: [
        {
          body: 'Seasonal contract signed for 40 luxury tents — bedding and towels.',
          author: ravi,
        },
      ],
      followUps: [
        {
          dueDate: daysAgo(9),
          note: 'Season-start supply confirmation',
          status: 'closed',
          createdBy: ravi,
          closingNote: 'Contract signed for the tourist season. Deliveries begin next month.',
          closedBy: ravi,
          closedAt: daysAgo(9),
        },
      ],
    },
    {
      businessName: 'Urban Nest Hotel',
      contactPerson: 'Ritika Jain',
      designation: 'Front Office Manager',
      businessType: 'Budget Hotel',
      contactedFor: 'CPA',
      mobile: '9755102846',
      email: 'ritika@urbannest.example',
      city: 'Bhopal',
      leadDate: daysAgo(3),
      status: 'Non Contracted',
      assignedTo: neha,
      createdBy: neha,
      notes: [
        {
          body: 'New 40-room budget hotel opening next month. Needs full first-stock linen.',
          author: neha,
        },
      ],
      followUps: [
        {
          dueDate: daysFromNow(1),
          note: 'Share opening-stock package quote',
          status: 'open',
          createdBy: neha,
        },
      ],
    },
  ];

  let created = 0;
  for (const def of leadDefs) {
    const reference = await generateLeadReference(def.city, def.leadDate, Lead);

    const assignedTo = def.assignedTo;
    const createdByUser = def.createdBy;

    const notes = (def.notes || []).map((n) => ({
      body: n.body,
      author: n.author?._id,
      authorName: n.author?.name,
    }));

    const actionPoints = (def.actionPoints || []).map((ap) => ({
      text: ap.text,
      createdBy: ap.createdBy?._id,
      createdByName: ap.createdBy?.name,
      createdAt: def.leadDate,
      cleared: !!ap.cleared,
      clearedAt: ap.cleared ? def.leadDate : undefined,
      clearedBy: ap.cleared ? ap.createdBy?._id : undefined,
    }));

    const followUps = (def.followUps || []).map((fu) => ({
      dueDate: fu.dueDate,
      note: fu.note,
      status: fu.status || 'open',
      createdBy: fu.createdBy?._id,
      createdByName: fu.createdBy?.name,
      createdAt: def.leadDate,
      closingNote: fu.closingNote,
      closedAt: fu.closedAt,
      closedBy: fu.closedBy?._id,
    }));

    const instructions = (def.instructions || []).map((ins) => ({
      text: ins.text,
      issuedBy: ins.issuedBy?._id,
      issuedByName: ins.issuedBy?.name,
      status: ins.status || 'open',
      createdAt: def.leadDate,
      doneAt: ins.doneAt,
    }));

    // Build append-only history from seeded activity.
    const history = [];
    history.push({
      type: 'created',
      summary: `Lead created with status "${def.status}"`,
      at: def.leadDate,
      by: createdByUser._id,
      byName: createdByUser.name,
    });
    if (createdByUser._id.toString() !== assignedTo._id.toString()) {
      history.push({
        type: 'assignment',
        summary: `Assigned to ${assignedTo.name}`,
        at: def.leadDate,
        by: createdByUser._id,
        byName: createdByUser.name,
      });
    }
    for (const ap of actionPoints) {
      if (ap.cleared) {
        history.push({
          type: 'action_point_cleared',
          summary: `Action point cleared: ${ap.text}`,
          at: ap.clearedAt || def.leadDate,
          by: ap.clearedBy,
          byName: ap.createdByName,
        });
      }
    }
    for (const fu of followUps) {
      if (fu.status === 'closed') {
        history.push({
          type: 'follow_up_closed',
          summary: `Follow-up closed: ${fu.closingNote || fu.note || ''}`,
          at: fu.closedAt || def.leadDate,
          by: fu.closedBy,
          byName: fu.createdByName,
        });
      }
    }
    if (def.status === 'Contracted') {
      history.push({
        type: 'status_change',
        summary: `Status changed to "${def.status}"`,
        at: def.leadDate,
        by: assignedTo._id,
        byName: assignedTo.name,
      });
    }

    await Lead.create({
      reference,
      businessName: def.businessName,
      contactPerson: def.contactPerson,
      designation: def.designation,
      mobile: def.mobile,
      email: def.email,
      city: def.city,
      businessType: def.businessType,
      contactedFor: def.contactedFor,
      leadDate: def.leadDate,
      status: def.status,
      assignedTo: assignedTo._id,
      createdBy: createdByUser._id,
      notes,
      actionPoints,
      followUps,
      instructions,
      history,
    });
    created += 1;
  }

  console.log(`[seed] inserted ${created} leads.`);

  console.log('\n========================================');
  console.log(' CPH Leads CRM — Seed complete');
  console.log('========================================');
  console.log(' Login credentials:');
  console.log('');
  console.log('  Admin');
  console.log('    email:    admin@cph.local');
  console.log('    password: Admin@123');
  console.log('');
  console.log('  Sales Executive');
  console.log('    email:    ravi@cph.local');
  console.log('    password: Exec@123');
  console.log('');
  console.log('  Sales Executive');
  console.log('    email:    neha@cph.local');
  console.log('    password: Exec@123');
  console.log('');
  console.log(`  Users: 3   Leads: ${created}`);
  console.log('========================================\n');
}

run()
  .then(async () => {
    await mongoose.disconnect();
    console.log('[seed] done. disconnected.');
    process.exit(0);
  })
  .catch(async (err) => {
    console.error('[seed] failed:', err);
    try {
      await mongoose.disconnect();
    } catch {
      // ignore disconnect errors during failure cleanup
    }
    process.exit(1);
  });
