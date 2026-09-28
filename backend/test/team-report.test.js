import test from 'node:test';
import assert from 'node:assert/strict';
import ExcelJS from 'exceljs';
import Lead from '../src/models/Lead.js';
import Enquiry from '../src/models/Enquiry.js';
import User from '../src/models/User.js';
import AuditLog from '../src/models/AuditLog.js';
import FunctionProspectus from '../src/models/FunctionProspectus.js';
import BanquetEstimate from '../src/models/BanquetEstimate.js';
import BanquetSettings from '../src/models/BanquetSettings.js';
import Prospect from '../src/models/Prospect.js';
import {
  stageTatDays,
  inPeriodOf,
  collectedInPeriod,
  firstProposalAt,
  firstResponseDays,
  buildAgeingRows,
  buildClientRows,
  buildScorecard,
  getTeamReport,
  generateTeamExcel,
} from '../src/services/teamReport.service.js';

const id = (n) => String(n).padStart(24, '0');
const DAY = 24 * 60 * 60 * 1000;
const sept = (day, hour = 10) => new Date(2026, 8, day, hour, 0, 0);
const august = new Date(2026, 7, 15, 10, 0, 0);
const period = { from: new Date(2026, 8, 1, 0, 0, 0), to: new Date(2026, 8, 30, 23, 59, 59, 999) };
const inSeptember = inPeriodOf(period);
const names = { [id(1)]: 'Asha', [id(2)]: 'Bharat' };
const nameOf = (key) => (key === 'unassigned' ? 'Unassigned' : names[key] || 'Former user');

function query(value) {
  const q = { then: (resolve, reject) => Promise.resolve(value).then(resolve, reject) };
  for (const key of ['populate', 'select', 'sort', 'limit', 'lean']) q[key] = () => q;
  return q;
}

test('stage TAT comes from Banquet Setup, falling back to the defaults per stage', () => {
  assert.deepEqual(stageTatDays(null), { enquiry: 3, proposal: 7, waitlist: 14, provisional: 7 });
  assert.deepEqual(
    stageTatDays({ stageTatDays: { enquiry: 1, proposal: 0, waitlist: undefined, provisional: -2 } }),
    { enquiry: 1, proposal: 0, waitlist: 14, provisional: 7 }
  );
});

test('pipeline ageing flags an open enquiry only once it is past its stage TAT', () => {
  const now = sept(20, 12);
  const enquiries = [
    { _id: id(50), stage: 'enquiry', createdAt: new Date(now - 5 * DAY), lead: { assignedTo: id(1), businessName: 'Acme' } },
    {
      _id: id(51),
      stage: 'proposal',
      createdAt: new Date(now - 10 * DAY),
      stageHistory: [
        { stage: 'enquiry', at: new Date(now - 10 * DAY) },
        { stage: 'proposal', at: new Date(now - 2 * DAY) },
      ],
      lead: { assignedTo: id(2), businessName: 'Ravi' },
    },
    { _id: id(52), stage: 'won', createdAt: new Date(now - 40 * DAY), lead: { assignedTo: id(1) } },
  ];
  const rows = buildAgeingRows({ enquiries, tat: { enquiry: 6, proposal: 1, waitlist: 14, provisional: 7 }, now, nameOf });
  assert.equal(rows.length, 2, 'won enquiries are not in the pipeline');
  assert.deepEqual(
    rows.map((r) => [r.enquiryId, r.days, r.limit, r.overdue, r.executiveId, r.executive]),
    [
      [id(51), 2, 1, true, id(2), 'Bharat'],
      [id(50), 5, 6, false, id(1), 'Asha'],
    ]
  );
  const onlyAsha = buildAgeingRows({ enquiries, tat: stageTatDays(null), now, executive: id(1), nameOf });
  assert.deepEqual(onlyAsha.map((r) => [r.enquiryId, r.limit, r.overdue]), [[id(50), 3, true]]);
});

