import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { once } from 'node:events';
import mongoose from 'mongoose';
import Lead from '../src/models/Lead.js';
import Enquiry from '../src/models/Enquiry.js';
import FunctionProspectus from '../src/models/FunctionProspectus.js';
import BanquetEstimate from '../src/models/BanquetEstimate.js';
import BanquetSettings from '../src/models/BanquetSettings.js';
import AuditLog from '../src/models/AuditLog.js';
import User from '../src/models/User.js';
import prospectusRoutes from '../src/routes/prospectus.routes.js';
import estimateRoutes from '../src/routes/estimate.routes.js';
import reportRoutes from '../src/routes/report.routes.js';
import { errorHandler } from '../src/middleware/error.js';
import { requireModule } from '../src/middleware/rbac.js';
import { createUserSchema, updateUserSchema } from '../src/validation/user.validation.js';
import { assertDocumentAccess, documentScope } from '../src/utils/access.js';
import * as fpService from '../src/services/prospectus.service.js';
import * as estimateService from '../src/services/estimate.service.js';
import { loadLeadScoped } from '../src/services/lead.service.js';

const id = (n) => String(n).padStart(24, '0');
const executive = { id: id(1), role: 'sales_exec', user: { name: 'Executive', modules: ['leads', 'prospectus', 'estimates'] } };
const manager = { id: id(2), role: 'manager', user: { name: 'Manager', modules: ['leads', 'prospectus', 'estimates'] } };
const accountsManager = { ...manager, user: { ...manager.user, modules: ['estimates'] } };
const other = id(3);

function query(value) {
  const q = { then: (resolve, reject) => Promise.resolve(value).then(resolve, reject) };
  for (const key of ['populate', 'select', 'sort', 'limit', 'lean']) q[key] = () => q;
  return q;
}

