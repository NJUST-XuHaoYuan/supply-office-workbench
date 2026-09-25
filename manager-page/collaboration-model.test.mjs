import test from 'node:test';
import assert from 'node:assert/strict';
import { memberships, parse, seed, transition, viewCounts } from './collaboration-model.mjs';

const find = (state, id) => state.matters.find(m => m.id === id);
const act = (state, role, matterId, taskId, extra = {}) => transition(state, { type: 'act', role, matterId, taskId, result: '已核对样例依据并确认本次处理', ...extra });
const prepared = () => {
  let state = seed();
  state = act(state, 'marketing', 'loss', 'scope-check');
  state = act(state, 'marketing', 'loss', 'analysis-confirm');
  state = act(state, 'marketing', 'replacement', 'batch-confirm');
  return state;
};

test('one matter exists in four overlapping personal views; knowledge acknowledgment does not remove responsibilities', () => {
  const start = seed();
  assert.deepEqual(memberships(start, find(start, 'loss'), 'marketing'), ['know', 'decide', 'do', 'talk']);
  const next = transition(start, { type: 'ack', role: 'marketing', matterId: 'loss' });
  assert.deepEqual(memberships(next, find(next, 'loss'), 'marketing'), ['decide', 'do', 'talk']);
  assert.ok(memberships(next, find(next, 'loss'), 'director').includes('know'));
  assert.equal(start.acks['marketing:loss'], undefined);
  const updated = act(next, 'marketing', 'loss', 'scope-check');
  assert.ok(memberships(updated, find(updated, 'loss'), 'marketing').includes('know'));
});

test('confirmation has a real prerequisite and role; actions are idempotent', () => {
  assert.throws(() => act(seed(), 'marketing', 'loss', 'analysis-confirm'), /采集口径/);
  assert.throws(() => act(seed(), 'manager', 'loss', 'scope-check'), /责任岗位/);
  const state = act(seed(), 'marketing', 'loss', 'scope-check');
  assert.equal(act(state, 'marketing', 'loss', 'scope-check'), state);
  const approved = act(state, 'marketing', 'loss', 'analysis-confirm');
  assert.equal(find(approved, 'loss').orders.length, 1);
  assert.equal(find(approved, 'loss').tasks.find(t => t.id === 'dispatch').status, 'blocked');
});

test('shared package dispatch respects independent business orders and local results', () => {
  let state = prepared();
  assert.equal(find(state, 'loss').tasks.find(t => t.id === 'dispatch').status, 'ready');
  state = act(state, 'leader', 'loss', 'dispatch', { vehicle: '工程车 02（样例）' });
  assert.equal(state.package.status, 'dispatched');
  assert.equal(state.package.vehicle, '工程车 02（样例）');
  for (const id of state.package.matterIds) assert.equal(find(state, id).tasks.find(t => t.kind === 'human' && t.role === 'manager').status, 'ready');
  state = act(state, 'manager', 'loss', 'loss-field');
  assert.equal(find(state, 'loss').phase, '待专业复核');
  assert.equal(find(state, 'replacement').tasks.find(t => t.id === 'replace-field').status, 'ready');
  assert.equal(find(state, 'patrol').tasks.find(t => t.id === 'patrol-field').status, 'ready');
  assert.notEqual(find(state, 'loss').orders[0].id, find(state, 'replacement').orders[0].id);
});

test('execution, professional report, effect verification and final acceptance are separate', () => {
  let state = act(prepared(), 'leader', 'loss', 'dispatch');
  state = act(state, 'manager', 'loss', 'loss-field');
  state = act(state, 'marketing', 'loss', 'review-result');
  assert.equal(find(state, 'loss').closed, false);
  assert.equal(find(state, 'loss').verified, false);
  assert.throws(() => act(state, 'director', 'loss', 'accept-loss'));
  state = act(state, 'marketing', 'loss', 'verify-effect');
  assert.equal(find(state, 'loss').closed, false);
  state = act(state, 'director', 'loss', 'accept-loss');
  assert.equal(find(state, 'loss').closed, true);
  assert.equal(find(state, 'replacement').closed, false);
  assert.equal(find(state, 'patrol').closed, false);
});

