import { pendingTasks } from './collaboration-model.mjs';
import { canSeeWork, responsibility } from './work-responsibility.mjs';

// Business-specific examples live in data. The workspace renders reusable content blocks, not a fixed process.
const profiles = {
  '线损治理': {
    label: '分析核查', icon: 'analysis',
    goal: '查明异常原因，形成有依据的结论，并验证处置效果。',
    deliverable: '核查结论、现场记录、效果验证依据',
    blocks: [
      { type: 'metrics', title: '监测依据', chartLabel: '近 7 日线损率', unit: '%' },
      { type: 'table', title: '待核实的证据', columns: ['观察对象', '已有线索', '结论状态'], rows: [
        ['2 号低压支路末端', '雨后电量差增大', '疑似，待现场核实'],
        ['7 号表箱及接户线', '波动时段与高损接近', '疑似，待现场核实'],
      ], untilTask: 'loss-field' },
    ],
  },
  '计划轮换': {
    label: '批量计划', icon: 'batch',
    goal: '按批准批次完成表计轮换，本批结果独立回流至上级计划。',
    deliverable: '批次安排、逐项轮换结果、物料领退记录',
    blocks: [
      { type: 'table', title: '本批实施明细', columns: ['范围', '数量', '原批次', '拟调整'], rows: [['祥泰村 2 号台区', '12 只', '第二批', '第一批']], decisionTask: 'batch-confirm' },
      { type: 'checklist', title: '批次执行', items: [
        { label: '确认本地实施批次', taskId: 'batch-confirm' },
        { label: '逐只完成更换并留存原表示数', taskId: 'replace-field' },
        { label: '确认本批结果并反馈原计划', taskId: 'accept-replacement' },
      ] },
    ],
  },
  '客户服务': {
    label: '服务跟进', icon: 'service',
    goal: '补齐客户资料与现场信息，形成可继续办理的完整记录。',
    deliverable: '资料核对意见、现场反馈、客户服务记录',
    blocks: [
      { type: 'checklist', title: '资料与反馈', items: [
        { label: '申请资料复核', taskId: 'customer-review', note: '营销岗位核对，和现场核实可并行' },
        { label: '客户现场信息', taskId: 'customer-field', note: '由台区经理核实，结果回传营销员' },
        { label: '完整性确认', taskId: 'accept-customer', note: '前两项完成后再由营销员确认' },
      ] },
    ],
  },
  '周期巡视': {
    label: '周期作业', icon: 'checklist',
    goal: '完成本周期巡视，留存现场记录及发现问题的后续安排。',
    deliverable: '巡视记录、问题清单、办理反馈',
    blocks: [{ type: 'checklist', title: '本周期记录', items: [
      { label: '现场巡视与检查记录', taskId: 'patrol-field' },
      { label: '本周期结果确认', taskId: 'accept-patrol' },
    ] }],
  },
  '综合事务': {
    label: '文稿成果', icon: 'document',
    goal: '依据已归集记录形成工作汇总，保留未收口事项及后续责任。',
    deliverable: '可审阅的报告正文、统计依据、修订版本',
    blocks: [{ type: 'document', title: '报告正文', outline: ['办理结果', '未收口事项与后续责任', '资源与成本依据'], prompt: '依据当前事项生成工作报告' }],
  },
};

export function presentationFor(state, matter, role) {
  const profile = matter.presentation || profiles[matter.category] || {};
  const supported = ['metrics', 'table', 'checklist', 'document'];
  const blocks = (profile.blocks || []).filter(b => supported.includes(b.type)).map(b => {
    const block = structuredClone(b);
    if (block.type === 'metrics') { block.values = matter.metrics; block.trend = matter.trend; }
    if (block.type === 'checklist') block.items = block.items.map(i => {
      const task = matter.tasks.find(t => t.id === i.taskId);
      return { ...i, status: task?.status || 'blocked', role: task?.role, result: task?.result };
    });
    if (block.untilTask) block.result = matter.tasks.find(t => t.id === block.untilTask)?.result;
    if (block.decisionTask) block.confirmed = matter.tasks.find(t => t.id === block.decisionTask)?.status === 'done';
    return block;
  });
  return {
    label: profile.label || matter.category || '日常工作', icon: profile.icon || 'work',
    goal: matter.goal || profile.goal || matter.analysis || matter.title,
    deliverable: matter.deliverable || profile.deliverable || '办理记录与经责任人确认的结果',
    owner: matter.initiator, acceptor: matter.acceptor, due: matter.due,
    mine: pendingTasks(matter, role), ready: matter.tasks.filter(t => t.status === 'ready'),
    blocks, outputs: state.artifacts.filter(a => a.owner === role && a.context === matter.id),
    related: state.package.matterIds.includes(matter.id) ? state.package.matterIds.filter(id => id !== matter.id).map(id => state.matters.find(m => m.id === id)).filter(m => m && canSeeWork(m, role)) : [],
  };
}

export function selectWorkspace(state, role, { lens = 'pending', query = '', selectedId = null } = {}) {
  const relevant = state.matters.filter(m => canSeeWork(m, role));
  const counts = Object.fromEntries(['pending', 'following', 'archive'].map(id => [id, relevant.filter(m => responsibility(m, role).bucket === id).length]));
  const matches = relevant.filter(m => responsibility(m, role).bucket === lens
    && `${m.title} ${m.area} ${m.number} ${m.category}`.includes(query.trim()));
  const selected = relevant.find(m => m.id === selectedId);
  const pinned = selected && !matches.includes(selected) ? selected : null;
  return { relevant, matches, selected, pinned, counts, items: pinned ? [pinned, ...matches] : matches };
}

export function defaultWorkspaceView() { return { lens: 'pending', query: '', selectedId: null, detailTabs: {}, composing: false }; }
