import test from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import Lead from '../src/models/Lead.js';
import Enquiry from '../src/models/Enquiry.js';
import AuditLog from '../src/models/AuditLog.js';
import * as activity from '../src/services/leadActivity.service.js';
import { ACTIVITY_FIELDS, activityFor, assignSingleEnquiryActivity } from '../src/services/enquiryActivityScope.service.js';
import { getMyFollowUps } from '../src/services/followup.service.js';

const id = (n) => String(n).padStart(24, '0');
const executive = { id: id(1), role: 'sales_exec', user: { name: 'Executive' } };
const manager = { id: id(2), role: 'manager', user: { name: 'Manager' } };
const admin = { ...manager, role: 'admin' };
const scope = { enquiryId: id(4) };
function query(value) {
  const result = { then: (resolve, reject) => Promise.resolve(value).then(resolve, reject) };
  for (const method of ['select', 'limit', 'lean', 'populate']) result[method] = () => result;
  return result;
}

function fixture(t, count = 2) {
  const lead = new Lead({ _id: id(3), businessName: 'Company', assignedTo: executive.id,
    notes: [
      { _id: id(10), body: 'Older unlinked note', author: executive.id },
      { _id: id(11), body: 'Other enquiry note', author: executive.id, enquiry: id(5) },
    ],
    followUps: [{ _id: id(12), dueDate: new Date(), enquiry: id(5) }],
    instructions: [{ _id: id(13), text: 'Original instruction', enquiry: id(4) }],
  });
  lead.save = async () => lead;
  lead.populate = async () => lead;
  t.mock.method(Lead, 'findById', () => query(lead));
  t.mock.method(Enquiry, 'findById', () => query({ _id: scope.enquiryId, lead: lead._id }));
  t.mock.method(Enquiry, 'find', () => query(Array.from({ length: count }, (_, i) => ({ _id: id(4 + i) }))));
  const audit = t.mock.method(AuditLog, 'create', async () => ({}));
  return { lead, audit };
}

test('enquiry activity is separate from sibling enquiries and unlinked lead records', async (t) => {
  const { lead, audit } = fixture(t);
  const result = await activity.addNote(scope, 'New enquiry note', executive);
  assert.deepEqual(result.activityNotes.map((note) => note.body), ['New enquiry note']);
  assert.equal(lead.notes.length, 3);
  assert.equal(String(lead.notes[2].enquiry), scope.enquiryId);
  assert.equal(lead.notes[0].enquiry, undefined);
  assert.equal(audit.mock.calls[0].arguments[0].entityType, 'Enquiry');
  assert.equal(audit.mock.calls[0].arguments[0].entityId, scope.enquiryId);
  await assert.rejects(activity.editNote(scope, id(11), 'Wrong enquiry', executive), { statusCode: 404 });
  await assert.rejects(activity.deleteNote(scope, id(10), executive), { statusCode: 404 });
  await assert.rejects(activity.closeFollowUp(scope, id(12), 'Wrong enquiry', executive), { statusCode: 404 });
  await assert.rejects(activity.editNote(id(3), String(lead.notes[2]._id), 'Lead endpoint', executive), { statusCode: 404 });
});

test('visit outcomes, follow-up closure and action clearance stay on the same enquiry', async (t) => {
  const { lead } = fixture(t);
  const result = await activity.addVisitReport(scope, {
    visitDate: '2026-09-20', note: 'Discussed the booking', followUpDate: '2026-09-22',
    followUpNote: 'Confirm menu', actionPoint: 'Send proposal',
  }, executive);
  assert.equal(result.visitReports.length, 1);
  assert.equal(result.followUps.length, 1);
  assert.equal(result.actionPoints.length, 1);
  for (const field of ['visitReports', 'followUps', 'actionPoints']) {
    assert.equal(String(result[field][0].enquiry), scope.enquiryId);
  }
  await activity.closeFollowUp(scope, String(result.followUps[0]._id), 'Menu confirmed', executive);
  await activity.clearActionPoint(scope, String(result.actionPoints[0]._id), executive);
  assert.equal(activityFor(lead, scope.enquiryId).followUps[0].status, 'closed');
  assert.equal(activityFor(lead, scope.enquiryId).actionPoints[0].cleared, true);
  assert.equal(lead.followUps.id(id(12)).status, 'open');
});

test('ownership, note author and instruction permissions also apply on enquiries', async (t) => {
  const { lead } = fixture(t);
  await assert.rejects(activity.addNote(scope, 'No access', { ...executive, id: id(9) }), { statusCode: 404 });
  const note = (await activity.addNote(scope, 'Author note', executive)).activityNotes[0];
  await assert.rejects(activity.editNote(scope, String(note._id), 'Not author', manager), { statusCode: 403 });
  await activity.editNote(scope, String(note._id), 'Admin edit', admin);
  await assert.rejects(activity.issueInstruction(scope, 'Not admin', manager), { statusCode: 403 });
  await assert.rejects(activity.completeInstruction(scope, id(13), manager), { statusCode: 403 });
  await activity.completeInstruction(scope, id(13), executive);
  assert.equal(lead.instructions.id(id(13)).status, 'done');
});

test('multiple or zero enquiries leave existing activity unlinked', async (t) => {
  for (const count of [0, 2]) {
    const { lead } = fixture(t, count);
    const write = t.mock.method(Lead, 'updateOne', async () => { throw new Error('Should not migrate'); });
    assert.equal(await assignSingleEnquiryActivity(lead), lead);
    assert.equal(write.mock.callCount(), 0);
    assert.equal(lead.notes[0].enquiry, undefined);
  }
});

test('one enquiry assigns all unlinked activity with a single atomic update preserving existing links', async (t) => {
  const { lead } = fixture(t, 1);
  let pipeline;
  const write = t.mock.method(Lead, 'updateOne', async (filter, update) => {
    assert.equal(String(filter._id), id(3));
    pipeline = update;
    for (const field of ACTIVITY_FIELDS) {
      for (const item of lead[field]) if (!item.enquiry) item.enquiry = new mongoose.Types.ObjectId(id(4));
    }
  });
  await assignSingleEnquiryActivity(lead);
  assert.deepEqual(Object.keys(pipeline[0].$set), ACTIVITY_FIELDS);
  assert.equal(String(lead.notes.id(id(10)).enquiry), id(4));
  assert.equal(String(lead.notes.id(id(11)).enquiry), id(5));
  assert.equal(lead.notes.id(id(10)).body, 'Older unlinked note');
  await assignSingleEnquiryActivity(lead);
  assert.equal(write.mock.callCount(), 1);
});

test('follow-up feed retains enquiry destinations and ownership filtering', async (t) => {
  let pipeline;
  t.mock.method(Lead, 'aggregate', async (value) => {
    pipeline = value;
    return [{ _id: id(3), businessName: 'Company',
      followUps: [{ _id: id(12), enquiry: id(4), status: 'open', dueDate: new Date() }],
      instructions: [{ _id: id(13), enquiry: id(5), text: 'Call guest' }],
    }];
  });
  const result = await getMyFollowUps(executive);
  assert.equal(String(pipeline[0].$match.assignedTo), executive.id);
  assert.equal(result.followUps[0].enquiryId, id(4));
  assert.equal(result.instructions[0].enquiryId, id(5));
});
