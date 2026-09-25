import { parse, pendingTasks, roleById, roles, seed, transition } from './collaboration-model.mjs';
import { canSeeWork } from './work-responsibility.mjs';

export const DIALOGUE_STORE = 'supply-dialogue-prototype-v1';
export const channelKey = (role, context = 'workspace') => `${role}:${context}`;
export function initialDialogue(base) {
  const data = base || seed();
  if (!base) {
    const released = { loss: ['director'], replacement: ['marketing', 'director'], patrol: ['leader', 'director'], customer: ['marketing', 'manager', 'director'], report: ['director'] };
    data.matters.forEach(m => { m.releasedRoles = released[m.id]; });
    const loss = data.matters.find(m => m.id === 'loss');
    loss.tasks.forEach(t => { t.status = t.id === 'supervise' ? 'ready' : 'blocked'; t.result = ''; });
    loss.tasks.find(t => t.id === 'scope-check').dependsOn = ['supervise'];
    loss.tasks.find(t => t.id === 'analysis-confirm').dependsOn = ['scope-check'];
    loss.phase = '待所长决定'; loss.origin = '监测异常提示';
    loss.summary = '连续多个统计周期轻微高损，雨后波动加大。是否责成营销员开展专业分析？';
    loss.analysis = '监测提示需要进一步核实；疑似位置为演示线索，尚未经专业确认。';
    loss.events = [{ id: 'loss-detected', actor: 'dsh', text: '监测异常样例已归集，等待所长决定是否发起督办。', at: '2026-09-24T08:00:00+08:00' }];
    loss.jobs = []; loss.messages = [];
    const report = data.matters.find(m => m.id === 'report');
    report.title = '全所工作情况汇总'; report.phase = '待整理报告'; report.metrics = []; report.jobs = [];
    report.summary = '归集现有工作记录，形成进展、未收口事项与后续安排的汇总。';
    report.tasks[0].title = '确定汇总范围并生成报告';
    report.events = [{ id: 'report-request', actor: 'director', text: '安排 DSH 根据当前演示工作记录整理报告。', at: '2026-09-24T08:00:00+08:00' }];
  }
  return upgradeDialogue({ ...data, dialogueVersion: 1, conversations: {}, artifacts: [] });
}

function reportMatter(state, id, role, title, now) {
  const template = seed().matters.find(m => m.id === 'report');
  return { ...template, id, number: `DOC-${id.replace('report-', '').slice(0, 8)}`, title, area: '全所', origin: `${roleById(role).short}自主发起`, initiator: role, acceptor: role, participants: [role],
    summary: 'DSH 已整理报告初稿，等待审阅；引用事项的办理状态保持不变。',
    metrics: [], tasks: [{ id: `accept-${id}`, role, kind: 'decision', title: '审阅并确认报告', status: 'ready', description: '', result: '' }],
    jobs: [], events: [{ id: `generated-${id}`, actor: 'dsh', text: '报告初稿已生成，等待人工审阅。', at: now }], messages: [], orders: [], version: 1, closed: false };
}

// Preserve earlier work and decisions; only move document ownership out of unrelated conversations.
function upgradeDialogue(data) {
  if (data.workspaceVersion === 2) return data;
  const next = structuredClone(data);
  const loss = next.matters.find(m => m.id === 'loss');
  const scope = loss.tasks.find(t => t.id === 'scope-check');
  const analysis = loss.tasks.find(t => t.id === 'analysis-confirm');
  if (scope.status !== 'done' && analysis.status !== 'done') { analysis.status = 'blocked'; analysis.dependsOn = ['scope-check']; }
  for (const artifact of next.artifacts) {
    const ownerWork = next.matters.find(m => m.id === artifact.context && m.category === '综合事务');
    if (ownerWork && ownerWork.initiator === artifact.owner) continue;
    const id = `report-${artifact.id}`;
    next.matters.unshift(reportMatter(next, id, artifact.owner, artifact.title, artifact.createdAt));
    artifact.context = id;
    next.conversations[channelKey(artifact.owner, id)] = Object.entries(next.conversations).filter(([key]) => key.startsWith(artifact.owner + ':')).flatMap(([, messages]) => messages.filter(m => m.artifactId === artifact.id));
  }
  next.workspaceVersion = 2;
  return next;
}
export function parseDialogue(raw, legacy) {
  if (!raw) return initialDialogue(legacy ? parse(legacy) : undefined);
  const data = parse(raw);
  if (data.dialogueVersion !== 1 || !data.conversations || typeof data.conversations !== 'object' || Array.isArray(data.conversations) || !Array.isArray(data.artifacts)
    || !Object.values(data.conversations).every(messages => Array.isArray(messages) && messages.every(m => m && typeof m.id === 'string' && ['user', 'assistant'].includes(m.sender) && typeof m.text === 'string'))
    || !data.artifacts.every(a => a && typeof a.id === 'string' && typeof a.title === 'string' && roleById(a.owner) && Array.isArray(a.matterIds) && Array.isArray(a.versions) && a.versions.length && a.versions.every(v => Number.isInteger(v.number) && Array.isArray(v.sections) && v.sections.every(s => typeof s.title === 'string' && Array.isArray(s.lines) && s.lines.every(l => typeof l === 'string'))))) throw new Error('对话记录不完整，原记录已保留，请确认后重置演示。');
  return upgradeDialogue(data);
}