async function request(t, actor, path, method = 'GET', body) {
  const app = express();
  app.use(express.json(), (req, _res, next) => { req.user = actor; next(); });
  app.use('/prospectus', prospectusRoutes);
  app.use('/estimates', estimateRoutes);
  app.use(errorHandler);
  const server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  try {
    const response = await fetch(`http://127.0.0.1:${server.address().port}${path}`, {
      method, headers: { 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined,
    });
    return { status: response.status, body: await response.json() };
  } finally {
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
  }
}

test('Manager can be created/edited without becoming an administrator', () => {
  const data = { name: 'Accounts Manager', email: 'manager@example.test', password: 'Example123', role: 'manager', modules: ['estimates'] };
  assert.equal(createUserSchema.parse(data).role, 'manager');
  assert.equal(updateUserSchema.parse({ role: 'manager' }).role, 'manager');
  assert.equal(new User(data).validateSync()?.errors.role, undefined);
  assert.equal(createUserSchema.safeParse({ ...data, password: '1234' }).success, false);
  assert.equal(createUserSchema.safeParse({ ...data, role: 'superuser' }).success, false);
});

test('Module assignments still restrict managers', () => {
  let error;
  requireModule('prospectus')({ user: accountsManager }, {}, (e) => { error = e; });
  assert.equal(error.statusCode, 403);
  requireModule('estimates')({ user: accountsManager }, {}, (e) => { error = e; });
  assert.equal(error, undefined);
});

test('Executive visibility uses own documents or assigned leads; managers see all', async (t) => {
  t.mock.method(Lead, 'distinct', async () => [new mongoose.Types.ObjectId(id(4))]);
  const scope = await documentScope(executive);
  assert.equal(String(scope.$and[0].$or[0].madeBy), executive.id);
  assert.equal(String(scope.$and[0].$or[1].lead.$in[0]), id(4));
  assert.deepEqual(await documentScope(manager), {});
  t.mock.method(Lead, 'exists', async () => null);
  await assert.rejects(assertDocumentAccess({ madeBy: other, lead: id(4) }, executive), { statusCode: 404 });
  await assertDocumentAccess({ madeBy: executive.id }, executive);
  await assertDocumentAccess({ madeBy: other }, manager);
});

test('Leads detail allows managers and denies another executive', async (t) => {
  t.mock.method(Lead, 'findById', async () => ({ assignedTo: other }));
  await assert.rejects(loadLeadScoped(id(4), executive), { statusCode: 404 });
  assert.equal((await loadLeadScoped(id(4), manager)).assignedTo, other);
});

test('Direct FP approval, print, preview and email requests are manager-only', async (t) => {
  for (const [path, method] of [['approve', 'POST'], ['pdf', 'GET'], ['pdf?stamp=0', 'GET'], ['email', 'POST']]) {
    const res = await request(t, executive, `/prospectus/${id(5)}/${path}`, method);
    assert.equal(res.status, 403, path);
  }
});

test('Another executive cannot read, edit or refresh an FP', async (t) => {
  t.mock.method(FunctionProspectus, 'findById', () => query({ _id: id(5), madeBy: other }));
  for (const [suffix, method, body] of [['', 'GET'], ['', 'PATCH', { liquorMenu: 'Changed' }], ['/refresh', 'POST']]) {
    assert.equal((await request(t, executive, `/prospectus/${id(5)}${suffix}`, method, body)).status, 404);
  }
});

test('An executive cannot make an FP from an unassigned confirmed booking', async (t) => {
  t.mock.method(Enquiry, 'findById', () => query({ _id: id(6), stage: 'won', lead: id(4) }));
  t.mock.method(Lead, 'exists', async () => null);
  await assert.rejects(fpService.createProspectus({ enquiryId: id(6), functionId: id(7) }, executive), { statusCode: 404 });
});

test('Manager approval is recorded; editing the approved FP requires fresh approval', async (t) => {
  const fp = { _id: id(5), number: '0001', madeBy: executive.id, status: 'draft', save: async () => {} };
  t.mock.method(FunctionProspectus, 'findById', () => query(fp));
  t.mock.method(Enquiry, 'findById', () => query(null));
  const audit = t.mock.method(AuditLog, 'create', async () => ({}));
  await fpService.approveProspectus(id(5), manager);
  assert.equal(fp.status, 'approved');
  assert.equal(fp.approval.by, manager.id);
  assert.equal(audit.mock.calls[0].arguments[0].action, 'prospectus.approve');
  await fpService.updateProspectus(id(5), { liquorMenu: 'Revised menu', status: 'approved' }, executive);
  assert.equal(fp.liquorMenu, 'Revised menu');
  assert.equal(fp.status, 'draft');
  assert.equal(fp.approval, undefined);
});

test('Draft FP cannot be printed, even with stamp=0', async (t) => {
  t.mock.method(FunctionProspectus, 'findById', () => query({ status: 'draft' }));
  for (const suffix of ['pdf', 'pdf?stamp=0']) {
    const res = await request(t, manager, `/prospectus/${id(5)}/${suffix}`);
    assert.equal(res.status, 409);
    assert.equal(res.body.error.code, 'PROSPECTUS_NOT_APPROVED');
  }
});

test('Manager can generate an approved FP PDF and record the print time', async (t) => {
  const fp = new FunctionProspectus({ number: '0001', enquiry: id(6), functionId: id(7),
    partyName: 'Test guest', functionType: 'Dinner', status: 'approved', madeBy: executive.id });
  let saved = false;
  fp.save = async () => { saved = true; };
  t.mock.method(FunctionProspectus, 'findById', () => query(fp));
  // The print reads the department mailboxes for its sign-off boxes.
  t.mock.method(BanquetSettings, 'findOne', () => query({ sessionsSeeded: true, prospectusRecipients: [{ name: 'Kitchen', email: 'kitchen@example.test' }] }));
  const file = await fpService.prospectusPdf(String(fp._id), manager);
  assert.equal(file.buffer.subarray(0, 4).toString(), '%PDF');
  assert.ok(fp.printedAt instanceof Date);
  assert.equal(saved, true);
});

test('Accounts manager can read FP source without FP module or editing permission', async (t) => {
  t.mock.method(FunctionProspectus, 'findById', () => query({ _id: id(5), number: '0001' }));
  t.mock.method(Enquiry, 'findById', () => query(null));
  assert.equal((await request(t, accountsManager, `/estimates/sheets/${id(5)}`)).status, 200);
  assert.equal((await request(t, accountsManager, `/prospectus/${id(5)}`, 'PATCH', { liquorMenu: 'Changed' })).status, 403);
  assert.equal((await request(t, executive, `/estimates/sheets/${id(5)}`)).status, 403);
});

test('Accounts confirmed-function view is manager-only and includes all lead owners', async (t) => {
  let filter;
  t.mock.method(Enquiry, 'find', (f) => { filter = f; return query([]); });
  t.mock.method(FunctionProspectus, 'find', () => query([]));
  assert.equal((await request(t, accountsManager, '/estimates/confirmed')).status, 200);
  assert.equal(filter.stage, 'won');
  assert.equal(filter.lead, undefined);
  assert.equal((await request(t, executive, '/estimates/confirmed')).status, 403);
});

test('Estimate approval is manager-only; other executives cannot read or alter it', async (t) => {
  t.mock.method(BanquetEstimate, 'findById', () => query({ _id: id(8), madeBy: other }));
  assert.equal((await request(t, executive, `/estimates/${id(8)}/approve`, 'POST')).status, 403);
  for (const [suffix, method, body] of [['', 'GET'], ['', 'PATCH', { remarks: 'Changed' }], ['/refresh', 'POST'], ['/pdf?stamp=0', 'GET'], ['/email', 'POST']]) {
    assert.equal((await request(t, executive, `/estimates/${id(8)}${suffix}`, method, body)).status, 404);
  }
});

test('Executive cannot raise an estimate from someone else’s FP', async (t) => {
  t.mock.method(FunctionProspectus, 'findById', async () => ({ _id: id(5), madeBy: other }));
  await assert.rejects(estimateService.createEstimate({ prospectusId: id(5) }, executive), { statusCode: 404 });
});

test('Manager approves estimates; approved estimates stay locked for all roles', async (t) => {
  const est = { _id: id(8), madeBy: executive.id, status: 'draft', save: async () => {} };
  t.mock.method(BanquetEstimate, 'findById', () => query(est));
  t.mock.method(FunctionProspectus, 'findById', () => query(null));
  t.mock.method(AuditLog, 'create', async () => ({}));
  await estimateService.approveEstimate(id(8), manager);
  assert.equal(est.status, 'approved');
  assert.equal(est.approval.by, manager.id);
  for (const actor of [executive, manager]) {
    await assert.rejects(estimateService.updateEstimate(id(8), { remarks: 'Changed' }, actor), { code: 'ESTIMATE_LOCKED' });
  }
});

test('Executives can prepare their own estimate but cannot set its approval', async (t) => {
  const est = { _id: id(8), madeBy: executive.id, status: 'draft', save: async () => {} };
  t.mock.method(BanquetEstimate, 'findById', () => query(est));
  t.mock.method(FunctionProspectus, 'findById', () => query(null));
  t.mock.method(AuditLog, 'create', async () => ({}));
  const res = await request(t, executive, `/estimates/${id(8)}`, 'PATCH', { remarks: 'Prepared by accounts', status: 'approved', approval: { by: executive.id } });
  assert.equal(res.status, 200);
  assert.equal(est.remarks, 'Prepared by accounts');
  assert.equal(est.status, 'draft');
  assert.equal(est.approval, undefined);
});

test('Executive overview counters are scoped in both modules', async (t) => {
  t.mock.method(Lead, 'distinct', async () => []);
  t.mock.method(Enquiry, 'find', () => query([]));
  t.mock.method(FunctionProspectus, 'find', () => query([]));
  t.mock.method(BanquetEstimate, 'find', () => query([]));
  const fpCount = t.mock.method(FunctionProspectus, 'countDocuments', async () => 0);
  const estCount = t.mock.method(BanquetEstimate, 'countDocuments', async () => 0);
  await fpService.overview(executive);
  await estimateService.overview(executive);
  for (const counter of [fpCount, estCount]) {
    assert.equal(counter.mock.calls.length, 3);
    for (const call of counter.mock.calls) {
      assert.equal(String(call.arguments[0].$and[0].$or[0].madeBy), executive.id);
    }
  }
});

test('Search filters preserve ownership for both document lists', async (t) => {
  t.mock.method(Lead, 'distinct', async () => []);
  for (const [model, list] of [[FunctionProspectus, fpService.listProspectuses], [BanquetEstimate, estimateService.listEstimates]]) {
    let filter;
    t.mock.method(model, 'find', (f) => { filter = f; return query([]); });
    await list({ q: 'guest' }, executive);
    assert.ok(filter.$or.length > 0);
    assert.equal(String(filter.$and[0].$or[0].madeBy), executive.id);
    await list({ q: 'guest' }, manager);
    assert.equal(filter.$and, undefined);
  }
});

test('Management reports (performance, productivity, ageing, audit) are for admins and managers only', () => {
  for (const path of ['/team', '/team/export']) {
    const layer = reportRoutes.stack.find((l) => l.route?.path === path);
    assert.ok(layer, `${path} is routed`);
    const guard = layer.route.stack.find((l) => l.handle.name === 'roleGuard')?.handle;
    assert.ok(guard, `${path} carries a role guard`);
    let error;
    guard({ user: executive }, {}, (e) => { error = e; });
    assert.equal(error.statusCode, 403);
    guard({ user: manager }, {}, (e) => { error = e; });
    assert.equal(error, undefined);
    guard({ user: { ...manager, role: 'admin' } }, {}, (e) => { error = e; });
    assert.equal(error, undefined);
  }
});
