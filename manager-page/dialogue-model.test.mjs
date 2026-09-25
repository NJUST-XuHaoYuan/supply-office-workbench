import test from 'node:test';
import assert from 'node:assert/strict';
import { artifactStatus, initialDialogue, dialogueTransition, channelKey, parseDialogue, reportText } from './dialogue-model.mjs';
import { memberships, seed, transition } from './collaboration-model.mjs';

let seq = 0;
const send = (state, text, context = 'workspace', role = 'marketing', extra = {}) => dialogueTransition(state, { type: 'send', text, role, context, id: `test-${++seq}`, ...extra });
const history = (s, context = 'workspace', role = 'marketing') => s.conversations[channelKey(role, context)] || [];
const last = (...args) => history(...args).at(-1);
const confirm = (s, context, role = 'marketing') => send(s, '确认执行', context, role);
const m = (s, id = 'loss') => s.matters.find(m => m.id === id);
const act = (s, text, context = 'loss', role = 'marketing') => confirm(send(s, text, context, role), context, role);
const afterDirector = () => transition(initialDialogue(), { type: 'act', role: 'director', matterId: 'loss', taskId: 'supervise', result: '同意督办，责成营销员完成专业分析' });

test('conversation generates an actual report with traceable sources, no invented business totals', () => {
  const s = send(initialDialogue(), '帮我生成本周周报');
  assert.equal(s.artifacts.length, 1);
  const a = s.artifacts[0];
  assert.equal(a.matterIds.length, 2);
  assert.match(reportText(a), /2 件关联事项/);
  assert.ok(s.matters.some(m => m.id === a.context));
  assert.match(reportText(a), /不构成完整自然日或自然周/);
  assert.doesNotMatch(reportText(a), /已完成18|已完成 18/);
  assert.equal(last(s).artifactVersion, 1);
  assert.equal(s.matters.find(m => m.id === 'report').closed, false);
});
test('report revisions preserve old content and each conversation artifact links to its own version', () => {
  const first = send(initialDialogue(), '生成日报');
  const original = structuredClone(first.artifacts[0].versions[0]);
  const context = first.artifacts[0].context;
  const s = send(first, '精简成三点', context);
  assert.equal(s.artifacts[0].versions.length, 2);
  assert.deepEqual(s.artifacts[0].versions[0], original);
  assert.equal(last(s, context).artifactVersion, 2);
  assert.equal(s.artifacts[0].versions[1].sections.length, 3);
  assert.equal(history(s, context)[1].artifactVersion, 1);
});
test('negative and interrogative requests never perform or propose actions', () => {
  for (const text of ['不要创建自主工单', '我未核对采集口径，不能确认', '是否可以确认核查范围？', '不要生成周报', '效果验证不正常，不能收口']) {
    const base = afterDirector(); const s = send(base, text, 'loss');
    assert.deepEqual(s.matters, base.matters);
    assert.equal(last(s, 'loss').proposal, undefined);
    assert.equal(s.artifacts.length, 0);
  }
});
test('a pending opinion is not a completed human action; confirmation updates the shared matter', () => {
  let s = send(afterDirector(), '采集口径已核对，总表分表统计时点一致，数据完整', 'loss');
  assert.equal(m(s).tasks.find(t => t.id === 'scope-check').status, 'ready');
  assert.equal(last(s, 'loss').proposal.status, 'pending');
  s = confirm(s, 'loss');
  assert.equal(m(s).tasks.find(t => t.id === 'scope-check').status, 'done');
  assert.equal(history(s, 'loss')[1].proposal.status, 'confirmed');
  s = act(s, '确认专业分析与核查范围，按两处疑似范围核查');
  assert.equal(m(s).orders.length, 1);
  assert.equal(m(s).closed, false);
});
test('explicit report context revises the selected older artifact, not the latest one', () => {
  let s = send(initialDialogue(), '生成周报');
  const target = s.artifacts[0].id;
  const context = s.artifacts[0].context;
  s = send(s, '生成日报');
  s = send(s, '精简成三点', context, 'marketing', { artifactId: target });
  assert.equal(s.artifacts[0].versions.length, 1);
  assert.equal(s.artifacts[1].versions.length, 2);
});
test('proposals cannot bypass prerequisites or role boundaries', () => {
  assert.throws(() => send(initialDialogue(), '确认专业分析与核查范围', 'loss'), /尚未下发/);
  const s = send(afterDirector(), '确认专业分析与核查范围', 'loss');
  assert.equal(last(s, 'loss').proposal, undefined);
  assert.match(last(s, 'loss').text, /核对关键时段采集口径/);
  assert.equal(m(s).orders.length, 0);
  assert.throws(() => send(s, '生成日报', 'customer', 'leader'), /不参与/);
  const r = send(s, '确认专业分析与核查范围', 'loss', 'director');
  assert.equal(last(r, 'loss', 'director').proposal, undefined);
});
test('stale approvals do not apply and acknowledgement does not remove responsibilities', () => {
  let s = send(afterDirector(), '采集口径已核对，总分表时点一致且数据完整', 'loss');
  s = transition(s, { type: 'message', role: 'leader', matterId: 'loss', id: 'new', to: 'marketing', text: '新的现场信息', waiting: true });
  s = confirm(s, 'loss');
  assert.equal(history(s, 'loss')[1].proposal.status, 'expired');
  assert.equal(m(s).tasks.find(t => t.id === 'scope-check').status, 'ready');
  s = send(s, '已知晓', 'loss');
  assert.deepEqual(memberships(s, m(s), 'marketing'), ['do', 'talk']);
});
test('conversation drafts a role-linked message, sends only on confirmation, and preserves original text', () => {
  let s = send(afterDirector(), '回复班长：范围确认后可以一并进场，请反馈资源安排', 'loss');
  assert.equal(m(s).messages.length, 0);
  assert.equal(last(s, 'loss').proposal.action.to, 'leader');
  s = confirm(s, 'loss');
  assert.equal(m(s).messages.length, 1);
  assert.equal(m(s).messages.at(-1).text, '范围确认后可以一并进场，请反馈资源安排');
  assert.ok(memberships(s, m(s), 'leader').includes('talk'));
});
test('autonomous order is prepared locally, stops at human gate, and returns a MOCK receipt', () => {
  let s = send(initialDialogue(), '为新桥村3号台区创建采集异常核实自主工单');
  const id = s.matters[0].id;
  assert.equal(s.matters[0].area, '新桥村3号台区');
  assert.equal(s.matters[0].tasks.filter(t => t.kind === 'human').length, 0);
  s = dialogueTransition(s, { type: 'domain-tick' }); s = dialogueTransition(s, { type: 'domain-tick' });
  assert.equal(m(s, id).jobs[0].status, 'waiting');
  assert.equal(last(s, id).proposal.status, 'pending');
  assert.equal(m(s, id).orders.length, 0);
  s = confirm(s, id);
  s = dialogueTransition(s, { type: 'domain-tick' }); s = dialogueTransition(s, { type: 'domain-tick' });
  assert.equal(m(s, id).jobs[0].status, 'done');
  assert.match(m(s, id).orders[0].id, /^MOCK-/);
  s = act(s, '安排台区经理王晨落实，核实后反馈', id);
  assert.ok(m(s, id).participants.includes('manager'));
});
test('downward assignment and upward report follow distinct human gates through final acceptance', () => {
  let s = act(initialDialogue(), '同意发起督办，责成营销员完成专业分析', 'loss', 'director');
  s = act(s, '采集口径已核对，总分表统计时点一致、数据完整');
  s = act(s, '确认专业分析与核查范围，两处重点位置');
  s = act(s, '确认将12只轮换表计前移到首批', 'replacement');
  s = act(s, '确认现场安排，派发给台区经理王晨', 'loss', 'leader');
  assert.equal(s.package.status, 'dispatched');
  s = act(s, '现场核查已完成，7号表箱异常点已核实并整改，记录齐全', 'loss', 'manager');
  s = act(s, '现场结果已复核，确认回复督办，继续观察');
  assert.equal(m(s).phase, '待效果验证');
  let denied = send(s, '效果验证预计后天正常', 'loss');
  assert.equal(last(denied, 'loss').proposal, undefined);
  s = act(s, '效果验证已完成，后续两个统计周期数据已核实，结果恢复正常');
  assert.equal(m(s).closed, false);
  s = act(s, '确认验收通过，依据已核对，当前督办收口', 'loss', 'director');
  assert.equal(m(s).closed, true);
  assert.equal(m(s, 'replacement').closed, false);
});
test('unsupported requests are transparent, isolated by role and matter, and storage round-trips', () => {
  const s = send(afterDirector(), '帮我买杯咖啡', 'loss');
  assert.match(last(s, 'loss').text, /超出了当前对话样例/);
  assert.equal(history(s, 'loss', 'director').length, 0);
  assert.equal(history(s, 'workspace').length, 0);
  assert.deepEqual(parseDialogue(JSON.stringify(s)), s);
  assert.throws(() => parseDialogue(JSON.stringify({ ...s, conversations: [] })), /对话记录不完整/);
});

