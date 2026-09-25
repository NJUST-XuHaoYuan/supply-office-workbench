export const STORE = 'supply-collaboration-prototype-v1';
export const roles = [
  { id: 'director', label: '供电所所长', short: '所长', name: '陈明', color: 'green' },
  { id: 'marketing', label: '营销员', short: '营销员', name: '李宁', color: 'blue' },
  { id: 'leader', label: '运维采集班长', short: '班长', name: '周峰', color: 'violet' },
  { id: 'manager', label: '台区经理', short: '台区经理', name: '王晨', color: 'amber' },
];
export const roleById = id => roles.find(role => role.id === id);
export const lenses = [
  { id: 'know', label: '需要我知道', short: '知道', verb: '新进展' },
  { id: 'decide', label: '需要我决策', short: '决策', verb: '待决策' },
  { id: 'do', label: '需要我落实', short: '落实', verb: '待落实' },
  { id: 'talk', label: '需要我沟通', short: '沟通', verb: '待回复' },
];
const at = time => `2026-09-24T${time}:00+08:00`;
const task = (id, role, kind, title, status = 'ready', description = '') => ({ id, role, kind, title, status, description, result: '' });
const event = (id, actor, text, time) => ({ id, actor, text, at: at(time) });
const matter = (id, data) => ({ id, version: 1, closed: false, verified: false, tasks: [], jobs: [], messages: [], orders: [], metrics: [], trend: [], events: [], ...data });

