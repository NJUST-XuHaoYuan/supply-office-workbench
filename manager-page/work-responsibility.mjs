import { pendingTasks, roleById } from './collaboration-model.mjs';

// Participation describes the whole process; release describes who can see work now.
export function canSeeWork(m, role) {
  return m.participants.includes(role) && (m.initiator === role
    || m.releasedRoles?.includes(role)
    || m.tasks.some(t => t.role === role && t.status !== 'blocked')
    || m.jobs.some(j => j.role === role)
    || (!m.releasedRoles && m.events.some(e => e.actor === role))
    || m.messages.some(msg => msg.to === role || msg.from === role));
}

export function responsibility(m, role) {
  const mine = m.closed ? [] : pendingTasks(m, role);
  const incoming = m.closed ? [] : m.messages.filter(msg => msg.to === role && msg.waiting);
  const active = m.tasks.filter(t => t.status === 'ready');
  const jobs = m.jobs.filter(j => ['running', 'waiting', 'paused'].includes(j.status));
  const bucket = m.closed ? 'archive' : mine.length || incoming.length ? 'pending' : 'following';
  const current = active.map(t => `${roleById(t.role).short} · ${t.title}`);
  if (!current.length) current.push(...jobs.map(j => `${roleById(j.role).short}的 DSH · ${j.status === 'paused' ? '已暂停' : j.title}`));
  const nextTask = m.tasks.find(t => t.status === 'blocked');
  return {
    bucket, mine, incoming,
    label: m.closed ? '已完成' : mine[0]?.title || (incoming.length ? `回复${roleById(incoming[0].from).short}` : current[0] || m.phase),
    current: m.closed ? `${roleById(m.acceptor).short}已确认收口` : current.join('；') || m.phase,
    feedback: m.closed ? '过程与成果已留存' : nextTask ? `后续：${roleById(nextTask.role).short} · ${nextTask.title}` : '下一次反馈：办理结果确认后',
  };
}