test('old snapshots migrate report ownership without resetting completed decisions or losing versions', () => {
  const old = { ...seed(), dialogueVersion: 1, conversations: { 'marketing:workspace': [{ id: 'legacy-answer', sender: 'assistant', text: '旧版报告', artifactId: 'old-doc', artifactVersion: 1 }] }, artifacts: [{ id: 'old-doc', title: '工作周报', owner: 'marketing', context: 'workspace', matterIds: ['loss'], createdAt: '2026-09-24T09:00:00+08:00', versions: [{ number: 1, sections: [{ title: '进展', lines: ['原始记录'] }] }] }] };
  const migrated = parseDialogue(JSON.stringify(old));
  assert.equal(m(migrated).tasks.find(t => t.id === 'supervise').status, 'done');
  assert.deepEqual(migrated.artifacts[0].versions, old.artifacts[0].versions);
  assert.equal(migrated.artifacts[0].context, 'report-old-doc');
  assert.equal(m(migrated, 'report-old-doc').initiator, 'marketing');
  assert.equal(history(migrated, 'report-old-doc')[0].artifactId, 'old-doc');
  assert.deepEqual(parseDialogue(JSON.stringify(migrated)), migrated);
  old.artifacts[0].context = 'report';
  const personal = parseDialogue(JSON.stringify(old));
  assert.equal(personal.artifacts[0].context, 'report-old-doc', 'A personal draft in another role report gets its own work');
});

