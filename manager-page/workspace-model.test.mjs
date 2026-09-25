import test from 'node:test';
import assert from 'node:assert/strict';
import { initialDialogue, dialogueTransition } from './dialogue-model.mjs';
import { transition } from './collaboration-model.mjs';
import { defaultWorkspaceView, presentationFor, selectWorkspace } from './workspace-model.mjs';
import { canSeeWork, responsibility } from './work-responsibility.mjs';

test('different work uses common contracts but different evidence, batch, checklist and document blocks', () => {
  const s = initialDialogue(); const get = id => presentationFor(s, s.matters.find(m => m.id === id), 'marketing');
  for (const id of ['loss', 'replacement', 'customer', 'report', 'patrol']) {
    const p = get(id);
    assert.ok(p.goal && p.deliverable && p.owner && p.acceptor && p.due);
  }
  assert.deepEqual(get('loss').blocks.map(b => b.type), ['metrics', 'table']);
  assert.deepEqual(get('replacement').blocks.map(b => b.type), ['table', 'checklist']);
  assert.deepEqual(get('customer').blocks.map(b => b.type), ['checklist']);
  assert.deepEqual(get('report').blocks.map(b => b.type), ['document']);
  assert.equal(get('customer').related.length, 0);
  assert.equal(get('report').related.length, 0);
  assert.equal(get('report').blocks.some(b => b.type === 'metrics'), false);
});
test('an unfamiliar task can compose the same blocks without a line-loss id, chart, work order or four-role chain', () => {
  const s = initialDialogue();
  const item = { id: 'briefing', category: '会议组织', title: '周五服务例会', area: '会议室', initiator: 'marketing', acceptor: 'director', participants: ['marketing', 'director'], due: '周五', tasks: [{ id: 'agenda', title: '议程确认', kind: 'decision', role: 'director', status: 'ready', result: '' }], metrics: [], trend: [], presentation: { label: '会议协同', goal: '形成跨岗会议安排', deliverable: '议程与会议记录', blocks: [{ type: 'checklist', title: '会前准备', items: [{ label: '确认议程', taskId: 'agenda' }] }] } };
  const p = presentationFor(s, item, 'marketing');
  assert.equal(p.label, '会议协同'); assert.equal(p.blocks[0].items[0].role, 'director');
  assert.deepEqual(p.related, []); assert.equal(p.ready.length, 1); assert.equal(p.mine.length, 0);
  assert.ok(!JSON.stringify(p).includes('线损'));
  delete item.presentation;
  assert.equal(presentationFor(s, item, 'marketing').label, '会议组织');
});
test('a selected work stays pinned when filters, acknowledgment or completion remove it from the matching list', () => {
  let s = initialDialogue(); const view = { ...defaultWorkspaceView(), selectedId: 'loss' };
  s = transition(s, { type: 'act', role: 'director', matterId: 'loss', taskId: 'supervise', result: '同意督办' });
  const result = selectWorkspace(s, 'director', view);
  assert.equal(result.pinned.id, 'loss'); assert.equal(result.items[0].id, 'loss');
  assert.ok(!result.matches.some(m => m.id === 'loss'));
  assert.equal(selectWorkspace(s, 'director', { ...view, query: '客户' }).selected.id, 'loss');
  assert.equal(selectWorkspace(s, 'leader', { ...view, selectedId: 'customer' }).selected, undefined);
  assert.equal(view.context, undefined); assert.equal(view.lens, 'pending');
});
test('checklist evidence follows actual task results and old hypotheses stop appearing as unverified', () => {
  let s = initialDialogue();
  s = transition(s, { type: 'act', role: 'marketing', matterId: 'customer', taskId: 'customer-review', result: '资料已补齐' });
  const p = presentationFor(s, s.matters.find(m => m.id === 'customer'), 'marketing');
  assert.equal(p.blocks[0].items[0].status, 'done'); assert.equal(p.blocks[0].items[0].result, '资料已补齐');
  assert.equal(p.blocks[0].items[1].status, 'ready');
});
test('a report work keeps its own artifact context but gathers other authorized work as sources', () => {
  const s = dialogueTransition(initialDialogue(), { type: 'send', role: 'director', context: 'report', text: '生成工作报告', id: 'report-example' });
  const a = s.artifacts[0]; assert.equal(a.context, 'report'); assert.ok(!a.matterIds.includes('report')); assert.equal(a.matterIds.length, 4);
  assert.equal(presentationFor(s, s.matters.find(m => m.id === 'report'), 'director').outputs.length, 1);
  assert.equal(presentationFor(s, s.matters.find(m => m.id === 'loss'), 'director').outputs.length, 0);
  assert.equal(presentationFor(s, s.matters.find(m => m.id === 'report'), 'marketing').outputs.length, 0);
});

test('serial responsibility is released only after the previous role acts; upstream keeps tracking', () => {
  let s = initialDialogue(); const loss = () => s.matters.find(m => m.id === 'loss');
  assert.equal(canSeeWork(loss(), 'marketing'), false);
  assert.equal(canSeeWork(loss(), 'leader'), false);
  assert.equal(responsibility(loss(), 'director').bucket, 'pending');
  assert.deepEqual(selectWorkspace(s, 'marketing').relevant.map(m => m.id), ['replacement', 'customer']);
  assert.throws(() => transition(s, { type: 'act', role: 'marketing', matterId: 'loss', taskId: 'scope-check', result: '核对完成' }), /前序/);
  // Related business progress must not accidentally release the unassigned role.
  s = transition(s, { type: 'act', role: 'marketing', matterId: 'replacement', taskId: 'batch-confirm', result: '同意首批' });
  assert.equal(canSeeWork(loss(), 'marketing'), false);
  s = transition(s, { type: 'act', role: 'director', matterId: 'loss', taskId: 'supervise', result: '同意督办' });
  assert.equal(responsibility(loss(), 'director').bucket, 'following');
  assert.equal(responsibility(loss(), 'marketing').bucket, 'pending');
  assert.deepEqual(responsibility(loss(), 'marketing').mine.map(t => t.id), ['scope-check']);
  assert.equal(canSeeWork(loss(), 'leader'), false);
});

test('parallel independent duties and communication requests remain valid without duplicating cards', () => {
  const s = initialDialogue(); const customer = s.matters.find(m => m.id === 'customer');
  assert.equal(responsibility(customer, 'marketing').bucket, 'pending');
  assert.equal(responsibility(customer, 'manager').bucket, 'pending');
  let next = transition(s, { type: 'act', role: 'marketing', matterId: 'customer', taskId: 'customer-review', result: '资料已核对' });
  assert.equal(responsibility(next.matters.find(m => m.id === 'customer'), 'marketing').bucket, 'following');
  next = transition(next, { type: 'message', role: 'manager', matterId: 'customer', id: 'reply-needed', to: 'marketing', text: '请补充客户资料', waiting: true });
  const result = selectWorkspace(next, 'marketing');
  assert.equal(result.matches.filter(m => m.id === 'customer').length, 1);
  assert.match(responsibility(result.matches.find(m => m.id === 'customer'), 'marketing').label, /回复台区经理/);
});