export function seed() {
  return { version: 1, revision: 0, acks: {}, matters: [
    matter('loss', {
      number: 'SX-0924-001', title: '祥泰村2号台区线损异常核查', category: '线损治理', area: '祥泰村2号台区', origin: '所长督办', initiator: 'director', acceptor: 'director', participants: roles.map(r => r.id), due: '今日 11:30', phase: '待专业确认', priority: 'high',
      summary: 'DSH 已完成分析，建议重点核查 2 号低压支路末端、7 号表箱及相邻接户线。',
      analysis: '雨后两处监测数据波动增大，与线损上升时段接近；当前是疑似范围，尚未形成现场结论。',
      caution: '先核对采集口径，再确定核查范围。现场处置完成后仍需验证整改效果。',
      metrics: [['昨日线损率', '8.57', '%'], ['较前日', '+2.15', '百分点'], ['重点核查范围', '2', '处']], trend: [4.1, 4.3, 4.2, 4.6, 5.2, 6.42, 8.57],
      tasks: [task('supervise', 'director', 'decision', '发起线损异常督办', 'done'), task('scope-check', 'marketing', 'human', '核对关键时段采集口径', 'ready', '对照原始记录，确认总表、分表统计时点及数据完整性。'), task('analysis-confirm', 'marketing', 'decision', '确认专业分析与核查范围', 'ready', '同意后，DSH 将模拟生成线损核查工单，交由班长统筹。'), task('dispatch', 'leader', 'decision', '确认现场任务与资源安排', 'blocked', '等待专业确认及轮换批次确认。'), task('loss-field', 'manager', 'human', '完成重点位置核查并回填结果', 'blocked', '按任务要求保留现场核查结果；本原型不提供实际作业指令。'), task('review-result', 'marketing', 'decision', '复核现场结果并回复督办', 'blocked'), task('verify-effect', 'marketing', 'human', '登记整改效果验证结果', 'blocked'), task('accept-loss', 'director', 'decision', '确认督办最终收口', 'blocked')],
      jobs: [{ id: 'loss-analysis', role: 'marketing', title: '线损分析与核查准备', status: 'done', step: 5, kind: 'analysis' }],
      messages: [{ id: 'msg-loss', from: 'leader', to: 'marketing', text: '我在统筹今天的现场安排。请确认核查范围，是否可以与祥泰村的表计轮换一并进场？', at: at('08:42'), waiting: true, sample: true }],
      events: [event('e1', 'director', '发起督办，要求上午完成专业分析并明确现场核查安排。', '08:05'), event('e2', 'marketing', '委托 DSH 整理采集记录与线损变化。', '08:18'), event('e3', 'dsh', '分析样例已生成，识别 2 处重点核查范围，等待专业确认。', '08:36')],
    }),
    matter('replacement', {
      number: 'SX-0924-002', title: '首批 12 只表计轮换安排', category: '计划轮换', area: '祥泰村2号台区', origin: '上级轮换计划', initiator: 'marketing', acceptor: 'leader', participants: roles.map(r => r.id), due: '今日', phase: '待批次确认', priority: 'normal',
      summary: 'DSH 建议将祥泰村前移至首批，与线损核查共用一次现场安排。', analysis: '上级约 2000 只轮换计划已整理，本次只涉及祥泰村的 12 只表计。', caution: '本批完成不代表上级整个轮换计划完成，各工单保留独立结果。', metrics: [['本批表计', '12', '只'], ['所属计划', '约 2000', '只']],
      tasks: [task('batch-confirm', 'marketing', 'decision', '确认将祥泰村调整至首批', 'ready', '确认后，DSH 模拟生成计量设备更换工单，加入待统筹任务。'), task('replace-field', 'manager', 'human', '回填 12 只表计轮换结果', 'blocked'), task('accept-replacement', 'leader', 'decision', '确认本批轮换完成', 'blocked')],
      jobs: [{ id: 'replacement-plan', role: 'marketing', title: '轮换计划整理与批次建议', status: 'done', step: 5, kind: 'analysis' }],
      events: [event('r1', 'dsh', '轮换计划明细已整理，提出首批调整建议。', '08:30')],
    }),
    matter('patrol', {
      number: 'SX-0924-003', title: '祥泰村低压设备周期巡视', category: '周期巡视', area: '祥泰村2号台区', origin: '周期计划', initiator: 'leader', acceptor: 'leader', participants: ['director', 'leader', 'manager'], due: '本周', phase: '待统筹派发', priority: 'normal',
      summary: '本周期巡视尚未完成，可与同台区核查、轮换任务合并安排出场。', analysis: '作业地点与现有两项任务重合，可共用车辆和现场窗口。', caution: '只合并现场安排，巡视结果和闭环要求独立保留。',
      tasks: [task('patrol-field', 'manager', 'human', '完成本周期巡视并记录结果', 'blocked'), task('accept-patrol', 'leader', 'decision', '确认巡视结果', 'blocked')],
      orders: [{ id: 'MOCK-XS-0924-003', type: '低压设备巡视', status: '待派发' }], events: [event('p1', 'leader', '将本周期巡视列入同台区待统筹任务。', '08:40')],
    }),
    matter('customer', {
      number: 'SX-0924-004', title: '新桥村客户用电信息核实', category: '客户服务', area: '新桥村1号台区', origin: '营销员自主发起', initiator: 'marketing', acceptor: 'marketing', participants: ['director', 'marketing', 'manager'], due: '今日 14:00', phase: '待现场反馈', priority: 'normal',
      summary: '客户资料已整理，需要台区经理核对现场信息后补充办理记录。', analysis: 'DSH 已整理申请资料，现场信息需由人员确认。', caution: '仅展示虚构业务样例，不包含真实客户信息。',
      tasks: [task('customer-field', 'manager', 'human', '核实客户现场信息', 'ready', '核对申请信息与现场情况，填写核实结果。'), task('customer-review', 'marketing', 'human', '复核客户资料中的待补充项', 'ready', '确认当前申请资料是否完整，并记录尚需补充的内容。'), task('accept-customer', 'marketing', 'decision', '确认客户核实事项完成', 'blocked')],
      orders: [{ id: 'MOCK-YX-0924-004', type: '客户信息核实', status: '办理中' }], events: [event('c1', 'marketing', '自主发起客户信息核实。', '08:12'), event('c2', 'dsh', '模拟建单回执已保存，现场核实由王晨负责。', '08:16')],
    }),
    matter('report', {
      number: 'SX-0924-005', title: '昨日全所工作情况汇总', category: '综合事务', area: '全所', origin: '所长自主发起', initiator: 'director', acceptor: 'director', participants: ['director', 'marketing', 'leader'], due: '今日 09:30', phase: '待审阅', priority: 'normal',
      summary: '昨日办理结果、跨日事项和资源记录已归集，详细报告待所长审阅。', analysis: '报告区分已完成、待验证与跨日办理事项；资源数据为演示记录。', caution: '待验证事项未计入最终收口。', metrics: [['已形成办理结果', '18', '项'], ['继续跟踪', '3', '项']],
      tasks: [task('accept-report', 'director', 'decision', '审阅并确认工作报告', 'ready')], jobs: [{ id: 'daily-report', role: 'director', title: '归集昨日工作记录并整理报告', status: 'done', step: 5, kind: 'analysis' }], events: [event('d1', 'dsh', '已生成昨日工作报告样例，等待所长确认。', '08:00')],
    }),
  ], package: { id: 'PK-0924-01', title: '祥泰村2号台区现场作业包', matterIds: ['loss', 'replacement', 'patrol'], status: 'proposed', vehicle: '工程车 01（样例）', materials: '电能表 12 只', tools: '核查、计量与巡视工器具', assignee: 'manager' } };
}