test('report approval is invalidated by revision and never closes source work; closed reports are immutable', () => {
  let s = send(initialDialogue(), '生成周报'); const context = s.artifacts[0].context;
  s = send(s, '确认报告，依据已审阅', context);
  const proposal = last(s, context).id;
  s = send(s, '精简成三点', context);
  s = dialogueTransition(s, { type: 'confirm', role: 'marketing', context, messageId: proposal });
  assert.equal(m(s, context).closed, false);
  assert.equal(history(s, context).find(msg => msg.id === proposal).proposal.status, 'expired');
  s = act(s, '确认报告，依据已审阅', context);
  assert.equal(m(s, context).closed, true);
  assert.equal(m(s, 'customer').closed, false);
  assert.ok(s.artifacts[0].reviewedAt);
  assert.equal(artifactStatus(s.artifacts[0]), '演示审阅已确认');
  assert.equal(artifactStatus(s.artifacts[0], 1), '历史版本');
  const versions = structuredClone(s.artifacts);
  s = send(s, '精简成三点', context);
  assert.deepEqual(s.artifacts, versions);
  assert.match(last(s, context).text, /只读/);
  assert.throws(() => transition(initialDialogue(), { type: 'act', role: 'director', matterId: 'report', taskId: 'accept-report', result: '同意收口' }), /正文尚未生成/);
});

test('report revision cannot target a report owned by another work even through an old reference', () => {
  let s = send(afterDirector(), '生成工作报告', 'loss');
  const a = s.artifacts[0];
  s = send(s, '精简成三点', 'loss', 'marketing', { artifactId: a.id });
  assert.equal(s.artifacts[0].versions.length, 1);
  s = send(s, '精简成三点', a.context, 'marketing', { artifactId: a.id });
  assert.equal(s.artifacts[0].versions.length, 2);
});

test('plain assent proposes the only current decision, without executing it or fabricating human work', () => {
  let s = send(initialDialogue(), '同意', 'loss', 'director');
  assert.equal(m(s).tasks.find(t => t.id === 'supervise').status, 'ready');
  assert.equal(last(s, 'loss', 'director').proposal.action.taskId, 'supervise');
  s = confirm(s, 'loss', 'director');
  assert.equal(m(s).tasks.find(t => t.id === 'supervise').status, 'done');
  s = send(s, '同意', 'loss');
  assert.equal(last(s, 'loss').proposal, undefined);
  assert.match(last(s, 'loss').text, /实际办理结果/);
  assert.equal(m(s).tasks.find(t => t.id === 'scope-check').status, 'ready');
  const ambiguous = initialDialogue();
  m(ambiguous).tasks.push({ id: 'extra', role: 'director', kind: 'decision', title: '另一项安排', status: 'ready', result: '' });
  const undecided = send(ambiguous, '同意', 'loss', 'director');
  assert.equal(last(undecided, 'loss', 'director').proposal, undefined);
  assert.match(last(undecided, 'loss', 'director').text, /哪一项/);
});
