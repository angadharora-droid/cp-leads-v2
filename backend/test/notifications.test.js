import test from 'node:test';
import assert from 'node:assert/strict';

import { describeMovement, istDayBounds, pickRecipients } from '../src/services/notification.service.js';

const id = (n) => String(n).padStart(24, '0');

const users = [
  { _id: id(1), role: 'admin', isActive: true, modules: [] },
  { _id: id(2), role: 'manager', isActive: true, modules: ['leads'] },
  { _id: id(3), role: 'manager', isActive: true, modules: ['estimates'] },
  { _id: id(4), role: 'sales_exec', isActive: true, modules: ['leads'] },
  { _id: id(5), role: 'sales_exec', isActive: true, modules: ['leads'] },
  { _id: id(6), role: 'manager', isActive: false, modules: ['leads'] },
];

test('recipients: the assigned exec plus managers holding the section, never the actor', () => {
  const got = pickRecipients(users, { module: 'leads', interested: [id(4)], excludeId: id(2) });
  assert.deepEqual(got, [id(1), id(4)]);
});

test('recipients: managers without the section and unrelated execs are left out', () => {
  const got = pickRecipients(users, { module: 'estimates', interested: [id(5)] });
  assert.deepEqual(got, [id(1), id(3)]);
});

test('enquiry stage move reads the last stage-history entry', () => {
  const doc = {
    _id: id(9),
    stage: 'provisional',
    kind: 'banquet',
    functions: [{ name: 'Wedding reception', date: new Date('2026-10-02T00:00:00Z') }],
    stageHistory: [
      { stage: 'proposal', trigger: 'Proposal generated', by: id(4), byName: 'Sneha' },
      { stage: 'provisional', trigger: 'Contract HCP.CT.000001.00 emailed to a@b.c', by: id(4), byName: 'Sneha' },
    ],
  };
  const notice = describeMovement('Enquiry', doc, { businessName: 'Persistent Systems' }, { isNew: false, changed: true });
  assert.equal(notice.type, 'enquiry.stage');
  assert.equal(notice.title, 'Persistent Systems → Provisional');
  assert.ok(notice.body.includes('Contract HCP.CT.000001.00 emailed'));
  assert.ok(notice.body.includes('02 Oct 2026'));
  assert.equal(notice.actorId, id(4));
  assert.equal(notice.actorName, 'Sneha');
  assert.equal(notice.link, `/enquiries/${id(9)}`);
});

test('won, lost and cancelled enquiries get their own types', () => {
  for (const stage of ['won', 'lost', 'cancelled']) {
    const doc = { _id: id(9), stage, functions: [], stageHistory: [{ stage, trigger: 'x' }] };
    const notice = describeMovement('Enquiry', doc, { businessName: 'Haldiram' }, { isNew: false, changed: true });
    assert.equal(notice.type, `enquiry.${stage}`);
  }
});

test('a new lead names its creator from the history entry', () => {
  const doc = {
    _id: id(7),
    businessName: 'Orange City Hospital',
    reference: 'CPH-NAGPUR-190926-003',
    city: 'Nagpur',
    leadType: 'company',
    createdBy: id(4),
    history: [{ type: 'created', summary: 'Company lead created', by: id(4), byName: 'Sneha' }],
  };
  const notice = describeMovement('Lead', doc, null, { isNew: true, changed: false });
  assert.equal(notice.type, 'lead.created');
  assert.equal(notice.title, 'New lead: Orange City Hospital');
  assert.equal(notice.body, 'CPH-NAGPUR-190926-003 · Nagpur · Company');
  assert.equal(notice.actorId, id(4));
  assert.equal(notice.actorName, 'Sneha');
});

test('an approved prospectus credits the approver; a revised one falls back to the editor', () => {
  const base = { _id: id(8), number: '0007', functionType: 'Conference', venue: 'Grand Ballroom', dateFrom: new Date('2026-11-05T00:00:00Z') };
  const approved = describeMovement('FunctionProspectus', { ...base, status: 'approved', approval: { by: id(2), byName: 'Manager' } }, { businessName: 'Mahindra' }, { isNew: false, changed: true });
  assert.equal(approved.type, 'prospectus.approved');
  assert.equal(approved.actorId, id(2));
  const revised = describeMovement('FunctionProspectus', { ...base, status: 'draft' }, { businessName: 'Mahindra' }, { isNew: false, changed: true, actorId: id(4) });
  assert.equal(revised.type, 'prospectus.reopened');
  assert.equal(revised.actorId, id(4));
  assert.equal(revised.link, `/prospectus/${id(8)}`);
});

test('IST day bounds wrap the hotel day, not the UTC day', () => {
  const { startOfToday, endOfToday } = istDayBounds(new Date('2026-09-19T10:00:00Z'));
  assert.equal(startOfToday.toISOString(), '2026-09-18T18:30:00.000Z');
  assert.equal(endOfToday.toISOString(), '2026-09-19T18:30:00.000Z');
  // 21:00 UTC is already the next day at the hotel.
  const late = istDayBounds(new Date('2026-09-19T21:00:00Z'));
  assert.equal(late.startOfToday.toISOString(), '2026-09-19T18:30:00.000Z');
});