export function memberships(state, item, role) {
  if (!item.participants.includes(role)) return [];
  const result = [];
  if ((state.acks[`${role}:${item.id}`] || 0) < item.version) result.push('know');
  if (item.tasks.some(t => t.role === role && t.kind === 'decision' && t.status === 'ready')) result.push('decide');
  if (item.tasks.some(t => t.role === role && t.kind === 'human' && t.status === 'ready')) result.push('do');
  if (item.messages.some(m => m.to === role && m.waiting)) result.push('talk');
  return result;
}
export const viewCounts = (state, role) => Object.fromEntries(lenses.map(l => [l.id, state.matters.filter(m => memberships(state, m, role).includes(l.id)).length]));
export const pendingTasks = (m, role) => m.tasks.filter(t => t.role === role && t.status === 'ready');
export const jobsFor = (state, role) => state.matters.flatMap(m => m.jobs.filter(j => j.role === role).map(j => ({ ...j, matterId: m.id, matterTitle: m.title })));
const required = (value, label) => { if (typeof value !== 'string' || !value.trim()) throw new Error(`请填写${label}`); if (value.length > 2000) throw new Error(`${label}请控制在 2000 字以内`); return value.trim(); };

export function transition(previous, action, now = new Date().toISOString()) {
  const next = structuredClone(previous);
  const who = roleById(action.role);
  if (!who && !['tick'].includes(action.type)) throw new Error('请选择演示岗位');
  const item = next.matters.find(m => m.id === action.matterId);
  const addEvent = (m, text, actor = action.role) => { m.version += 1; m.events.push({ id: `ev-${next.revision}-${m.events.length}`, actor, text, at: now }); };
  const setTask = (m, id, status) => { const t = m.tasks.find(t => t.id === id); if (t) t.status = status; };
  const get = id => next.matters.find(m => m.id === id);
  const finishOrder = m => { m.orders = m.orders.map(o => ({ ...o, status: '结果已回填' })); };
  const checkScope = () => { if (!item || !item.participants.includes(action.role)) throw new Error('当前岗位不参与该事项'); };
  const readyDispatch = () => { const loss = get('loss'); if (loss.tasks.find(t => t.id === 'analysis-confirm').status === 'done' && get('replacement').tasks.find(t => t.id === 'batch-confirm').status === 'done' && next.package.status === 'proposed') { setTask(loss, 'dispatch', 'ready'); loss.tasks.find(t => t.id === 'dispatch').description = '核对三项任务、先后顺序和资源安排后，派发给台区经理。'; loss.phase = '待班长统筹'; } };

  if (action.type === 'ack') { checkScope(); next.acks[`${action.role}:${item.id}`] = item.version; }
  else if (action.type === 'create') {
    const title = required(action.title, '工作目标'); const area = required(action.area, '业务对象或台区');
    if (next.matters.some(m => m.id === action.id)) return previous;
    if (!['order', 'work'].includes(action.mode)) throw new Error('请选择工作类型');
    const m = matter(action.id, { number: `SX-0924-${String(next.matters.length + 1).padStart(3, '0')}`, title, area, category: action.mode === 'order' ? '自主工单' : '自主工作', origin: `${who.short}自主发起`, initiator: action.role, acceptor: action.role, participants: [action.role], due: action.due || '今日', phase: 'DSH 准备中', priority: 'normal', summary: '已交给 DSH 整理需求与办理资料，等待模拟方案生成。', analysis: action.note?.trim() || '按工作目标准备资料，并保留办理过程。', caution: '本次仅播放办理过程，不会连接或提交至营销 2.0。', mode: action.mode, tasks: [task(`confirm-${action.id}`, action.role, 'decision', '确认 DSH 办理方案', 'blocked')], jobs: [{ id: `job-${action.id}`, role: action.role, title: action.mode === 'order' ? '营销 2.0 自主建单' : '资料整理与成果生成', status: 'running', step: 0, kind: action.mode }], events: [{ id: `created-${action.id}`, actor: action.role, text: '自主发起工作，已启动本地办理演示。', at: now }] });
    next.matters.unshift(m);
  }
  else if (action.type === 'tick') {
    let changed = false;
    for (const m of next.matters) for (const job of m.jobs) {
      if (job.status !== 'running') continue;
      changed = true; job.step += 1;
      if (job.step === 2) { job.status = 'waiting'; m.phase = '待方案确认'; m.summary = 'DSH 已准备好办理方案，请确认目标、业务对象和办理内容。'; setTask(m, `confirm-${m.id}`, 'ready'); addEvent(m, '模拟资料准备完成，等待发起人确认办理方案。', 'dsh'); }
      else if (job.step >= 5) { job.status = 'done'; m.phase = job.kind === 'order' ? '模拟工单已创建' : '待成果确认'; m.summary = job.kind === 'order' ? '模拟工单回执已取得，可继续安排责任岗位。' : '成果草稿已整理完成，等待发起人确认。';
        if (job.kind === 'order' && !m.orders.length) m.orders.push({ id: `MOCK-YX-${m.number.replace('SX-', '')}`, type: '自主业务工单', status: '待安排' });
        if (!m.tasks.some(t => t.id === `next-${m.id}`)) m.tasks.push(task(`next-${m.id}`, job.role, 'decision', job.kind === 'order' ? '安排后续责任岗位' : '确认工作成果', 'ready'));
        addEvent(m, job.kind === 'order' ? '模拟建单完成，已回读 MOCK 工单号。未向业务系统提交。' : '工作成果样例已生成，等待确认。', 'dsh');
      }
    }
    if (!changed) return previous;
  }
  else if (action.type === 'job-control') {
    checkScope(); const job = item.jobs.find(j => j.id === action.jobId && j.role === action.role);
    if (!job || !['running', 'paused'].includes(job.status)) throw new Error('当前步骤无法暂停或继续');
    job.status = job.status === 'running' ? 'paused' : 'running'; addEvent(item, job.status === 'paused' ? '暂停本地办理演示。' : '继续本地办理演示。');
  }
  else if (action.type === 'act') {
    checkScope(); const t = item.tasks.find(t => t.id === action.taskId);
    if (!t || t.role !== action.role) throw new Error('该操作由对应责任岗位处理');
    if (t.status === 'done') return previous;
    if (t.status !== 'ready') throw new Error('前序条件尚未完成');
    if (t.dependsOn?.some(id => item.tasks.find(prior => prior.id === id)?.status !== 'done')) throw new Error('前序条件尚未完成');
    const result = required(action.result, '办理意见或结果');
    if (t.id === 'analysis-confirm' && item.tasks.find(t => t.id === 'scope-check').status !== 'done') throw new Error('请先核对关键时段采集口径');
    if (t.id === 'accept-loss' && !item.verified) throw new Error('效果尚未验证，不能最终收口');
    if (next.workspaceVersion === 2 && item.category === '综合事务' && t.id.startsWith('accept-') && !next.artifacts?.some(a => a.context === item.id)) throw new Error('报告正文尚未生成，请先交给 DSH 整理');
    t.status = 'done'; t.result = result; t.completedAt = now;
    addEvent(item, `${t.title}：${result}`);
    if (t.id === 'supervise') {
      setTask(item, 'scope-check', 'ready'); item.phase = '待营销员核对';
      item.summary = '所长已下发督办，营销员先核对采集口径，再确认专业分析。';
      if (!item.jobs.length) item.jobs.push({ id: 'loss-analysis', role: 'marketing', title: '线损分析与核查准备', status: 'done', step: 5, kind: 'analysis' });
      addEvent(item, 'DSH 分析样例已准备，专业结论仍需营销员确认。', 'dsh');
    }
    else if (t.id === 'scope-check' && item.tasks.find(t => t.id === 'analysis-confirm')?.dependsOn) {
      setTask(item, 'analysis-confirm', 'ready'); item.phase = '待专业确认'; item.summary = '采集口径核对结果已留存，等待营销员确认专业分析与核查范围。';
    }
    else if (t.id === 'analysis-confirm') { item.releasedRoles = [...new Set([...(item.releasedRoles || []), 'leader'])]; item.orders.push({ id: 'MOCK-YX-0924-001', type: '线损核查', status: '待派发' }); item.phase = '待现场安排'; item.summary = '专业分析已确认，核查范围与模拟工单已交班长统筹。'; readyDispatch(); }
    else if (t.id === 'batch-confirm') { item.releasedRoles = [...new Set([...(item.releasedRoles || []), 'leader'])]; item.orders.push({ id: 'MOCK-JL-0924-002', type: '计量设备更换', status: '待派发' }); item.phase = '待现场安排'; item.summary = '首批 12 只轮换已确认，模拟工单已列入同台区作业包。'; addEvent(get('loss'), '首批轮换安排已确认，现场作业包的关联条件已更新。'); readyDispatch(); }
    else if (t.id === 'dispatch') { next.package.status = 'dispatched'; next.package.vehicle = action.vehicle || next.package.vehicle;
      for (const [id, taskId] of [['loss', 'loss-field'], ['replacement', 'replace-field'], ['patrol', 'patrol-field']]) { const m = get(id); setTask(m, taskId, 'ready'); m.phase = '现场办理中'; m.summary = '已纳入祥泰村现场作业包，由王晨执行，等待现场结果。'; m.orders.forEach(o => { o.status = '办理中'; }); addEvent(m, '周峰确认任务、顺序和资源，派发至台区经理王晨。'); }
    }
    else if (t.id === 'loss-field') { setTask(item, 'review-result', 'ready'); item.phase = '待专业复核'; item.summary = '现场核查结果已回传，等待营销员复核整改结论。'; finishOrder(item); }
    else if (t.id === 'review-result') { setTask(item, 'verify-effect', 'ready'); item.phase = '待效果验证'; item.summary = '现场结果已复核并回复督办，整改效果仍待后续数据验证。'; }
    else if (t.id === 'verify-effect') { item.verified = true; setTask(item, 'accept-loss', 'ready'); item.phase = '待所长验收'; item.summary = '营销员已登记效果验证结果，等待所长最终确认。'; }
    else if (t.id === 'replace-field') { setTask(item, 'accept-replacement', 'ready'); item.phase = '待班长验收'; item.summary = '本批 12 只表计轮换结果已回填，上级其他批次继续按计划办理。'; finishOrder(item); }
    else if (t.id === 'patrol-field') { setTask(item, 'accept-patrol', 'ready'); item.phase = '待班长验收'; item.summary = '周期巡视结果已回填，等待班长确认。'; finishOrder(item); }
    else if (['customer-field', 'customer-review'].includes(t.id)) { if (item.tasks.filter(t => ['customer-field', 'customer-review'].includes(t.id)).every(t => t.status === 'done')) { setTask(item, 'accept-customer', 'ready'); item.phase = '待营销员验收'; } item.summary = '客户核实记录已更新，资料复核和现场反馈分别保留。'; }
    else if (t.id.startsWith('accept-')) { item.closed = true; item.phase = '已收口'; item.summary = `${who.name}已确认办理结果，过程与成果留存。`; item.orders.forEach(o => { o.status = '已确认结果'; }); }
    else if (t.id.startsWith('confirm-')) { const job = item.jobs.find(j => j.kind === item.mode); if (!job || job.status !== 'waiting') throw new Error('办理方案尚未准备完成'); job.status = 'running'; job.step = 3; item.phase = 'DSH 办理中'; item.summary = '办理方案已确认，DSH 正在继续播放办理过程。'; }
    else if (t.id.startsWith('next-')) {
      if (item.mode === 'work') { item.closed = true; item.phase = '已收口'; item.summary = '发起人已确认工作成果，记录留存。'; }
      else { const assigned = roleById(action.assignee); if (!assigned) throw new Error('请选择后续责任岗位'); item.participants = [...new Set([...item.participants, assigned.id])]; item.tasks.push(task(`follow-${item.id}`, assigned.id, 'human', '落实工单后续工作并反馈', 'ready', result)); item.phase = '待后续落实'; item.summary = `后续工作已安排给${assigned.name}，等待办理反馈。`; item.orders.forEach(o => { o.status = '办理中'; }); }
    }
    else if (t.id.startsWith('follow-')) { item.tasks.push(task(`accept-${item.id}`, item.acceptor, 'decision', '确认自主工单办理结果', 'ready')); item.phase = '待发起人验收'; item.summary = '后续办理结果已回传，等待发起人确认。'; finishOrder(item); }
  }
  else if (action.type === 'message') {
    checkScope(); if (item.closed) throw new Error('事项已收口，沟通记录只读');
    const to = roleById(action.to); if (!to || to.id === action.role) throw new Error('请选择其他协同岗位');
    const text = required(action.text, '沟通内容');
    item.participants = [...new Set([...item.participants, to.id])];
    item.messages.forEach(m => { if (m.to === action.role && m.from === to.id) m.waiting = false; });
    item.messages.push({ id: action.id, from: action.role, to: to.id, text, waiting: Boolean(action.waiting), at: now, sample: false });
    addEvent(item, `${who.name}向${to.name}补充了事项沟通。`);
  }
  else throw new Error('未知演示操作');
  next.revision += 1;
  return next;
}