test('money collected reads received milestones first, else the legacy advance, inside the period', () => {
  const withMilestones = {
    payments: {
      milestones: [
        { status: 'received', amount: 30000, received: { amount: 25000, date: sept(5) } },
        { status: 'received', amount: 5000, received: { at: sept(6) } },
        { status: 'received', amount: 70000, received: { amount: 70000, date: august } },
        { status: 'pending', amount: 10000 },
      ],
    },
    // Ignored: the milestones already record the money.
    advance: { received: true, amount: '50,000', date: sept(3) },
  };
  assert.equal(collectedInPeriod(withMilestones, inSeptember), 30000);
  assert.equal(collectedInPeriod({ payments: { milestones: [{ status: 'pending', amount: 9000 }] }, advance: { received: true, amount: 'Rs. 1,20,000', date: sept(3) } }, inSeptember), 120000);
  assert.equal(collectedInPeriod({ advance: { received: true, amount: '8000', recordedAt: sept(4) } }, inSeptember), 8000);
  assert.equal(collectedInPeriod({ advance: { received: true, amount: '8000', date: august } }, inSeptember), 0);
  assert.equal(collectedInPeriod({ advance: { received: false, amount: '8000', date: sept(4) } }, inSeptember), 0);
  assert.equal(collectedInPeriod({}, inSeptember), 0);
});

test('first response is the days from the enquiry to its earliest proposal, reissues included', () => {
  const enquiry = {
    createdAt: sept(1),
    proposal: { generatedAt: sept(4) },
    issues: [
      { document: 'contract', generatedAt: sept(1, 12) },
      { document: 'proposal', generatedAt: sept(2, 22) },
    ],
  };
  assert.equal(firstProposalAt(enquiry).getTime(), sept(2, 22).getTime());
  assert.equal(firstResponseDays(enquiry), 1.5);
  assert.equal(firstProposalAt({ createdAt: sept(1), proposal: {} }), null);
  assert.equal(firstResponseDays({ createdAt: sept(1) }), null);
});

/* ------------------------------ Client rows -------------------------------- */

const acme = { _id: id(10), businessName: 'Acme Corp', reference: 'CP-001', leadType: 'company', assignedTo: id(1) };
const ravi = { _id: id(11), businessName: 'Ravi Sharma', reference: 'CP-002', leadType: 'individual', assignedTo: id(2) };
const dormant = { _id: id(12), businessName: 'Dormant Ltd', reference: 'CP-003', leadType: 'company', assignedTo: id(1) };

const clientEnquiries = [
  {
    _id: id(20),
    lead: acme,
    stage: 'won',
    createdAt: sept(2),
    proposal: { sentAt: sept(5) },
    won: { at: sept(12) },
    functions: [{ proposedRate: 100000, rackRate: 120000 }],
    payments: { milestones: [{ status: 'received', amount: 30000, received: { amount: 30000, date: sept(13) } }] },
  },
  { _id: id(21), lead: acme, stage: 'lost', createdAt: august, lostAt: sept(8), functions: [{ proposedRate: 40000 }] },
  // Never priced: the rack rate stands.
  { _id: id(22), lead: acme, stage: 'proposal', createdAt: sept(20), functions: [{ proposedRate: 0, rackRate: 50000 }] },
  {
    _id: id(23),
    lead: ravi,
    stage: 'cancelled',
    createdAt: sept(3),
    cancellation: { at: sept(15) },
    advance: { received: true, amount: '10,000', date: sept(10) },
    functions: [{ proposedRate: 20000 }],
  },
  // Open, but nothing happened in the period: not an active client.
  { _id: id(24), lead: dormant, stage: 'enquiry', createdAt: august, functions: [{ proposedRate: 5000 }] },
  // Its lead was deleted.
  { _id: id(25), lead: null, stage: 'enquiry', createdAt: sept(4) },
];

