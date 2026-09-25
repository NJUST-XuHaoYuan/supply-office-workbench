import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { Archive, ArrowLeft, ArrowRight, ArrowUp, ArrowUpRight, Bot, Check, ChevronDown, ChevronRight, Circle, Clock3, Download, Ellipsis, FileText, Inbox, LoaderCircle, MessageSquare, Plus, RotateCcw, Search, Sparkles, UtilityPole, X } from 'lucide-react';
import { STORE, roleById, roles } from './collaboration-model.mjs';
import { artifactStatus, channelKey, DIALOGUE_STORE, dialogueTransition, initialDialogue, parseDialogue, reportText } from './dialogue-model.mjs';
import { defaultWorkspaceView, presentationFor, selectWorkspace } from './workspace-model.mjs';
import { responsibility } from './work-responsibility.mjs';
import './dialogue.css';
import './workspace.css';

const uid = () => crypto.randomUUID();
const time = date => new Intl.DateTimeFormat('zh-CN', { hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(date));
function IconButton({ label, children, ...props }) { return <button type="button" className="icon-button" title={label} aria-label={label} {...props}>{children}</button>; }
function Empty({ children }) { return <div className="empty"><Inbox size={32} strokeWidth={1.3} /><p>{children}</p></div>; }
function Trend({ values, label = '近期变化', unit = '' }) { if (!values.length) return null; const min = Math.min(...values); const max = Math.max(...values); return <figure className="sparkline"><svg viewBox="0 0 176 44" role="img" aria-label={`${label}样例：${values.join('、')}${unit}`}><path d="M3 39 H173" stroke="#e0e6e3" /><polyline points={values.map((v, i) => `${3 + i * 170 / Math.max(1, values.length - 1)},${36 - (v - min) / (max - min || 1) * 30}`).join(' ')} fill="none" stroke="currentColor" strokeWidth="2" /></svg><figcaption>{label} · 样例{unit && ` / ${unit}`}</figcaption></figure>; }

const taskNames = { ready: '待处理', blocked: '待前序', done: '已反馈' };
function WorkBlock({ block: b, outputs, openArtifact, prepare }) {
  return <section className={`work-block block-${b.type}`} data-block={b.type}><h3>{b.title}{b.decisionTask && <span>{b.confirmed ? '调整已确认' : 'DSH 建议 · 待确认'}</span>}</h3>
    {b.type === 'metrics' && <div className="inline-data"><div>{b.values.map(([label, value, unit]) => <span key={label}><small>{label}</small><strong>{value}<i>{unit}</i></strong></span>)}</div><Trend values={b.trend} label={b.chartLabel} unit={b.unit} /></div>}
    {b.type === 'table' && <>{b.result ? <p className="recorded-result"><Check size={14} />{b.result}</p> : <div className="business-table"><table><thead><tr>{b.columns.map(c => <th key={c}>{c}</th>)}</tr></thead><tbody>{b.rows.map((row, i) => <tr key={i}>{row.map((cell, j) => <td key={j}>{cell}</td>)}</tr>)}</tbody></table></div>}</>}
    {b.type === 'checklist' && <div className="content-checklist">{b.items.map((item, i) => <div key={i}><span className={`task-state ${item.status}`}>{item.status === 'done' ? <Check size={14} /> : <Circle size={14} />}</span><div><strong>{item.label}</strong>{(item.result || item.note) && <p>{item.result || item.note}</p>}</div><span>{item.role && `${roleById(item.role).short} · `}{taskNames[item.status]}</span></div>)}</div>}
    {b.type === 'document' && (outputs.length ? <div className="document-results">{outputs.map(a => <ArtifactLink key={a.id} artifact={a} open={openArtifact} />)}</div> : <div className="document-outline"><FileText size={27} strokeWidth={1.3} /><div><strong>本地尚无可预览正文</strong><ol>{b.outline.map(line => <li key={line}>{line}</li>)}</ol><button className="text-command" onClick={() => prepare(b.prompt)}>交给 DSH 整理<ArrowRight size={14} /></button></div></div>)}
  </section>;
}
function Detail({ state, matter: m, role, open, openArtifact, prepare }) {
  const p = presentationFor(state, m, role);
  return <div className="work-detail" id={'detail-' + m.id}>
    <dl className="work-facts"><div><dt>工作编号</dt><dd>{m.number}</dd></div><div><dt>来源</dt><dd>{m.origin}</dd></div><div><dt>发起人</dt><dd>{roleById(p.owner).name}</dd></div><div><dt>验收人</dt><dd>{roleById(p.acceptor).name}</dd></div><div><dt>完成要求</dt><dd>{p.goal}</dd></div></dl>
    {p.blocks.map((b, i) => <WorkBlock key={i} block={b} outputs={p.outputs} openArtifact={openArtifact} prepare={prepare} />)}
    <section className="work-block"><h3>分析与提醒</h3><p>{m.analysis}</p><p className="detail-caution">{m.caution}</p></section>
    {p.related.length > 0 && <section className="work-block"><h3>一起安排的工作</h3><div className="linked-matters">{p.related.map(item => <button key={item.id} onClick={() => open(item.id)}><span>{item.title}</span><ChevronRight size={18} /></button>)}</div><p className="resource-line">{state.package.vehicle} · {state.package.materials}</p></section>}
    <details className="record-fold"><summary>分工与进度<ChevronDown size={18} /></summary><div>
      {m.jobs.map(j => <div className="task-line" key={j.id}><Bot size={18} /><div><strong>{j.title}</strong><p>{roleById(j.role).name}的助手 · {{ done: '准备结果已留存', running: '本地演示运行中', paused: '已暂停', waiting: '等待人工确认' }[j.status]}</p></div></div>)}
      {m.tasks.map(t => <div className="task-line" key={t.id}><span className={'task-state ' + t.status}>{t.status === 'done' ? <Check size={16} /> : <Circle size={16} />}</span><div><strong>{t.title}</strong><p>{t.result || t.description || taskNames[t.status]}</p></div><span className="task-person">{roleById(t.role).short}<small>{taskNames[t.status]}</small></span></div>)}
      <ol className="timeline">{[...m.events].reverse().map(e => <li key={e.id}><span className="timeline-dot"><Check size={14} /></span><div><div className="event-meta"><strong>{e.actor === 'dsh' ? '工作助手' : roleById(e.actor)?.name}</strong><time>{time(e.at)}</time></div><p>{e.text}</p></div></li>)}</ol>
    </div></details>
    <details className="record-fold"><summary>材料与成果<ChevronDown size={18} /></summary><div>
      {p.outputs.map(a => <ArtifactLink key={a.id} artifact={a} open={openArtifact} />)}
      {m.orders.map(o => <div className="order-line" key={o.id}><FileText size={18} /><span>{o.type}<code>{o.id}</code></span><small>{o.status}</small></div>)}
      {m.tasks.filter(t => t.status === 'done' && t.result).map(t => <div className="result-record" key={t.id}><strong>{t.title}</strong><p>{t.result}</p><small>{roleById(t.role).name}反馈</small></div>)}
      {!p.outputs.length && !m.orders.length && !m.tasks.some(t => t.status === 'done' && t.result) && <Empty>暂无已留存成果</Empty>}
    </div></details>
    <details className="record-fold"><summary>沟通记录{m.messages.length > 0 ? '（' + m.messages.length + '）' : ''}<ChevronDown size={18} /></summary><div>
      {m.messages.length ? m.messages.map(msg => <div className="shared-message" key={msg.id}><div><div className="event-meta"><strong>{roleById(msg.from).name}</strong><ArrowRight size={16} /><span>{roleById(msg.to).name}</span><time>{time(msg.at)}</time></div><p>{msg.text}</p>{msg.waiting && <small className="awaiting">待{roleById(msg.to).short}回复</small>}</div></div>) : <Empty>暂无岗位间的沟通记录</Empty>}
    </div></details>
  </div>;
}
function MatterRow({ matter: m, role, selected, pinned, open }) {
  const r = responsibility(m, role);
  return <article className={'work-item' + (selected ? ' is-selected' : '')} aria-label={m.title} data-matter-id={m.id}>
    <button className="work-entry" aria-current={selected ? 'true' : undefined} onClick={() => open(m.id)}>
      <span className="entry-title"><strong>{m.title}</strong>{selected && <ChevronRight size={19} />}</span>
      <span className="entry-action">{r.label}</span>
      <span className="entry-meta"><span>{m.due}</span>{pinned && <span className="pinned-context">{r.bucket === 'following' ? '已转入跟进' : r.bucket === 'archive' ? '已完成' : '当前打开'}</span>}</span>
    </button>
  </article>;
}
function ArtifactLink({ artifact, open, version }) {
  if (!artifact) return null;
  return <button className="artifact-link" onClick={() => open(artifact.id, version)}><span className="document-icon"><FileText size={22} strokeWidth={1.5} /></span><span><strong>{artifact.title}</strong><small>DSH 生成 · 第 {version || artifact.versions.length} 版 · {artifactStatus(artifact, version)}</small></span><ArrowUpRight size={17} /></button>;
}

function Conversation({ state, role, context, composing, composeFrom, startWork, commit, open, openArtifact, prepare, drafts, setDrafts, back, error, targetArtifact, clearTarget }) {
  const key = channelKey(role, context); const messages = state.conversations[key] || [];
  const matter = state.matters.find(m => m.id === context);
  const scroll = useRef(null); const input = useRef(null); const [busy, setBusy] = useState(false);
  const draft = drafts[key] || ''; const r = matter ? responsibility(matter, role) : null;
  const ownJobs = matter?.jobs.filter(j => j.role === role && ['running', 'waiting', 'paused'].includes(j.status)) || [];
  useEffect(() => { scroll.current?.scrollTo({ top: 0, behavior: 'instant' }); }, [key]);
  useEffect(() => { if (messages.length) scroll.current?.scrollTo({ top: scroll.current.scrollHeight, behavior: 'instant' }); }, [messages.length, messages.at(-1)?.proposal?.status]);
  function send(e) {
    e.preventDefault(); if (!draft.trim() || busy) return; setBusy(true);
    const result = commit({ type: 'send', id: uid(), role, context, text: draft, artifactId: targetArtifact?.id });
    if (result) setDrafts(prev => ({ ...prev, [key]: '' }));
    setBusy(false); input.current?.focus();
  }
  return <aside className="dsh-panel" aria-label="工作助手">
    <header className="conversation-scope" data-context-id={matter?.id || 'workspace'}>
      <button className="mobile-back" onClick={back}><ArrowLeft size={20} />返回工作列表</button>
      <div className="scope-line"><span>{matter ? (r.bucket === 'pending' ? '待你处理' : r.bucket === 'archive' ? '已完成' : '跟进中') : composing ? '发起工作' : '工作助手'}</span>{matter && <time>{matter.due}</time>}</div>
      <h2>{matter?.title || (composing ? '新工作' : '工作助手')}</h2>
    </header>
    <div className="chat-scroll" ref={scroll}>
      {matter && <details className="work-details" key={key}><summary>查看详情<ChevronDown size={18} /></summary><Detail state={state} matter={matter} role={role} open={open} openArtifact={openArtifact} prepare={text => prepare(text, matter.id)} /></details>}
      {(matter || composing) ? <div className="assistant-message initial-message">
        <div className="speaker"><Bot size={20} /><strong>工作助手</strong></div>
        <p>{matter?.summary || '这次需要我协助办理什么工作？'}</p>
        {matter && <div className="current-request">
          {r.mine.map(t => <p key={t.id}><strong>{t.kind === 'decision' ? '请你确认：' : '请你反馈：'}</strong>{t.title}</p>)}
          {r.incoming.map(msg => <p key={msg.id}><strong>{roleById(msg.from).name}等你回复：</strong>{msg.text}</p>)}
          {!r.mine.length && !r.incoming.length && <p>{r.current}</p>}
        </div>}
      </div> : <div className="unselected-chat"><p>当前列表没有工作。</p><button className="secondary" onClick={startWork}><Plus size={18} />发起工作</button></div>}
      <div role="log" aria-label="对话记录" aria-live="polite">
        {(matter ? messages : composing ? messages.slice(composeFrom) : []).map(msg => <div className={msg.sender === 'user' ? 'user-message' : 'assistant-message'} key={msg.id}>
          {msg.sender === 'assistant' && <div className="speaker"><Bot size={20} /><strong>工作助手</strong></div>}
          <p>{msg.text}</p>
          {msg.links?.filter(id => id !== context).length > 0 && <div className="chat-references">{msg.links.filter(id => id !== context).map(id => { const m = state.matters.find(x => x.id === id); return m && <button key={id} onClick={() => open(id)}><span>{m.title}</span><ChevronRight size={18} /></button>; })}</div>}
          {msg.artifactId && <ArtifactLink artifact={state.artifacts.find(a => a.id === msg.artifactId)} version={msg.artifactVersion} open={openArtifact} />}
          {msg.proposal && <div className={'proposal ' + msg.proposal.status}><div className="proposal-eyebrow">{msg.proposal.status === 'pending' ? '请核对后确认' : { confirmed: '已确认', cancelled: '已撤回', expired: '已失效', superseded: '已有新意见' }[msg.proposal.status]}</div><h3>{msg.proposal.title}</h3><p>{msg.proposal.detail}</p>{msg.proposal.action.type === 'act' && <blockquote>{msg.proposal.action.result}</blockquote>}{msg.proposal.status === 'pending' && <footer><button className="primary" onClick={() => commit({ type: 'confirm', role, context, messageId: msg.id })}><Check size={18} />确认执行</button><button className="secondary" onClick={() => commit({ type: 'cancel', role, context, messageId: msg.id })}>暂不执行</button></footer>}</div>}
        </div>)}
      </div>
    </div>
    {(matter || composing) && <div className="composer-area">
      {ownJobs.map(job => <div className="live-job" key={job.id}>{job.status === 'running' ? <LoaderCircle size={18} className="spin" /> : <Clock3 size={18} />}<span>{job.title}</span><small>{job.status === 'running' ? '准备中' : job.status === 'waiting' ? '等你确认' : '已暂停'}</small></div>)}
      {error && <p className="chat-error" role="alert">{error}</p>}
      <form className="composer" onSubmit={send}>
        {targetArtifact && <div className="editing-target"><FileText size={18} /><span>{targetArtifact.title}</span><IconButton label="取消报告上下文" onClick={clearTarget}><X size={18} /></IconButton></div>}
        <label className="composer-label" htmlFor="work-instruction">{matter ? '你的意见或安排' : '工作要求'}</label>
        <textarea id="work-instruction" ref={input} aria-label="给 DSH 的工作安排" placeholder={matter ? '输入你的意见…' : '例如：帮我整理本周工作周报'} value={draft} maxLength={2000} onChange={e => setDrafts(prev => ({ ...prev, [key]: e.target.value }))} onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); send(e); } }} />
        <div className="composer-bottom"><button className="send-button" aria-label="发送给 DSH" disabled={!draft.trim() || busy}><ArrowUp size={18} />发送</button></div>
      </form>
    </div>}
  </aside>;
}
function Dialog({ title, close, children, wide = false }) {
  const ref = useRef(null);
  useEffect(() => { const previous = document.activeElement; ref.current.showModal(); return () => { ref.current?.close(); previous?.focus(); }; }, []);
  return <dialog ref={ref} className={`dialog ${wide ? 'wide' : ''}`} onCancel={e => { e.preventDefault(); close(); }} aria-label={title}><header><h2>{title}</h2><IconButton label="关闭弹窗" onClick={close}><X size={19} /></IconButton></header>{children}</dialog>;
}
function Report({ artifact, initialVersion, close, revise }) {
  const [number, setNumber] = useState(initialVersion || artifact.versions.length); const version = artifact.versions.find(v => v.number === number) || artifact.versions.at(-1);
  function download() { const url = URL.createObjectURL(new Blob([reportText(artifact, version)], { type: 'text/plain;charset=utf-8' })); const a = document.createElement('a'); a.href = url; a.download = `${artifact.title}-v${version.number}-演示.txt`; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); }
  return <Dialog title="工作成果" close={close} wide><div className="report-toolbar"><span><Sparkles size={14} />DSH 生成 · {artifactStatus(artifact, version.number)}</span><select aria-label="报告版本" value={version.number} onChange={e => setNumber(Number(e.target.value))}>{artifact.versions.map(v => <option key={v.number} value={v.number}>第 {v.number} 版</option>)}</select><IconButton label="下载这版报告" onClick={download}><Download size={17} /></IconButton></div><article className="report-paper"><div className="eyebrow">祥泰供电所 / {roleById(artifact.owner).label}</div><h1>{artifact.title}</h1><p className="report-meta">依据 9 月 24 日演示事项 · 共 {artifact.matterIds.length} 件 · 第 {version.number} 版</p>{version.sections.map(s => <section key={s.title}><h2>{s.title}</h2>{s.lines.map((line, i) => <p key={i}>{line}</p>)}</section>)}<footer>本稿由对话样例生成，未连接真实业务数据。{artifactStatus(artifact, version.number)}，不代表真实业务审定。</footer></article><footer className="report-actions"><span>{artifact.reviewedAt ? '已收口，原始记录与历史版本只读' : '原始记录与历史版本已保留'}</span>{!artifact.reviewedAt && <button className="secondary" onClick={revise}><MessageSquare size={15} />继续对话修改</button>}</footer></Dialog>;
}

