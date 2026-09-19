import test from 'node:test';
import assert from 'node:assert/strict';
import Enquiry from '../src/models/Enquiry.js';
import Lead from '../src/models/Lead.js';
import BanquetSession from '../src/models/BanquetSession.js';
import BanquetSettings from '../src/models/BanquetSettings.js';
import AuditLog from '../src/models/AuditLog.js';
import { downloadProposal, downloadContract, getProformaPdf, updateEnquiry, getIssuePdf, markWon } from '../src/services/enquiry.service.js';
import { withDocumentVersions, numberedIssues } from '../src/services/documentVersions.js';

const id = (n) => String(n).padStart(24, '0');
const actor = { id: id(1), role: 'manager', user: { name: 'Original preparer', email: 'sales@example.test' } };

function fixture(t, { contract = true } = {}) {
  const enquiry = new Enquiry({
    _id: id(2), lead: id(3), kind: 'banquet', stage: 'proposal',
    contactName: 'Original guest', createdByName: 'Original preparer',
    proposal: { number: 'HCP.EP.000001.00', generatedAt: new Date('2026-09-01') },
    ...(contract ? { contract: { number: 'HCP.EC.00001', generatedAt: new Date('2026-09-02') } } : {}),
  });
  enquiry.save = async () => enquiry;
  enquiry.populate = async () => enquiry;
  const lead = { businessName: 'Original company', email: 'guest@example.test', reference: 'TEST', leadType: 'individual', history: [], save: async () => {} };
  const stored = { documentPrints: {}, issues: [] };
  t.mock.method(Enquiry, 'findById', () => ({
    populate: async () => enquiry,
    select: () => ({ lean: async () => stored }),
  }));
  t.mock.method(Lead, 'findOne', async () => lead);
  t.mock.method(AuditLog, 'create', async () => ({}));
  const sessions = t.mock.method(BanquetSession, 'find', () => ({
    sort: () => ({ lean: async () => [{ name: 'Original session', startTime: '09:00', endTime: '12:00' }] }),
  }));
  const writes = t.mock.method(Enquiry, 'updateOne', async (_filter, update) => {
    for (const [path, value] of Object.entries(update.$set || {})) {
      stored.documentPrints ||= {};
      stored.documentPrints[path.split('.')[1]] = JSON.parse(JSON.stringify(value));
    }
    if (update.$push?.issues) stored.issues.push(...JSON.parse(JSON.stringify(update.$push.issues.$each)));
    if (update.$unset?.documentPrints) delete stored.documentPrints;
    if (update.$unset?.['documentPrints.proforma']) delete stored.documentPrints?.proforma;
    return { modifiedCount: 1 };
  });
  return { enquiry, lead, stored, sessions, writes };
}

test('both previous documents retain JSON inputs and rebuild without live session lookups', async (t) => {
  const { enquiry, lead, stored, sessions, writes } = fixture(t);
  for (const download of [downloadProposal, downloadContract]) {
    const pdf = await download(id(2), actor);
    assert.equal(pdf.buffer.subarray(0, 4).toString(), '%PDF');
  }
  const originalProposal = structuredClone(stored.documentPrints.proposal);
  assert.equal(originalProposal.preparedBy.name, 'Original preparer');
  assert.equal(originalProposal.lead.businessName, 'Original company');
  assert.equal(originalProposal.proposal.generatedAt, '2026-09-01T00:00:00.000Z');
  assert.equal(originalProposal.sessionTimings[0], 'Original session – 09:00 till 12:00');
  assert.ok(Buffer.byteLength(JSON.stringify(originalProposal)) < 10000);

  lead.businessName = 'Renamed company';
  const editor = { ...actor, user: { name: 'Different editor' } };
  const writesAfterGeneration = writes.mock.callCount();
  const preview = await downloadProposal(id(2), editor);
  assert.match(preview.filename, /Original company\.pdf$/);
  assert.deepEqual(stored.documentPrints.proposal, originalProposal);
  assert.equal(writes.mock.callCount(), writesAfterGeneration);
  const result = await updateEnquiry(id(2), { contactName: 'New guest' }, editor);
  assert.deepEqual(stored.issues.map((issue) => issue.document), ['proposal', 'contract']);
  assert.deepEqual(stored.issues.map((issue) => issue.version), [1, 1]);
  assert.equal(enquiry.proposal.version, 2);
  assert.equal(enquiry.contract.version, 2);
  assert.deepEqual(stored.issues[0].print, originalProposal);
  assert.equal(stored.issues[1].print.contactName, 'Original guest');
  assert.equal(stored.documentPrints, undefined);
  assert.equal(result.enquiry.issues.length, 2);
  assert.equal(result.enquiry.issues[0].print, undefined);
  assert.equal(enquiry.isModified('issues'), false);

  const queriesBefore = sessions.mock.callCount();
  const writesBefore = writes.mock.callCount();
  for (const index of [0, 1]) {
    const pdf = await getIssuePdf(id(2), String(index), editor);
    assert.equal(pdf.buffer.subarray(0, 4).toString(), '%PDF');
    assert.match(pdf.filename, /Original company \(superseded\)\.pdf$/);
    assert.match(pdf.filename, / v1 - /);
  }
  assert.equal(sessions.mock.callCount(), queriesBefore);
  assert.equal(writes.mock.callCount(), writesBefore);
});

