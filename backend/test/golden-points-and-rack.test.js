import test from 'node:test';
import assert from 'node:assert/strict';
import Enquiry from '../src/models/Enquiry.js';
import FunctionProspectus from '../src/models/FunctionProspectus.js';
import AuditLog from '../src/models/AuditLog.js';
import { updateProspectusSchema } from '../src/validation/prospectus.validation.js';
import * as fpService from '../src/services/prospectus.service.js';
import { buildProspectusPdf } from '../src/services/prospectusPdf.service.js';
import { buildEnquiryProposalPdf } from '../src/services/proposalPdf.service.js';

const id = (n) => String(n).padStart(24, '0');
const manager = { id: id(2), role: 'manager', user: { name: 'Manager', modules: ['leads', 'prospectus'] } };

function query(value) {
  const q = { then: (resolve, reject) => Promise.resolve(value).then(resolve, reject) };
  for (const key of ['populate', 'select', 'sort', 'limit', 'lean']) q[key] = () => q;
  return q;
}

test('Golden points: at most three, each at most 200 characters', () => {
  assert.equal(updateProspectusSchema.safeParse({ goldenPoints: ['a', 'b', 'c'] }).success, true);
  assert.equal(updateProspectusSchema.safeParse({ goldenPoints: ['a', 'b', 'c', 'd'] }).success, false);
  assert.equal(updateProspectusSchema.safeParse({ goldenPoints: ['x'.repeat(201)] }).success, false);
  assert.deepEqual(updateProspectusSchema.parse({ goldenPoints: ['  Jain food  '] }).goldenPoints, ['Jain food']);
});

test('Saving golden points drops the empty ones; editing an approved sheet sends it back to draft', async (t) => {
  const fp = { _id: id(5), number: '0001', status: 'approved', approval: { by: manager.id }, save: async () => {} };
  t.mock.method(FunctionProspectus, 'findById', () => query(fp));
  t.mock.method(Enquiry, 'findById', () => query(null));
  t.mock.method(AuditLog, 'create', async () => ({}));
  await fpService.updateProspectus(id(5), { goldenPoints: [' Jain — no onion/garlic ', '', 'No peanuts'] }, manager);
  assert.deepEqual(fp.goldenPoints, ['Jain — no onion/garlic', 'No peanuts']);
  assert.equal(fp.status, 'draft');
  assert.equal(fp.approval, undefined);
});

test('Refreshing from the booking keeps the golden points', async (t) => {
  const fn = { _id: id(7), date: new Date('2026-12-12'), pax: 120, functionType: { name: 'Dinner' } };
  const fp = { _id: id(5), number: '0001', enquiry: id(6), functionId: id(7), goldenPoints: ['Jain side'], save: async () => {} };
  t.mock.method(FunctionProspectus, 'findById', () => query(fp));
  t.mock.method(Enquiry, 'findById', () => query({ _id: id(6), stage: 'won', lead: { businessName: 'Guest' }, functions: [fn] }));
  t.mock.method(AuditLog, 'create', async () => ({}));
  await fpService.refreshProspectus(id(5), manager);
  assert.equal(fp.pax, 120);
  assert.deepEqual(fp.goldenPoints, ['Jain side']);
});

test('The FP sheet prints with and without golden points', async () => {
  const base = { number: '0001', partyName: 'Guest', functionType: 'Dinner', pax: 120, dateFrom: new Date('2026-12-12') };
  for (const goldenPoints of [[], ['Jain side — no onion/garlic', 'No peanuts', 'Entry at 20:15']]) {
    const pdf = await buildProspectusPdf({ ...base, goldenPoints });
    assert.equal(pdf.buffer.subarray(0, 4).toString(), '%PDF');
  }
});

test('The proposal prints offers below, at and above the rack rate', async () => {
  const menu = { _id: id(11), name: 'Veg Buffet', rate: 1800, pricing: 'per_pax' };
  const dj = { _id: id(12), name: 'DJ', rate: 15000, pricing: 'flat' };
  const decor = { _id: id(13), name: 'Decor', rate: 125000, pricing: 'flat' };
  const bar = { _id: id(14), name: 'Bar', rate: 900, pricing: 'per_pax' };
  const fn = {
    _id: id(10),
    date: new Date('2026-12-12'),
    pax: 200,
    functionType: { name: 'Reception' },
    menuType: menu,
    liquor: [bar],
    requirements: [dj, decor],
    // Below the rack (beside it, and on the line under it for the wide amount), at the rack, and above it.
    lineRates: [{ item: menu._id, rate: 1500 }, { item: dj._id, rate: 12000 }, { item: decor._id, rate: 110000 }, { item: bar._id, rate: 1000 }],
    rackRate: 1800 * 200 + 15000 + 125000 + 900 * 200,
    proposedRate: 1500 * 200 + 12000 + 110000 + 1000 * 200,
  };
  const enquiry = { functions: [fn], contactName: 'Guest', proposal: { number: 'HCP.EP.00001', version: 1 } };
  const pdf = await buildEnquiryProposalPdf(enquiry, { businessName: 'Guest' }, { sessionTimings: ['Evening'] });
  assert.equal(pdf.buffer.subarray(0, 4).toString(), '%PDF');
});