function App() {
  const [loaded] = useState(() => { try { return { data: parseDialogue(localStorage.getItem(DIALOGUE_STORE), localStorage.getItem(STORE)) }; } catch (e) { return { data: initialDialogue(), error: e.message }; } });
  const [state, setState] = useState(loaded.data); const dataRef = useRef(loaded.data);
  const [locked, setLocked] = useState(Boolean(loaded.error)); const [error, setError] = useState(loaded.error || '');
  const initialView = role => ({ ...defaultWorkspaceView(), selectedId: selectWorkspace(dataRef.current, role).matches[0]?.id || null });
  const [role, setRole] = useState('director'); const [views, setViews] = useState(() => ({ director: initialView('director') }));
  const [drafts, setDrafts] = useState({}); const [mobileChat, setMobileChat] = useState(false);
  const [modal, setModal] = useState(null); const [revisionTargets, setRevisionTargets] = useState({});
  const viewport = useRef(null); const menu = useRef(null); const positions = useRef({}); const composerFocus = useRef(false);
  const view = views[role] || defaultWorkspaceView();
  const { relevant, matches, selected, pinned, counts, items } = selectWorkspace(state, role, view);
  const context = selected?.id || 'workspace';
  const artifacts = state.artifacts.filter(a => a.owner === role);
  const choices = [{ id: 'pending', label: '待我处理' }, { id: 'following', label: '我在跟进' }];
  const latest = relevant.filter(m => !m.closed).flatMap(m => m.events.slice(-1).map(e => ({ ...e, matter: m }))).sort((a, b) => b.at.localeCompare(a.at));
  function updateView(patch) { setViews(prev => ({ ...prev, [role]: { ...(prev[role] || defaultWorkspaceView()), ...patch } })); }
  function filterWork(patch) {
    const matching = selectWorkspace(state, role, { ...view, ...patch }).matches;
    updateView({ ...patch, selectedId: matching.some(m => m.id === view.selectedId) ? view.selectedId : matching[0]?.id || null, composing: false });
  }
  function commit(action) {
    if (locked) { setError('保存的记录异常，需确认重置后才能继续。'); return false; }
    try {
      const before = dataRef.current; const next = dialogueTransition(before, action);
      if (next !== before) localStorage.setItem(DIALOGUE_STORE, JSON.stringify(next));
      dataRef.current = next; setState(next); setError('');
      if (action.type === 'send') {
        const created = next.matters.find(m => !before.matters.some(old => old.id === m.id));
        if (created) updateView({ selectedId: created.id, composing: false });
      }
      return next;
    } catch (e) { setError('未保存：' + e.message); return false; }
  }
  const running = state.matters.some(m => m.jobs.some(j => j.status === 'running'));
  useEffect(() => { if (!running || locked || error) return; const timer = setInterval(() => commit({ type: 'domain-tick' }), 1400); return () => clearInterval(timer); }, [running, locked, error]);
  useEffect(() => { viewport.current?.scrollTo({ top: positions.current[role] || 0 }); }, [role]);
  useLayoutEffect(() => {
    const feed = viewport.current;
    const entry = Array.from(feed?.querySelectorAll('[data-matter-id]') || []).find(el => el.dataset.matterId === view.selectedId);
    if (!entry) return;
    const offset = entry.getBoundingClientRect().top - feed.getBoundingClientRect().top;
    if (offset < 0 || offset > feed.clientHeight / 2) feed.scrollTop += offset;
  }, [view.selectedId]);
  useEffect(() => { if (composerFocus.current) { document.querySelector('[aria-label="给 DSH 的工作安排"]')?.focus(); composerFocus.current = false; } }, [context, mobileChat, drafts, view.composing]);
  function open(id) {
    if (!relevant.some(m => m.id === id)) return;
    updateView({ selectedId: id, composing: false }); setMobileChat(true);
  }
  function switchRole(id) {
    positions.current[role] = viewport.current?.scrollTop || 0;
    if (!views[id]) setViews(prev => ({ ...prev, [id]: initialView(id) }));
    setRole(id); setModal(null); setMobileChat(false);
  }
  function startWork() {
    updateView({ selectedId: null, composing: true, composeFrom: (state.conversations[channelKey(role)] || []).length });
    setMobileChat(true); composerFocus.current = true;
  }
  function prepare(text, id = selected?.id) {
    if (id) open(id); else startWork();
    setDrafts(prev => ({ ...prev, [channelKey(role, id || 'workspace')]: text }));
    composerFocus.current = true; setMobileChat(true);
  }
  function openArtifact(id, version) { setModal({ type: 'report', id, version }); }
  const modalArtifact = artifacts.find(a => a.id === modal?.id);
  function reviseArtifact() {
    const nextContext = modalArtifact.context;
    if (!relevant.some(m => m.id === nextContext)) { setError('未找到报告所属工作，原记录已保留。'); return; }
    open(nextContext); setModal(null);
    const conversation = channelKey(role, nextContext);
    setRevisionTargets(prev => ({ ...prev, [conversation]: modalArtifact.id }));
    setDrafts(prev => ({ ...prev, [conversation]: '精简成三点' })); composerFocus.current = true;
  }
  function reset() {
    try {
      const clean = initialDialogue(); localStorage.setItem(DIALOGUE_STORE, JSON.stringify(clean));
      dataRef.current = clean; setState(clean); setDrafts({}); setViews({ [role]: initialView(role) });
      positions.current = {}; setRevisionTargets({}); setLocked(false); setError(''); setModal(null); setMobileChat(false);
    } catch (e) { setError('未重置：' + e.message); }
  }
  function menuAction(action) { menu.current?.hidePopover(); action(); }
  return <div className={'single-workspace' + (mobileChat ? ' mobile-chat' : '')}>
    <header className="workspace-header">
      <div className="brand"><UtilityPole size={24} /><span>供电所工作台</span></div>
      <span className="environment-label"><span className="long-label">本地演示 · 未连接业务系统</span><span className="short-label">演示</span></span>
      <div className="header-tools">
        <select className="role-picker" aria-label="当前演示岗位" value={role} onChange={e => switchRole(e.target.value)}>{roles.map(r => <option key={r.id} value={r.id}>{r.name} · {r.short}</option>)}</select>
        <IconButton label="更多" popoverTarget="workspace-menu"><Ellipsis size={24} /></IconButton>
      </div>
    </header>
    <div id="workspace-menu" className="workspace-menu" popover="auto" ref={menu}>
      <button onClick={() => menuAction(() => setModal({ type: 'brief' }))}><FileText size={18} />今日简报</button>
      <button onClick={() => menuAction(() => setModal({ type: 'library' }))}><FileText size={18} />工作成果</button>
      <button onClick={() => menuAction(() => { filterWork({ lens: 'archive', query: '' }); setMobileChat(false); })}><Archive size={18} />已完成工作</button>
      <button onClick={() => menuAction(() => setModal({ type: 'reset' }))}><RotateCcw size={18} />重置对话演示</button>
    </div>
    <main className="stable-work-area">
      <div className="work-area-heading"><h1>我的工作</h1><button className="primary new-work" onClick={startWork}><Plus size={18} />发起工作</button></div>
      {view.lens === 'archive' ? <div className="archive-heading"><button onClick={() => filterWork({ lens: 'pending' })}><ArrowLeft size={18} />返回待处理</button><strong>已完成 {counts.archive}</strong></div> : <div className="attention-tabs" role="tablist" aria-label="工作关注视图">{choices.map((l, i) => <button key={l.id} role="tab" aria-selected={view.lens === l.id} tabIndex={view.lens === l.id ? 0 : -1} onClick={() => filterWork({ lens: l.id })} onKeyDown={e => {
        if (['ArrowLeft', 'ArrowRight'].includes(e.key)) {
          e.preventDefault(); const next = (i + 1) % choices.length;
          filterWork({ lens: choices[next].id }); e.currentTarget.parentElement.children[next].focus();
        }
      }}>{l.label}<span>{counts[l.id]}</span></button>)}</div>}
      <div className="list-search"><Search size={18} /><input aria-label="搜索事项" placeholder="搜索工作" value={view.query} onChange={e => filterWork({ query: e.target.value })} />{view.query && <IconButton label="清空搜索" onClick={() => filterWork({ query: '' })}><X size={18} /></IconButton>}</div>
      <div className="work-feed-scroll" ref={viewport}><div className="work-feed">
        {items.map(m => <MatterRow key={m.id} matter={m} role={role} selected={m.id === selected?.id} pinned={m.id === pinned?.id} open={open} />)}
        {items.length === 0 && <Empty>{view.query ? '没有找到这项工作' : view.lens === 'pending' ? '暂无待处理工作' : view.lens === 'archive' ? '暂无已完成工作' : '暂无跟进中的工作'}</Empty>}
      </div></div>
      {error && !selected && !view.composing && <p className="chat-error" role="alert">{error}</p>}
    </main>
    <Conversation state={state} role={role} context={context} composing={view.composing} composeFrom={view.composeFrom || 0} startWork={startWork} commit={commit} open={open} openArtifact={openArtifact} prepare={prepare} drafts={drafts} setDrafts={setDrafts} back={() => setMobileChat(false)} error={error} targetArtifact={artifacts.find(a => a.id === revisionTargets[channelKey(role, context)])} clearTarget={() => setRevisionTargets(prev => ({ ...prev, [channelKey(role, context)]: null }))} />
    {modal?.type === 'brief' && <Dialog title="今日简报" close={() => setModal(null)} wide><div className="brief-content"><p>{counts.pending} 件待处理，{counts.following} 件跟进中，{counts.archive} 件已完成。</p>{latest.map(e => <button key={e.matter.id} onClick={() => { open(e.matter.id); setModal(null); }}><strong>{e.matter.title}</strong><span>{e.text}</span></button>)}{!latest.length && <Empty>暂无新的工作动态</Empty>}</div></Dialog>}
    {modal?.type === 'library' && <Dialog title="工作成果" close={() => setModal(null)} wide><div className="artifact-library">{artifacts.length ? artifacts.map(a => <ArtifactLink key={a.id} artifact={a} open={openArtifact} />) : <Empty>暂无已生成的工作成果</Empty>}</div></Dialog>}
    {modal?.type === 'report' && modalArtifact && <Report artifact={modalArtifact} initialVersion={modal.version} close={() => setModal(null)} revise={reviseArtifact} />}
    {modal?.type === 'reset' && <Dialog title="重置对话演示？" close={() => setModal(null)}><div className="reset-body"><p>清除本版的对话、报告与操作记录，恢复初始工作。不会影响业务系统。</p>{error && <p role="alert" className="chat-error">{error}</p>}<div className="reset-actions"><button className="secondary" onClick={() => setModal(null)}>取消</button><button className="primary" onClick={reset}>确认重置</button></div></div></Dialog>}
  </div>;
}
createRoot(document.getElementById('root')).render(<App />);