export function introduction(state, role, context) {
  const m = state.matters.find(m => m.id === context && m.participants.includes(role));
  if (!m) {
    const mine = state.matters.filter(m => canSeeWork(m, role));
    const decisions = mine.filter(m => pendingTasks(m, role).some(t => t.kind === 'decision')).length;
    const workKinds = [...new Set(mine.map(m => m.category))];
    return `${roleById(role).name}，早上好。已归集你参与的 ${mine.length} 件工作，涉及${workKinds.join('、')}。\n\n${decisions ? `目前有 ${decisions} 件事需要你判断。` : '当前没有等待你决策的事项。'}你可以交代新的工作，也可以接着处理已有事项。`;
  }
  const ready = pendingTasks(m, role);
  const incoming = m.messages.find(msg => msg.to === role && msg.waiting);
  return `正在跟进「${m.title}」。\n\n${m.summary}${ready.length ? `\n\n需要你：${ready.map(t => t.title).join('；')}。` : ''}${incoming ? `\n\n${roleById(incoming.from).name}正在等你的回复：${incoming.text}` : ''}`;
}

const taskRules = [
  ['supervise', /(?:督办|责成|下发)/],
  ['scope-check', /(?:采集口径|统计时点|总表.*分表)/],
  ['analysis-confirm', /(?:核查范围|专业分析)/],
  ['batch-confirm', /(?:首批|第一批|轮换安排)/],
  ['dispatch', /(?:派发|出场|现场安排)/],
  ['review-result', /(?:复核现场|现场结果已复核|回复督办)/],
  ['verify-effect', /(?:效果验证|验证结果|实测|后续统计周期)/],
  ['loss-field', /(?:现场核查|异常点|故障点)/],
  ['replace-field', /(?:表计|轮换)/],
  ['patrol-field', /巡视/],
  ['customer-review', /(?:资料|材料)/],
  ['customer-field', /(?:客户|现场信息)/],
];
const taskEffects = {
  supervise: '确认后下发至营销员。你的待办转为跟进，专业分析结果沿本事项回传。',
  'scope-check': '保存你提供的口径核对结果，解除专业确认的前序限制。',
  'analysis-confirm': '生成 MOCK 核查工单，向班长更新核查范围；不代表现场核查已完成。',
  'batch-confirm': '仅调整祥泰村 12 只表计的批次，生成 MOCK 工单；上级其他批次不变。',
  dispatch: '将核查、巡视和 12 只表计轮换安排给王晨，沿用工程车 01 与已列资源；三张工单独立回填。',
  'review-result': '向所长回传复核意见，进入效果验证；不会最终收口。',
  'verify-effect': '记录你提供的实际验证结果，提交所长验收；预测不能替代验证。',
};
const isNegated = text => /(?:不要|不必|不想|不准|不同意|不能|暂不|先不|不确认|未完成|没完成|未核对|没核对|不通过|不收口|未验证|未核实|没有核实|不一致|不正常|不能确认|尚未)/.test(text);