test('self-initiated order is handled by DSH simulation, not immediately converted into a human task', () => {
  let state = transition(seed(), { type: 'create', role: 'manager', id: 'own', title: '采集异常核实', area: '新桥村', mode: 'order' });
  assert.deepEqual(memberships(state, find(state, 'own'), 'manager'), ['know']);
  assert.equal(find(state, 'own').orders.length, 0);
  state = transition(state, { type: 'tick' });
  state = transition(state, { type: 'job-control', role: 'manager', matterId: 'own', jobId: 'job-own' });
  assert.equal(transition(state, { type: 'tick' }), state);
  state = transition(state, { type: 'job-control', role: 'manager', matterId: 'own', jobId: 'job-own' });
  state = transition(state, { type: 'tick' });
  assert.equal(find(state, 'own').jobs[0].status, 'waiting');
  assert.ok(memberships(state, find(state, 'own'), 'manager').includes('decide'));
  state = act(state, 'manager', 'own', 'confirm-own');
  state = transition(state, { type: 'tick' }); state = transition(state, { type: 'tick' });
  assert.match(find(state, 'own').orders[0].id, /^MOCK-/);
  assert.equal(find(state, 'own').tasks.filter(t => t.kind === 'human').length, 0);
  state = act(state, 'manager', 'own', 'next-own', { assignee: 'marketing' });
  assert.ok(memberships(state, find(state, 'own'), 'marketing').includes('do'));
  state = act(state, 'marketing', 'own', 'follow-own');
  assert.ok(memberships(state, find(state, 'own'), 'manager').includes('decide'));
  state = act(state, 'manager', 'own', 'accept-own');
  assert.equal(find(state, 'own').closed, true);
  assert.deepEqual(parse(JSON.stringify(state)), state);
});

test('non-order work does not fabricate a formal business order', () => {
  let state = transition(seed(), { type: 'create', role: 'director', id: 'report-own', title: '本周工作报告', area: '全所', mode: 'work' });
  state = transition(state, { type: 'tick' }); state = transition(state, { type: 'tick' });
  state = act(state, 'director', 'report-own', 'confirm-report-own');
  state = transition(state, { type: 'tick' }); state = transition(state, { type: 'tick' });
  assert.equal(find(state, 'report-own').orders.length, 0);
  state = act(state, 'director', 'report-own', 'next-report-own');
  assert.equal(find(state, 'report-own').closed, true);
});

test('matter-linked questions and replies update the appropriate role view only', () => {
  let state = transition(seed(), { type: 'message', role: 'marketing', matterId: 'loss', id: 'reply1', to: 'leader', text: '已确认可以统筹，稍后提交核查范围。', waiting: false });
  assert.equal(memberships(state, find(state, 'loss'), 'marketing').includes('talk'), false);
  state = transition(state, { type: 'message', role: 'marketing', matterId: 'customer', id: 'question2', to: 'manager', text: '请补充核实时间。', waiting: true });
  assert.ok(memberships(state, find(state, 'customer'), 'manager').includes('talk'));
  assert.equal(find(state, 'customer').messages[0].sample, false);
  assert.throws(() => transition(state, { type: 'message', role: 'marketing', matterId: 'customer', to: 'marketing', text: '不能发给自己' }));
});

test('invalid data and empty actions are rejected; view counts are not unique matter totals', () => {
  const state = seed(); const c = viewCounts(state, 'marketing');
  assert.ok(Object.values(c).reduce((a, b) => a + b, 0) > state.matters.filter(m => m.participants.includes('marketing')).length);
  assert.throws(() => act(state, 'marketing', 'loss', 'scope-check', { result: ' ' }));
  assert.throws(() => parse('{bad'));
  assert.throws(() => parse(JSON.stringify({ ...state, matters: [] })));
  assert.deepEqual(parse(JSON.stringify(state)), state);
});
