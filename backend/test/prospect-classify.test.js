import test from 'node:test';
import assert from 'node:assert/strict';
import Lead from '../src/models/Lead.js';
import Prospect from '../src/models/Prospect.js';
import AuditLog from '../src/models/AuditLog.js';
import { classifyProspect } from '../src/services/prospect.service.js';

const id = (n) => String(n).padStart(24, '0');
const executive = { id: id(1), role: 'sales_exec', user: { name: 'Executive' } };

function fixture(t, { leadType = 'company', departments = [{ _id: id(30), branch: 'Nagpur', name: 'HR' }] } = {}) {
  const prospect = new Prospect({
    _id: id(20),
    name: 'Ravi Sharma',
    mobile: '9876543210',
    email: 'ravi@example.com',
    assignedTo: executive.id,
    notes: [{ body: 'Wants a December date', author: executive.id, authorName: 'Executive' }],
    followUps: [{ _id: id(21), dueDate: new Date(), note: 'Call back' }],
  });
  prospect.save = async () => prospect;
  const lead = new Lead({
    _id: id(3),
    businessName: 'Tata Motors',
    reference: 'CPH-NGP-240926-001',
    leadType,
    assignedTo: executive.id,
    departments,
  });
  lead.save = async () => lead;
  t.mock.method(Prospect, 'findById', async () => prospect);
  t.mock.method(Lead, 'findById', async () => lead);
  t.mock.method(AuditLog, 'create', async () => ({}));
  return { prospect, lead };
}

test('a lead placed in a new department of an existing company creates the node and the contact', async (t) => {
  const { prospect, lead } = fixture(t);
  const result = await classifyProspect(
    prospect._id,
    { leadType: 'company', leadId: lead._id, department: { branch: 'Pune', name: 'Admin' }, designation: 'Admin Head' },
    executive
  );
  assert.equal(lead.departments.length, 2);
  const node = lead.departments[1];
  assert.equal(result.departmentId, String(node._id));
  assert.equal(node.contacts[0].name, 'Ravi Sharma');
  assert.equal(node.contacts[0].designation, 'Admin Head');
  assert.equal(lead.notes[0].body, 'Wants a December date');
  assert.equal(lead.followUps[0].note, 'Call back');
  assert.equal(prospect.classifiedAs, 'company');
  assert.equal(String(prospect.linkedLead), lead._id.toString());
  assert.equal(result.created, false);
});

test('a department that already exists (same branch and name) is reused, not duplicated', async (t) => {
  const { prospect, lead } = fixture(t);
  const result = await classifyProspect(
    prospect._id,
    { leadType: 'company', leadId: lead._id, department: { branch: 'nagpur', name: 'hr' } },
    executive
  );
  assert.equal(lead.departments.length, 1);
  assert.equal(result.departmentId, id(30));
  assert.equal(lead.departments[0].contacts.length, 1);
});

test('linking an individual to a company record is refused', async (t) => {
  const { prospect, lead } = fixture(t);
  await assert.rejects(
    classifyProspect(prospect._id, { leadType: 'individual', leadId: lead._id }, executive),
    /Pick an individual/
  );
  assert.equal(prospect.classifiedAt, undefined);
});

test('an already linked lead cannot be linked again', async (t) => {
  const { prospect, lead } = fixture(t, { leadType: 'individual', departments: [] });
  await classifyProspect(prospect._id, { leadType: 'individual', leadId: lead._id }, executive);
  assert.ok(prospect.classifiedAt);
  await assert.rejects(
    classifyProspect(prospect._id, { leadType: 'individual', leadId: lead._id }, executive),
    /already been linked/
  );
});

test('an executive cannot classify a lead assigned to someone else', async (t) => {
  const { prospect, lead } = fixture(t);
  prospect.assignedTo = id(9);
  await assert.rejects(
    classifyProspect(prospect._id, { leadType: 'company', leadId: lead._id, departmentId: id(30) }, executive),
    /Lead not found/
  );
});