function reportSections(state, role, ids, concise = false) {
  const matters = state.matters.filter(m => ids.includes(m.id) && m.participants.includes(role));
  const open = matters.filter(m => !m.closed);
  return [
    { title: '工作概况', lines: [`本次归集 ${matters.length} 件关联事项，${matters.filter(m => m.closed).length} 件已确认收口，${open.length} 件仍在办理或等待确认。`, '统计范围为当前本地演示事项，不构成完整自然日或自然周的真实业绩。'] },
    { title: '重点进展', lines: matters.slice(0, concise ? 2 : matters.length).map(m => `${m.title}：${m.phase}。${concise ? '' : m.summary}`) },
    { title: '后续安排与待确认', lines: open.slice(0, concise ? 2 : open.length).map(m => { const tasks = m.tasks.filter(t => t.status === 'ready'); return `${m.title}：${tasks.length ? tasks.map(t => `${roleById(t.role).short}${t.title}`).join('；') : '等待前序结果'}。`; }).concat(concise ? [] : ['成本、工时与资源领退未提供完整记录，本稿不作估算。待验证事项不计入最终收口。']) },
  ];
}

// Dialogue and domain changes share one persisted snapshot, so a reply cannot succeed without its work record.
export function dialogueTransition(previous, action, now = new Date().toISOString()) {
  if (action.type === 'domain-tick') {
    const next = transition(previous, { type: 'tick' }, now);
    if (next === previous) return previous;
    for (const m of next.matters) {
      const before = previous.matters.find(x => x.id === m.id);
      for (const job of m.jobs) {
        const oldJob = before?.jobs.find(j => j.id === job.id);
        if (oldJob?.status === job.status) continue;
        const key = channelKey(job.role, m.id);
        const messages = next.conversations[key] ||= [];
        if (job.status === 'waiting') messages.push({ id: `plan-${m.id}`, sender: 'assistant', text: `资料准备演示已完成。拟为「${m.area}」办理「${m.title}」，等待你的确认。`, proposal: { status: 'pending', title: '确认自主工单办理方案', detail: '仅生成 MOCK 回执，不会提交到营销 2.0。', action: { type: 'act', role: job.role, matterId: m.id, taskId: `confirm-${m.id}`, result: '确认对话中提出的自主工单目标、范围和方案。' }, versions: { [m.id]: m.version } } });
        if (job.status === 'done') messages.push({ id: `receipt-${m.id}`, sender: 'assistant', text: `已取得模拟回执 ${m.orders[0]?.id || '成果已准备'}。\n后续还没有分派给任何人，也没有最终收口。`, links: [m.id] });
      }
    }
    return next;
  }
  const who = roleById(action.role);
  if (!who) throw new Error('请选择岗位');
  const context = action.context || 'workspace';
  const matter = previous.matters.find(m => m.id === context);
  if (context !== 'workspace' && (!matter || !canSeeWork(matter, action.role))) throw new Error('当前岗位不参与该事项，或事项尚未下发');
  let next = structuredClone(previous);
  const key = channelKey(action.role, context);
  const messages = next.conversations[key] ||= [];
  const append = (text, data = {}) => { messages.push({ id: `${action.id || now}-${messages.length}`, sender: 'assistant', text, ...data }); };
  const applyProposal = message => {
    const p = message?.proposal;
    if (!p || p.status !== 'pending') { append('当前没有等待确认的操作。请先说明要处理的事项。'); return; }
    if (Object.entries(p.versions).some(([id, version]) => next.matters.find(m => m.id === id)?.version !== version)) { p.status = 'expired'; append('这件事有了新进展，原方案已失效。请结合最新记录重新提出安排。'); return; }
    try {
      const updated = transition(next, p.action, now);
      p.status = 'confirmed';
      updated.conversations = next.conversations;
      next = updated;
      if (next.matters.find(m => m.id === p.action.matterId)?.closed) next.artifacts.filter(a => a.context === p.action.matterId).forEach(a => { a.reviewedAt = now; a.reviewedVersion = a.versions.at(-1).number; });
      append('已按你确认的意见更新演示记录。关联岗位会看到同一份事项进展。', { links: [p.action.matterId] });
    } catch (e) { append(`尚未办理：${e.message}。原事项保持不变。`); }
  };
  if (action.type === 'confirm' || action.type === 'cancel') {
    const msg = messages.find(m => m.id === action.messageId);
    if (action.type === 'cancel') { if (msg?.proposal?.status === 'pending') { msg.proposal.status = 'cancelled'; append('已撤回这份待确认意见，没有更新事项。'); } }
    else applyProposal(msg);
    return next;
  }
  if (action.type !== 'send') throw new Error('未知对话操作');
  const text = action.text?.trim();
  if (!text || text.length > 2000) throw new Error('请输入 1 至 2000 字的工作安排');
  messages.push({ id: `${action.id}-user`, sender: 'user', text });
  const lastPending = [...messages].reverse().find(m => m.proposal?.status === 'pending');
  if (/^(确认执行|确认|同意)[。！!\s]*$/.test(text) && (lastPending || /^确认执行/.test(text))) { applyProposal(lastPending); return next; }
  if (/^(取消|撤回|先不执行|不同意)[。！!\s]*$/.test(text)) {
    if (lastPending) lastPending.proposal.status = 'cancelled';
    append('没有执行，事项保持不变。你可以补充其他安排。'); return next;
  }
  const propose = (domainAction, title, detail) => {
    try { transition(next, domainAction, now); } catch (e) { append(`暂时不能继续：${e.message}。没有更改事项。`); return; }
    if (lastPending) lastPending.proposal.status = 'superseded';
    const related = domainAction.taskId === 'dispatch' ? next.package.matterIds : [domainAction.matterId];
    append('我已整理成下面的处理意见，等你确认后再更新共同记录。', { proposal: { status: 'pending', title, detail, action: domainAction, versions: Object.fromEntries(related.map(id => [id, next.matters.find(m => m.id === id).version])) } });
  };
  if (/^(确认|同意)[。！!\s]*$/.test(text) && matter) {
    const mine = pendingTasks(matter, action.role);
    if (mine.length === 1 && mine[0].kind === 'decision') {
      const task = mine[0];
      propose({ type: 'act', role: action.role, matterId: matter.id, taskId: task.id, result: `同意：${task.title}` }, task.title, taskEffects[task.id] || '仅记录当前这一步的确认意见，其他工作保持不变。');
    } else append(mine.some(t => t.kind === 'human') ? '这一步需要实际办理结果。请补充已经核实的情况，我再整理成反馈意见。' : '请说明同意哪一项安排，尚未执行任何操作。');
    return next;
  }
  if (isNegated(text)) { if (lastPending) lastPending.proposal.status = 'cancelled'; append('已保留你的意见，没有确认或提交任何操作。\n如果需要协同其他岗位，请补充收件人和要传达的完整内容。'); return next; }
  if (/[?？]|(?:是否|能否|可以吗|行不行|怎么|如何)/.test(text)) { append(matter ? `目前：${matter.summary}\n\n注意：${matter.caution}\n这条按咨询处理，没有执行。` : '这条按咨询处理，没有执行。当前为本地对话样例，不能查询真实业务系统；可以先打开具体事项查看已有记录。'); return next; }

  if (/(?:周报|日报|工作报告|工作汇报)/.test(text) && /(?:生成|写|整理|汇总|做一|出一)/.test(text)) {
    if (matter?.closed) { append('这件工作已收口。请发起新的报告工作，原成果与审阅记录保持不变。'); return next; }
    const ids = matter && matter.category !== '综合事务' ? [matter.id] : next.matters.filter(m => canSeeWork(m, action.role) && m.category !== '综合事务').map(m => m.id);
    const title = `${matter ? matter.area : '供电所'}工作${text.includes('周报') ? '周报' : '日报'}`;
    const workId = matter?.category === '综合事务' ? matter.id : `report-${action.id}`;
    if (workId !== matter?.id) next.matters.unshift(reportMatter(next, workId, action.role, title, now));
    const artifact = { id: `doc-${action.id}`, title, owner: action.role, context: workId, matterIds: ids, createdAt: now, versions: [{ number: 1, createdAt: now, sections: reportSections(next, action.role, ids) }] };
    next.artifacts.unshift(artifact);
    const reportWork = next.matters.find(m => m.id === workId);
    reportWork.phase = '待审阅'; reportWork.summary = '报告初稿已生成，等待审阅确认；来源工作的状态保持不变。';
    reportWork.tasks.filter(t => t.status === 'ready').forEach(t => { t.title = '审阅并确认工作报告'; });
    reportWork.version += 1;
    reportWork.events.push({ id: artifact.id, actor: 'dsh', text: '报告初稿已生成，待审阅。', at: now });
    append('初稿已整理好，已把办理进展和未收口事项分开。统计依据仅为当前演示记录，缺少的工时和成本没有补编。', { artifactId: artifact.id, artifactVersion: 1 });
    if (workId !== context) next.conversations[channelKey(action.role, workId)] = structuredClone(messages.slice(-2));
    return next;
  }
  if (/(?:精简|简短|三点|三条|展开|详细一点)/.test(text)) {
    const ref = [...messages].reverse().find(m => m.artifactId);
    const target = action.artifactId || ref?.artifactId;
    const artifact = next.artifacts.find(a => a.id === target && a.owner === action.role && a.context === context && messages.some(m => m.artifactId === target));
    if (!artifact) { append('当前对话还没有报告初稿。可以先说“帮我生成本周周报”。'); return next; }
    if (matter.closed) { append('报告已确认收口，历史版本只读。请发起新的报告工作。'); return next; }
    const number = artifact.versions.length + 1;
    artifact.versions.push({ number, createdAt: now, sections: reportSections(next, action.role, artifact.matterIds, !/展开|详细/.test(text)) });
    const reportWork = next.matters.find(m => m.id === context); reportWork.version += 1;
    reportWork.events.push({ id: `revision-${action.id}`, actor: 'dsh', text: `报告已修订为第 ${number} 版，待重新审阅。`, at: now });
    append(`已生成第 ${number} 版，保留工作概况、重点进展、后续安排三部分。原稿仍保留，待你审阅。`, { artifactId: artifact.id, artifactVersion: number }); return next;
  }
  if (/(?:创建|发起|开一).*工单/.test(text)) {
    const area = text.match(/(?:[\u4e00-\u9fff]{2,5}村)[\d一二三四五六七八九十]+号台区/)?.[0]?.replace(/^(?:请|帮我|我|给|为|在)+/, '') || matter?.area;
    if (!area) { append('请补充具体台区和工作目标，例如“为新桥村3号台区创建采集异常核实自主工单”。'); return next; }
    const id = `self-${action.id}`;
    next = transition(next, { type: 'create', role: action.role, id, title: `${area}${/采集/.test(text) ? '采集异常核实' : '自主核查'}`, area, mode: 'order', note: text }, now);
    next.conversations = { ...next.conversations, [key]: messages };
    append('已发起自主工作，DSH 正在准备建单资料。方案准备好后会等你确认，再生成 MOCK 回执。', { links: [id] });
    next.conversations[channelKey(action.role, id)] = structuredClone(messages.slice(-2)); return next;
  }
  if (/(?:今天|今日).*(?:安排|优先|工作)|先做什么/.test(text)) {
    const items = next.matters.filter(m => canSeeWork(m, action.role) && !m.closed);
    const prioritized = [...items].sort((a, b) => pendingTasks(b, action.role).length - pendingTasks(a, action.role).length);
    append(prioritized.length ? prioritized.slice(0, 3).map((m, i) => `${i + 1}. ${m.title}\n${pendingTasks(m, action.role).map(t => t.title).join('；') || m.summary}`).join('\n\n') : '当前关联事项均已收口。', { links: prioritized.slice(0, 3).map(m => m.id) }); return next;
  }
  if (!matter) { append('请先打开相关事项，我会沿着这件事的共同记录继续处理。\n当前也可以演示“整理今天的优先事项”“帮我生成本周周报”或说明台区后发起自主工单。'); return next; }
  if (/(?:分析|进展|情况|依据|风险)/.test(text) && !/(?:确认|同意|已完成|已核对|回复|通知|告诉|发给)/.test(text)) { append(`${matter.summary}\n\n分析：${matter.analysis}\n注意：${matter.caution}`, { links: [matter.id] }); return next; }
  if (/^(?:我已知晓|已知晓|知道了)[。！!\s]*$/.test(text)) { next = transition(next, { type: 'ack', role: action.role, matterId: matter.id }, now); next.conversations[key] = messages; append('已记录知晓。待决策、待落实和待回复的责任不会因此消失。'); return next; }
  if (/(?:回复|通知|告诉|(?:^|请|帮我)发给)/.test(text) && !/回复督办/.test(text)) {
    const recipient = roles.find(r => r.id !== action.role && [r.name, r.short, r.label].some(name => text.includes(name)));
    const body = text.split(/[:：]/).slice(1).join('：').trim();
    if (!recipient || !body) { append('请说明对象和内容，例如“回复班长：范围确认后可以合并进场，请反馈安排”。'); return next; }
    propose({ type: 'message', role: action.role, matterId: matter.id, id: `msg-${action.id}`, to: recipient.id, text: body, waiting: /请.*(?:回复|反馈)|需要.*回复/.test(body) }, `发给${recipient.name} · ${recipient.short}`, body); return next;
  }
  if (/(?:暂停|继续运行)/.test(text)) {
    const job = matter.jobs.find(j => j.role === action.role && j.status === (text.includes('暂停') ? 'running' : 'paused'));
    if (!job) { append('当前没有符合条件的运行任务。'); return next; }
    next = transition(next, { type: 'job-control', role: action.role, matterId: matter.id, jobId: job.id }, now); next.conversations[key] = messages;
    append(text.includes('暂停') ? '本地办理演示已暂停。' : '已恢复本地办理演示。'); return next;
  }
  const mine = pendingTasks(matter, action.role);
  let task;
  if (/(?:确认.*收口|验收通过|确认报告|报告.*确认)/.test(text)) task = mine.find(t => t.id.startsWith('accept-') || (t.id.startsWith('next-') && matter.mode === 'work'));
  else if (/方案/.test(text) && /确认|同意/.test(text)) task = mine.find(t => t.id.startsWith('confirm-'));
  else if (/(?:安排|交给|派给)/.test(text) && matter.mode === 'order') task = mine.find(t => t.id.startsWith('next-'));
  else {
    task = taskRules.map(([id, pattern]) => pattern.test(text) ? mine.find(t => t.id === id) : null).find(Boolean);
    if (!task && /已完成|已核实/.test(text)) task = mine.find(t => t.id.startsWith('follow-'));
  }
  if (task) {
    if (task.kind === 'human' && (!/已|完成|一致|正常|齐全|完整/.test(text) || text.length < 12)) { append('这一步需要你亲自落实。请补充已经核实的结果和依据，我会整理后请你确认；不能代替现场执行。'); return next; }
    if (task.id === 'verify-effect' && /预计|预测|可能/.test(text)) { append('这仍是预测，不能登记为实际效果验证。请补充已核实的数据时段与结论。'); return next; }
    if (task.kind === 'decision' && !/确认|同意|安排|派发|验收通过|交给|派给|复核/.test(text)) { append('已看到你的意见，但还没有明确的办理指令，事项保持不变。'); return next; }
    const assignee = roles.find(r => [r.name, r.short, r.label].some(s => text.includes(s)));
    if (task.id.startsWith('next-') && matter.mode === 'order' && !assignee) { append('请指明后续责任岗位，例如“安排台区经理王晨落实”。'); return next; }
    propose({ type: 'act', role: action.role, matterId: matter.id, taskId: task.id, result: text, assignee: assignee?.id }, task.title, taskEffects[task.id] || (task.id.startsWith('accept-') ? '核对结果与依据后，仅对当前事项进行最终收口。' : '把你提供的意见和结果记录到当前事项，回传关联岗位。')); return next;
  }
  append('这条安排超出了当前对话样例，未执行任何操作。\n' + (mine.length ? `当前轮到你处理：${mine.map(t => t.title).join('；')}。请说明这一步的确认意见或已核实结果。` : '当前没有轮到你办理的步骤，可以询问进展，或说明需要沟通的对象与内容。'));
  return next;
}

export function artifactStatus(artifact, number = artifact.versions.at(-1).number) {
  return artifact.reviewedAt ? (number === artifact.reviewedVersion ? '演示审阅已确认' : '历史版本') : '待审阅';
}
export function reportText(artifact, version = artifact.versions.at(-1)) {
  return [artifact.title, `第 ${version.number} 版 · DSH 对话生成样例 · ${artifactStatus(artifact, version.number)}`, '仅依据本地演示记录，非真实业务报告。', '', ...version.sections.flatMap(s => [s.title, ...s.lines, ''])].join('\n');
}