test('client rows count each company / individual the way performance counts executives', () => {
  const rows = buildClientRows({ leads: [acme, ravi, dormant], enquiries: clientEnquiries, period, nameOf });
  assert.deepEqual(rows.map((r) => r.client), ['Acme Corp', 'Ravi Sharma'], 'sorted by won value, dormant client left out');

  const [a, r] = rows;
  assert.deepEqual(
    {
      leadId: a.leadId, reference: a.reference, leadTypeLabel: a.leadTypeLabel, executive: a.executive,
      enquiries: a.enquiries, proposalsSent: a.proposalsSent, won: a.won, lost: a.lost, cancelled: a.cancelled,
      conversion: a.conversion, wonValue: a.wonValue, openValue: a.openValue, collected: a.collected,
      avgDaysToWin: a.avgDaysToWin, totalEnquiries: a.totalEnquiries, repeat: a.repeat,
    },
    {
      leadId: id(10), reference: 'CP-001', leadTypeLabel: 'Company', executive: 'Asha',
      enquiries: 2, proposalsSent: 1, won: 1, lost: 1, cancelled: 0,
      conversion: 50, wonValue: 100000, openValue: 50000, collected: 30000,
      avgDaysToWin: 10, totalEnquiries: 3, repeat: true,
    }
  );
  assert.equal(new Date(a.lastEnquiryAt).getTime(), sept(20).getTime());

  assert.equal(r.leadTypeLabel, 'Individual');
  assert.equal(r.executive, 'Bharat');
  assert.equal(r.enquiries, 1);
  assert.equal(r.won, 0);
  assert.equal(r.cancelled, 1);
  assert.equal(r.conversion, 0);
  assert.equal(r.collected, 10000);
  assert.equal(r.repeat, false);
});

test('client rows follow the executive filter (the lead\'s assigned executive)', () => {
  const rows = buildClientRows({ leads: [acme, ravi, dormant], enquiries: clientEnquiries, period, executive: id(2), nameOf });
  assert.deepEqual(rows.map((r) => r.client), ['Ravi Sharma']);
  // The populated lead stands in when the leads list does not carry it.
  assert.equal(buildClientRows({ enquiries: clientEnquiries, period, nameOf }).length, 2);
});

/* ------------------------------- Scorecard --------------------------------- */

const scorecardInput = {
  performance: [{ executiveId: id(1), enquiries: 2, proposalsSent: 1, won: 1, wonValue: 100000, conversion: 50 }],
  prospects: [
    { createdBy: id(1), createdAt: sept(1), classifiedBy: id(2), classifiedAt: sept(4) },
    { createdBy: id(1), createdAt: august, classifiedBy: id(1), classifiedAt: sept(6) },
    { createdBy: id(2), createdAt: sept(9) },
  ],
  ageingRows: [
    { executiveId: id(1), overdue: true },
    { executiveId: id(1), overdue: false },
    { executiveId: id(2), overdue: true },
  ],
  enquiries: [
    { lead: { assignedTo: id(1) }, createdAt: sept(1), proposal: { generatedAt: sept(3) } },
    { lead: { assignedTo: id(1) }, createdAt: sept(10), proposal: { generatedAt: sept(11) } },
    // First proposal before the period: not counted.
    { lead: { assignedTo: id(1) }, createdAt: august, proposal: { generatedAt: new Date(august.getTime() + DAY) } },
    // No proposal yet: ignored.
    { lead: { assignedTo: id(1) }, createdAt: sept(12) },
    { lead: { assignedTo: id(2) }, createdAt: sept(5), proposal: { generatedAt: sept(9) }, issues: [{ document: 'proposal', generatedAt: sept(6) }] },
  ],
  period,
  nameOf,
};

test('scorecard puts leads captured / linked, over-TAT and first response beside the pipeline figures', () => {
  const rows = buildScorecard(scorecardInput);
  assert.deepEqual(rows.map((r) => r.executive), ['Asha', 'Bharat']);
  const [asha, bharat] = rows;
  assert.deepEqual(
    { ...asha },
    {
      executiveId: id(1), executive: 'Asha',
      leadsCaptured: 1, leadsLinked: 1,
      enquiries: 2, proposalsSent: 1, won: 1, wonValue: 100000, conversion: 50,
      openEnquiries: 2, overTat: 1,
      responded: 2, avgFirstResponseDays: 1.5,
    }
  );
  assert.equal(bharat.leadsCaptured, 1);
  assert.equal(bharat.leadsLinked, 1);
  assert.equal(bharat.enquiries, 0);
  assert.equal(bharat.overTat, 1);
  assert.equal(bharat.responded, 1);
  assert.equal(bharat.avgFirstResponseDays, 1);
});

test('scorecard follows the executive filter', () => {
  const rows = buildScorecard({ ...scorecardInput, executive: id(2) });
  assert.deepEqual(rows.map((r) => r.executive), ['Bharat']);
});

/* ------------------------------ Whole report ------------------------------- */