test('proposal-only edits archive the old number and keep earlier JSON snapshots intact', async (t) => {
  const { enquiry, stored } = fixture(t, { contract: false });
  await downloadProposal(id(2), actor);
  await updateEnquiry(id(2), { contactName: 'Second guest' }, actor);
  assert.equal(enquiry.proposal.number, 'HCP.EP.000001.01');
  const firstIssue = structuredClone(stored.issues[0]);
  await downloadProposal(id(2), actor);
  await updateEnquiry(id(2), { contactName: 'Third guest' }, actor);
  assert.equal(enquiry.proposal.number, 'HCP.EP.000001.02');
  assert.equal(stored.issues.length, 2);
  assert.deepEqual(stored.issues[0], firstIssue);
  assert.equal(stored.issues[1].print.contactName, 'Second guest');
  assert.equal(stored.issues[1].number, 'HCP.EP.000001.01');
  assert.equal(stored.issues[1].version, 2);
  assert.equal(enquiry.proposal.version, 3);
});

test('older unnumbered histories receive stable version numbers for each document type', () => {
  const enquiry = { proposal: { number: 'P1' }, contract: { number: 'C1' },
    issues: [{ document: 'proposal' }, { document: 'contract' }, { document: 'proposal' }],
  };
  const result = withDocumentVersions(enquiry);
  assert.deepEqual(result.issues.map((issue) => issue.version), [1, 1, 2]);
  assert.equal(result.proposal.version, 3);
  assert.equal(result.contract.version, 2);
  assert.deepEqual(numberedIssues([...result.issues, { document: 'contract' }]).map((issue) => issue.version), [1, 1, 2, 2]);
});

test('pro-forma versions rebuild from JSON without a stored PDF file', async (t) => {
  const { enquiry, stored } = fixture(t);
  enquiry.proforma.number = 'HCP.PI.00001';
  enquiry.proforma.generatedAt = new Date('2026-09-02');
  const first = await getProformaPdf(id(2), actor);
  assert.equal(first.buffer.subarray(0, 4).toString(), '%PDF');
  assert.match(first.filename, / v1 - /);
  assert.equal(enquiry.proforma.fileId, undefined);
  await updateEnquiry(id(2), { contactName: 'Changed guest' }, actor);
  assert.deepEqual(stored.issues.map((issue) => issue.document), ['proposal', 'contract', 'proforma']);
  const previous = await getIssuePdf(id(2), '2', actor);
  assert.match(previous.filename, / v1 - .*superseded/);
  const current = await getProformaPdf(id(2), actor);
  assert.match(current.filename, / v2 - /);
  assert.equal(stored.issues[2].print.contactName, 'Original guest');
  assert.equal(stored.documentPrints.proforma.contactName, 'Changed guest');
});

test('older enquiries preserve available pre-edit details without a render-time snapshot', async (t) => {
  const { stored } = fixture(t);
  await updateEnquiry(id(2), { contactName: 'Updated guest' }, actor);
  assert.equal(stored.issues.length, 2);
  assert.equal(stored.issues[0].print.contactName, 'Original guest');
  assert.equal(stored.issues[1].print.contract.number, 'HCP.EC.00001');
});

test('receiving an advance preserves the earlier invoice and increments only the pro-forma version', async (t) => {
  const { enquiry, stored } = fixture(t);
  enquiry.stage = 'provisional';
  enquiry.proforma.number = 'HCP.PI.00001';
  t.mock.method(BanquetSettings, 'findOne', async () => ({ sessionsSeeded: true }));
  await getProformaPdf(id(2), actor);
  await markWon(id(2), { advanceReceived: true, advance: { amount: '5000', mode: 'cash' } }, actor);
  assert.equal(enquiry.stage, 'won');
  assert.equal(enquiry.proforma.version, 2);
  assert.equal(enquiry.contract.version, 1);
  assert.equal(stored.issues.length, 1);
  assert.equal(stored.issues[0].document, 'proforma');
  assert.equal(stored.issues[0].print.advance.received, false);
  await getProformaPdf(id(2), actor);
  assert.equal(stored.documentPrints.proforma.advance.received, true);
  assert.equal(stored.documentPrints.proforma.advance.amount, '5000');
});

test('notes-only changes do not add document history', async (t) => {
  const { stored, writes } = fixture(t);
  await updateEnquiry(id(2), { notes: 'Internal note' }, actor);
  assert.equal(stored.issues.length, 0);
  assert.equal(writes.mock.callCount(), 0);
});

test('history rejects invalid indices and inaccessible leads', async (t) => {
  fixture(t);
  for (const index of ['0abc', '-1', '1.5', '', '9007199254740992', '100']) {
    await assert.rejects(getIssuePdf(id(2), index, actor), { statusCode: 404 });
  }
  t.mock.method(Lead, 'findOne', async () => null);
  await assert.rejects(getIssuePdf(id(2), '0', { id: id(4), role: 'sales_exec' }), { statusCode: 404 });
});
