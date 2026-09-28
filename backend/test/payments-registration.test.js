import test from 'node:test';
import assert from 'node:assert/strict';

import {
  scheduleFrom,
  dueDateFor,
  needsRequest,
  ledgerView,
  bookingValue,
  paymentSummary,
  applyAdvance,
  REMIND_EVERY_DAYS,
} from '../src/services/payment.service.js';
import { gstinProblem, panProblem, panFromGstin, gstinCheckDigit } from '../src/services/registration.service.js';
import { cleanSpecialItems, specialAsItems } from '../src/utils/specialItems.js';
import { menuKeyOf, menuText } from '../src/services/menuCheck.service.js';

const DAY = 24 * 60 * 60 * 1000;
const enquiry = (extra = {}) => ({
  functions: [
    { date: new Date('2026-12-10T00:00:00Z'), proposedRate: 60000, rackRate: 70000 },
    { date: new Date('2026-12-12T00:00:00Z'), proposedRate: 40000, rackRate: 40000 },
  ],
  payments: { milestones: [] },
  ...extra,
});

test('booking value is the offered total plus 18% GST, rounded', () => {
  assert.equal(bookingValue(enquiry()), 118000);
});

test('the standard schedule splits the value and the last milestone takes the rounding', () => {
  const rows = scheduleFrom(
    [
      { label: 'Advance', percent: 33.33, due: 'on_confirmation' },
      { label: 'Balance', percent: 66.67, due: 'days_after_event', days: 60 },
    ],
    enquiry(),
    { value: 100001, confirmedAt: new Date('2026-10-01T00:00:00Z') }
  );
  assert.equal(rows.length, 2);
  assert.equal(rows[0].amount + rows[1].amount, 100001);
  assert.equal(rows[0].dueDate.toISOString().slice(0, 10), '2026-10-01');
  // 60 days after the LAST event (12 Dec).
  assert.equal(rows[1].dueDate.toISOString().slice(0, 10), '2027-02-10');
});

test('days before the event count back from the first function', () => {
  const due = dueDateFor({ due: 'days_before_event', days: 7 }, enquiry());
  assert.equal(due.toISOString().slice(0, 10), '2026-12-03');
});

test('zero-percent rows are dropped from a schedule', () => {
  const rows = scheduleFrom([{ label: 'Nothing', percent: 0, due: 'on_confirmation' }, { label: 'All', percent: 100, due: 'on_confirmation' }], enquiry(), { value: 500 });
  assert.deepEqual(rows.map((r) => [r.label, r.amount]), [['All', 500]]);
});

test('a due milestone is requested, then again only after the reminder gap', () => {
  const now = new Date('2026-11-10T10:00:00Z');
  const milestone = { status: 'pending', dueDate: new Date('2026-11-09T00:00:00Z'), requests: [] };
  assert.equal(needsRequest(milestone, now), true);
  milestone.requests.push({ at: new Date(now.getTime() - DAY) });
  assert.equal(needsRequest(milestone, now), false);
  milestone.requests.push({ at: new Date(now.getTime() - REMIND_EVERY_DAYS * DAY) });
  milestone.requests.shift();
  assert.equal(needsRequest(milestone, now), true);
  assert.equal(needsRequest({ ...milestone, status: 'received' }, now), false);
  assert.equal(needsRequest({ status: 'pending', dueDate: new Date('2026-12-01T00:00:00Z') }, now), false);
});

test('the advance taken at won pays the first pending milestone', () => {
  const e = enquiry({
    advance: { received: true, amount: 'Rs. 35,400', mode: 'neft', reference: 'UTR1' },
    payments: {
      milestones: [
        { label: 'Advance', amount: 35400, status: 'pending' },
        { label: 'Balance', amount: 82600, status: 'pending' },
      ],
    },
  });
  const paid = applyAdvance(e, { id: 'x', user: { name: 'Exec' } });
  assert.equal(paid.label, 'Advance');
  assert.equal(paid.status, 'received');
  assert.equal(paid.received.amount, 35400);
  const summary = paymentSummary(e, new Date('2026-12-20T00:00:00Z'));
  assert.equal(summary.received, 35400);
  assert.equal(summary.outstanding, 82600);
});

test('ledger view keeps a running balance and flags an exceeded credit line', () => {
  const view = ledgerView(
    [
      { _id: 'b', date: new Date('2026-10-05'), debit: 118000, credit: 0 },
      { _id: 'a', date: new Date('2026-10-01'), debit: 0, credit: 20000 },
    ],
    { enabled: true, limit: 50000 }
  );
  assert.deepEqual(view.rows.map((r) => r.balance), [-20000, 98000]);
  assert.equal(view.totals.balance, 98000);
  assert.equal(view.totals.available, -48000);
  assert.equal(view.totals.overLimit, true);
});

test('GSTIN check digit, format and the PAN inside it', () => {
  assert.equal(gstinCheckDigit('27AAPFU0939F1Z'), 'V');
  assert.equal(gstinProblem('27AAPFU0939F1ZV'), '');
  assert.equal(gstinProblem('27aapfu0939f1zv'), '');
  assert.match(gstinProblem('27AAPFU0939F1ZX'), /check digit/);
  assert.match(gstinProblem('27AAPFU0939F'), /15 characters/);
  assert.equal(panFromGstin('27AAPFU0939F1ZV'), 'AAPFU0939F');
  assert.equal(panProblem('AAPFU0939F'), '');
  assert.match(panProblem('AAPF0939F'), /5 letters/);
  assert.equal(gstinProblem(''), '');
});

test('special items are cleaned and printed like add-on menus', () => {
  const cleaned = cleanSpecialItems([{ name: '  Live jalebi ', rate: '120.6' }, { name: '', rate: 50 }, { name: 'Ice sculpture', rate: 15000, pricing: 'flat' }]);
  assert.deepEqual(cleaned, [
    { name: 'Live jalebi', rate: 121, pricing: 'per_pax' },
    { name: 'Ice sculpture', rate: 15000, pricing: 'flat' },
  ]);
  const printed = specialAsItems({ specialItems: cleaned });
  assert.equal(printed[1].pricing, 'flat');
  assert.equal(printed[0]._id, 'special-0');
  assert.equal(printed[0].special, true);
});

test('the menu fingerprint follows the dishes, not blank lines', () => {
  const fp = { menuCourses: [{ name: 'Starters', dishes: ['Paneer tikka', ' ', 'Hara bhara kebab'] }, { name: 'Soups', dishes: [] }] };
  assert.equal(menuText(fp), 'Starters: Paneer tikka, Hara bhara kebab');
  const before = menuKeyOf(fp);
  fp.menuCourses[0].dishes.push('Veg spring roll');
  assert.notEqual(menuKeyOf(fp), before);
});

test('a partial advance leaves the rest of its milestone as a new pending one', () => {
  const e = enquiry({
    advance: { received: true, amount: '10,000' },
    payments: {
      milestones: [
        { _id: 'm1', label: 'Advance', amount: 35400, status: 'pending', dueDate: new Date('2026-10-01') },
        { _id: 'm2', label: 'Balance', amount: 82600, status: 'pending' },
      ],
    },
  });
  applyAdvance(e, null);
  const [paid, rest, balance] = e.payments.milestones;
  assert.equal(paid.amount, 10000);
  assert.equal(paid.status, 'received');
  assert.equal(rest.label, 'Advance — balance');
  assert.equal(rest.amount, 25400);
  assert.equal(rest.status, 'pending');
  assert.equal(balance.label, 'Balance');
  assert.equal(paymentSummary(e).outstanding, 108000);
});