function stubReport(t, settings) {
  const now = Date.now();
  const lead = { _id: id(10), businessName: 'Acme Corp', reference: 'CP-001', leadType: 'company', assignedTo: id(1), createdAt: new Date(now - 60 * DAY) };
  const enquiry = {
    _id: id(20),
    lead,
    stage: 'enquiry',
    createdAt: new Date(now - 5 * DAY),
    stageHistory: [{ stage: 'enquiry', at: new Date(now - 5 * DAY) }],
    functions: [{ proposedRate: 75000, date: new Date(now + 30 * DAY) }],
    payments: { milestones: [{ status: 'received', amount: 20000, received: { amount: 20000, date: new Date(now - DAY) } }] },
    // The milestone already records the money: the legacy advance is not added on top.
    advance: { received: true, amount: '50,000', date: new Date(now - DAY) },
  };
  t.mock.method(User, 'find', () => query([{ _id: id(1), name: 'Asha', isActive: true }]));
  t.mock.method(Lead, 'find', () => query([lead]));
  t.mock.method(Enquiry, 'find', () => query([enquiry]));
  t.mock.method(AuditLog, 'find', () => query([]));
  t.mock.method(FunctionProspectus, 'find', () => query([]));
  t.mock.method(BanquetEstimate, 'find', () => query([]));
  t.mock.method(BanquetSettings, 'findOne', async () => settings);
  const prospectFind = t.mock.method(Prospect, 'find', () => query([{ createdBy: id(1), createdAt: new Date(now - DAY) }]));
  return { prospectFind };
}

test('the management report reads stage TAT from Banquet Setup and carries clients and the scorecard', async (t) => {
  const { prospectFind } = stubReport(t, { sessionsSeeded: true, stageTatDays: { enquiry: 10, proposal: 2 } });
  const data = await getTeamReport({});
  assert.deepEqual(data.tat, { enquiry: 10, proposal: 2, waitlist: 14, provisional: 7 });
  assert.deepEqual(data.ageing.byStage.map((s) => s.limit), [10, 2, 14, 7]);
  assert.equal(data.ageing.rows[0].limit, 10);
  assert.equal(data.ageing.rows[0].overdue, false);
  assert.equal(data.summary.stuck, 0);
  assert.ok(prospectFind.mock.calls[0].arguments[0].$or, 'prospects are loaded by created or classified date');

  assert.equal(data.clients.length, 1);
  assert.equal(data.clients[0].openValue, 75000);
  assert.equal(data.summary.activeClients, 1);
  assert.equal(data.summary.repeatClients, 0);
  assert.equal(data.scorecard.length, 1);
  assert.equal(data.scorecard[0].leadsCaptured, 1);
  assert.equal(data.scorecard[0].openEnquiries, 1);
  assert.equal(data.scorecard[0].overTat, 0);
  assert.equal(data.summary.leadsCaptured, 1);

  // Performance, the summary tile and Clients read money collected the same way.
  assert.equal(data.performance[0].collected, 20000);
  assert.equal(data.summary.collected, 20000);
  assert.equal(data.clients[0].collected, 20000);
  assert.equal(data.performance[0].advanceCollected, undefined);
});

test('without saved TAT the default limits apply', async (t) => {
  stubReport(t, { sessionsSeeded: true });
  const data = await getTeamReport({});
  assert.equal(data.ageing.rows[0].limit, 3);
  assert.equal(data.ageing.rows[0].overdue, true);
  assert.equal(data.summary.stuck, 1);
  assert.equal(data.scorecard[0].overTat, 1);
});

test('the Excel export carries the scorecard and client productivity sheets', async (t) => {
  stubReport(t, { sessionsSeeded: true });
  const { buffer } = await generateTeamExcel({});
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer);
  const sheets = workbook.worksheets.map((s) => s.name);
  assert.ok(sheets.includes('Salesperson scorecard'));
  assert.ok(sheets.includes('Client productivity'));
  const clients = workbook.getWorksheet('Client productivity');
  assert.equal(clients.getRow(1).getCell(1).value, 'Client');
  assert.equal(clients.getRow(2).getCell(1).value, 'Acme Corp');
  assert.equal(clients.getRow(2).getCell(3).value, 'Company');
  const score = workbook.getWorksheet('Salesperson scorecard');
  assert.equal(score.getRow(2).getCell(1).value, 'Asha');
  assert.equal(score.getRow(2).getCell(2).value, 1);
});