export function parse(raw) {
  if (!raw) return seed();
  const data = JSON.parse(raw);
  const text = v => typeof v === 'string'; const time = v => text(v) && Number.isFinite(Date.parse(v));
  const valid = data?.version === 1 && Number.isInteger(data.revision) && data.acks && typeof data.acks === 'object' && !Array.isArray(data.acks)
    && Array.isArray(data.matters) && ['loss', 'replacement', 'patrol', 'customer', 'report'].every(id => data.matters.some(m => m?.id === id))
    && data.matters.every(m => m && ['id', 'title', 'number', 'category', 'area', 'origin', 'phase', 'summary', 'analysis', 'caution', 'due'].every(k => text(m[k])) && roleById(m.initiator) && roleById(m.acceptor) && Number.isInteger(m.version)
      && Array.isArray(m.participants) && m.participants.every(roleById) && Array.isArray(m.tasks) && m.tasks.every(t => t && text(t.id) && text(t.title) && text(t.result) && roleById(t.role) && ['human', 'decision'].includes(t.kind) && ['ready', 'blocked', 'done'].includes(t.status))
      && Array.isArray(m.jobs) && m.jobs.every(j => j && text(j.id) && text(j.title) && roleById(j.role) && ['analysis', 'order', 'work'].includes(j.kind) && ['running', 'waiting', 'paused', 'done'].includes(j.status) && Number.isInteger(j.step))
      && Array.isArray(m.events) && m.events.every(e => e && text(e.text) && time(e.at)) && Array.isArray(m.messages) && m.messages.every(msg => msg && roleById(msg.from) && roleById(msg.to) && text(msg.text) && time(msg.at))
      && Array.isArray(m.orders) && m.orders.every(o => o && text(o.id) && text(o.type) && text(o.status)) && Array.isArray(m.metrics) && m.metrics.every(row => Array.isArray(row) && row.length === 3 && row.every(text)) && Array.isArray(m.trend) && m.trend.every(Number.isFinite))
    && data.package && ['proposed', 'dispatched'].includes(data.package.status) && Array.isArray(data.package.matterIds) && data.package.matterIds.every(id => data.matters.some(m => m.id === id));
  if (!valid) throw new Error('保存的演示记录不完整，请确认后重置样例');
  return data;
}
