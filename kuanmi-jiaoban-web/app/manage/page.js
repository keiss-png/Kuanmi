'use client';

import { useEffect, useState } from 'react';

const STATUS_LABEL = { pending: '待访谈', in_progress: '进行中', done: '已完成' };
const CATEGORIES = ['顾客', '员工', '供应', '设备', '财务', '其他'];
const SEVERITIES = ['低', '中', '高'];

function EntryTicket({ e, editing, onStartEdit, onCancelEdit, onSave, saving, confirmingDelete, onRequestDelete, onConfirmDelete, onCancelDelete }) {
  const [draft, setDraft] = useState(null);

  useEffect(() => {
    if (editing) {
      setDraft({
        category: e.category,
        severity: e.severity,
        issue_summary: e.issue_summary,
        raw_notes: e.raw_notes,
      });
    }
  }, [editing, e]);

  if (editing && draft) {
    return (
      <div className="ticket">
        <div className="editRow">
          <select className="editSelect" value={draft.category} onChange={(ev) => setDraft({ ...draft, category: ev.target.value })}>
            {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
          <select className="editSelect" value={draft.severity} onChange={(ev) => setDraft({ ...draft, severity: ev.target.value })}>
            {SEVERITIES.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
        <input
          className="editArea"
          value={draft.issue_summary}
          onChange={(ev) => setDraft({ ...draft, issue_summary: ev.target.value })}
          placeholder="一句话概括"
        />
        <textarea
          className="editArea"
          value={draft.raw_notes}
          onChange={(ev) => setDraft({ ...draft, raw_notes: ev.target.value })}
          placeholder="详细内容"
        />
        <div className="ticketActions">
          <button className="linkBtn" disabled={saving} onClick={() => onSave(e.id, draft)}>{saving ? '保存中…' : '保存'}</button>
          <button className="linkBtn" disabled={saving} onClick={onCancelEdit}>取消</button>
        </div>
      </div>
    );
  }

  return (
    <div className="ticket">
      <div className="meta"><span>{e.date}</span><span className="cat">{e.category}</span></div>
      <div className="summary">{e.issue_summary}</div>
      <div className="raw">{e.raw_notes}</div>
      <div className="ticketActions">
        {confirmingDelete ? (
          <>
            <span style={{ fontSize: 12, color: 'var(--stamp)' }}>确定删除这条记录？</span>
            <button className="linkBtn danger" onClick={onConfirmDelete}>确定</button>
            <button className="linkBtn" onClick={onCancelDelete}>取消</button>
          </>
        ) : (
          <>
            <button className="linkBtn" onClick={() => onStartEdit(e.id)}>编辑</button>
            <button className="linkBtn danger" onClick={onRequestDelete}>删除</button>
          </>
        )}
      </div>
    </div>
  );
}

function ModuleRow({ m, sessions, onClick, expanded, onRequestDeleteSession, onConfirmDeleteSession, onCancelDeleteSession, confirmingSessionId, deletingId }) {
  const moduleSessions = sessions.filter((s) => s.module_id === m.id);
  return (
    <div>
      <div className="moduleRow" onClick={onClick}>
        <div>
          <span className="name">{m.name}</span>
          {m.last_session_date && <span className="date">{m.last_session_date}</span>}
        </div>
        <span className={`badge ${m.status}`}>{STATUS_LABEL[m.status]}</span>
      </div>
      {expanded && moduleSessions.length > 0 && (
        <div className="ticket" style={{ marginTop: -4, marginBottom: 12 }}>
          {moduleSessions.map((s) => (
            <div key={s.id} className="qaBlock">
              <div className="meta"><span>{s.date}</span></div>
              {(s.qa_pairs || []).map((p, i) => (
                <div key={i}>
                  <div className="q">{p.question}</div>
                  <div className="a">{p.answer}</div>
                </div>
              ))}
              <div className="ticketActions">
                {confirmingSessionId === s.id ? (
                  <>
                    <span style={{ fontSize: 12, color: 'var(--stamp)' }}>确定删除这次访谈？</span>
                    <button className="linkBtn danger" onClick={(ev) => { ev.stopPropagation(); onConfirmDeleteSession(s.id); }}>
                      {deletingId === s.id ? '删除中…' : '确定'}
                    </button>
                    <button className="linkBtn" onClick={(ev) => { ev.stopPropagation(); onCancelDeleteSession(); }}>取消</button>
                  </>
                ) : (
                  <button
                    className="linkBtn danger"
                    onClick={(ev) => { ev.stopPropagation(); onRequestDeleteSession(s.id); }}
                  >
                    删除这次访谈
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function ManagePage() {
  const [accessKey, setAccessKey] = useState('');
  const [tab, setTab] = useState('entries');

  const [entries, setEntries] = useState([]);
  const [analysis, setAnalysis] = useState(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [editingEntryId, setEditingEntryId] = useState(null);
  const [savingEntry, setSavingEntry] = useState(false);
  const [confirmingEntryId, setConfirmingEntryId] = useState(null);

  const [interviewModules, setInterviewModules] = useState([]);
  const [interviewSessions, setInterviewSessions] = useState([]);
  const [interviewAnalysis, setInterviewAnalysis] = useState(null);
  const [interviewAnalyzing, setInterviewAnalyzing] = useState(false);
  const [triggering, setTriggering] = useState(false);
  const [expandedModuleId, setExpandedModuleId] = useState(null);
  const [deletingSessionId, setDeletingSessionId] = useState(null);
  const [confirmingSessionId, setConfirmingSessionId] = useState(null);

  const [ready, setReady] = useState(false);
  const [error, setError] = useState('');
  const [fatalError, setFatalError] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const k = params.get('key') || '';
    setAccessKey(k);
    load(k);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function load(k) {
    try {
      const [er, ar, imr, isr, iar] = await Promise.all([
        fetch(`/api/entries?key=${encodeURIComponent(k)}`),
        fetch(`/api/analyze?key=${encodeURIComponent(k)}`),
        fetch(`/api/interview-modules?key=${encodeURIComponent(k)}`),
        fetch(`/api/interview-sessions?key=${encodeURIComponent(k)}`),
        fetch(`/api/interview-analyze?key=${encodeURIComponent(k)}`),
      ]);
      if ([er, ar, imr, isr, iar].some((r) => r.status === 401)) {
        setError('无权限，检查链接里的 key 参数是不是对的');
        setFatalError(true);
        setReady(true);
        return;
      }
      const ed = await er.json();
      const ad = await ar.json();
      const imd = await imr.json();
      const isd = await isr.json();
      const iad = await iar.json();
      setEntries(ed.entries || []);
      setAnalysis(ad.analysis || null);
      setInterviewModules(imd.modules || []);
      setInterviewSessions(isd.sessions || []);
      setInterviewAnalysis(iad.analysis || null);
    } catch (e) {
      setError('加载失败，刷新页面再试试');
      setFatalError(true);
    }
    setReady(true);
  }

  async function runAnalyze() {
    if (entries.length < 2) {
      setError('再多攒几天记录，规律分析才会准（至少需要2条）。');
      return;
    }
    setAnalyzing(true);
    setError('');
    try {
      const res = await fetch('/api/analyze', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ key: accessKey }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError('分析失败，稍后再试一次');
        setAnalyzing(false);
        return;
      }
      setAnalysis(data.analysis);
    } catch (e) {
      setError('分析失败，稍后再试一次');
    }
    setAnalyzing(false);
  }

  async function deleteEntry(id) {
    setConfirmingEntryId(null);
    setError('');
    try {
      const res = await fetch('/api/entries', {
        method: 'DELETE',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ key: accessKey, id }),
      });
      if (!res.ok) {
        setError('删除失败，稍后再试一次');
        return;
      }
      setEntries((prev) => prev.filter((e) => e.id !== id));
    } catch (e) {
      setError('删除失败，稍后再试一次');
    }
  }

  async function saveEntry(id, updates) {
    setSavingEntry(true);
    setError('');
    try {
      const res = await fetch('/api/entries', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ key: accessKey, id, updates }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError('保存失败，稍后再试一次');
        setSavingEntry(false);
        return;
      }
      setEntries((prev) => prev.map((e) => (e.id === id ? data.entry : e)));
      setEditingEntryId(null);
    } catch (e) {
      setError('保存失败，稍后再试一次');
    }
    setSavingEntry(false);
  }

  async function triggerNextModule() {
    setTriggering(true);
    setError('');
    try {
      const res = await fetch('/api/interview-modules', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ key: accessKey }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error === 'no_pending_module' ? '所有模块都已经在进行或完成了' : '触发失败，稍后再试一次');
        setTriggering(false);
        return;
      }
      setInterviewModules((prev) =>
        prev.map((m) => (m.id === data.module.id ? { ...m, status: 'in_progress' } : m))
      );
    } catch (e) {
      setError('触发失败，稍后再试一次');
    }
    setTriggering(false);
  }

  async function deleteSession(id) {
    setConfirmingSessionId(null);
    setDeletingSessionId(id);
    setError('');
    try {
      const res = await fetch('/api/interview-sessions', {
        method: 'DELETE',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ key: accessKey, id }),
      });
      if (!res.ok) {
        setError('删除失败，稍后再试一次');
        setDeletingSessionId(null);
        return;
      }
      const deleted = interviewSessions.find((s) => s.id === id);
      const remaining = interviewSessions.filter((s) => s.id !== id);
      setInterviewSessions(remaining);
      if (deleted) {
        const stillHasOthers = remaining.some((s) => s.module_id === deleted.module_id);
        if (!stillHasOthers) {
          setInterviewModules((prev) =>
            prev.map((m) => (m.id === deleted.module_id ? { ...m, status: 'pending', last_session_date: null } : m))
          );
        }
      }
    } catch (e) {
      setError('删除失败，稍后再试一次');
    }
    setDeletingSessionId(null);
  }

  async function runInterviewAnalyze() {
    if (interviewSessions.length === 0) {
      setError('还没有完成的访谈，先触发一个模块让妈妈聊聊吧。');
      return;
    }
    setInterviewAnalyzing(true);
    setError('');
    try {
      const res = await fetch('/api/interview-analyze', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ key: accessKey }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError('分析失败，稍后再试一次');
        setInterviewAnalyzing(false);
        return;
      }
      setInterviewAnalysis(data.analysis);
    } catch (e) {
      setError('分析失败，稍后再试一次');
    }
    setInterviewAnalyzing(false);
  }

  if (!ready) return <div className="loading">加载中…</div>;
  if (fatalError) return <div className="empty">{error}</div>;

  return (
    <div className="app">
      <div className="head">
        <div>
          <h1>宽米 · 规律与 SOP</h1>
          <div className="sub">共 {entries.length} 条记录</div>
        </div>
        {tab === 'entries' && (
          <button className="plain" onClick={runAnalyze} disabled={analyzing}>
            {analyzing ? '分析中…' : analysis ? '重新分析规律' : '分析规律'}
          </button>
        )}
      </div>

      <div className="bodyArea">
        <div className="tabs">
          <button className={`tab ${tab === 'entries' ? 'active' : ''}`} onClick={() => setTab('entries')}>异常记录</button>
          <button className={`tab ${tab === 'interview' ? 'active' : ''}`} onClick={() => setTab('interview')}>专题访谈</button>
        </div>

        {error && <div className="err" style={{ marginBottom: 12 }}>{error}</div>}

        {tab === 'entries' && (
          <>
            {analysis && (
              <>
                <div className="sub" style={{ margin: '0 0 12px' }}>上次分析：{analysis.analyzed_at}</div>

                {analysis.patterns && analysis.patterns.length > 0 && (
                  <>
                    <div className="sectionLabel">重复出现的问题 · 建议立 SOP</div>
                    {analysis.patterns.map((p, i) => (
                      <div className="ticket" key={i}>
                        <div className="meta">
                          <span>{(p.dates || []).join(', ')}</span>
                          <span className="stamp">出现 {p.count} 次</span>
                        </div>
                        <div className="summary">{p.theme}</div>
                        <div style={{ fontSize: 13, color: '#6b6353', marginTop: 8 }}>
                          <strong>建议 SOP：</strong>{p.sop_title}
                        </div>
                        <ol className="sopSteps">
                          {(p.sop_steps || []).map((s, j) => <li key={j}>{s}</li>)}
                        </ol>
                      </div>
                    ))}
                  </>
                )}

                {analysis.singles && analysis.singles.length > 0 && (
                  <>
                    <div className="sectionLabel">偶发事项（暂不需要 SOP）</div>
                    {analysis.singles.map((s, i) => (
                      <div className="ticket" key={i}>
                        <div className="meta"><span>{s.date}</span></div>
                        <div className="summary">{s.note}</div>
                      </div>
                    ))}
                  </>
                )}
              </>
            )}

            <div className="sectionLabel">全部记录</div>
            {entries.length === 0 ? (
              <div className="empty">还没有记录，等妈妈那边记几天就有了。</div>
            ) : (
              entries.map((e) => (
                <EntryTicket
                  key={e.id}
                  e={e}
                  editing={editingEntryId === e.id}
                  saving={savingEntry}
                  onStartEdit={setEditingEntryId}
                  onCancelEdit={() => setEditingEntryId(null)}
                  onSave={saveEntry}
                  confirmingDelete={confirmingEntryId === e.id}
                  onRequestDelete={() => setConfirmingEntryId(e.id)}
                  onConfirmDelete={() => deleteEntry(e.id)}
                  onCancelDelete={() => setConfirmingEntryId(null)}
                />
              ))
            )}
          </>
        )}

        {tab === 'interview' && (
          <>
            <div className="sectionLabel">访谈进度</div>
            {interviewModules.map((m) => (
              <ModuleRow
                key={m.id}
                m={m}
                sessions={interviewSessions}
                expanded={expandedModuleId === m.id}
                onClick={() => setExpandedModuleId(expandedModuleId === m.id ? null : m.id)}
                confirmingSessionId={confirmingSessionId}
                onRequestDeleteSession={setConfirmingSessionId}
                onConfirmDeleteSession={deleteSession}
                onCancelDeleteSession={() => setConfirmingSessionId(null)}
                deletingId={deletingSessionId}
              />
            ))}
            <button className="plain" onClick={triggerNextModule} disabled={triggering} style={{ marginTop: 10 }}>
              {triggering ? '触发中…' : '触发下一个模块'}
            </button>

            <div className="sectionLabel" style={{ marginTop: 26 }}>运营流程 SOP 草稿</div>
            <button className="plain" onClick={runInterviewAnalyze} disabled={interviewAnalyzing} style={{ marginBottom: 12 }}>
              {interviewAnalyzing ? '生成中…' : interviewAnalysis ? '重新生成 SOP 草稿' : '生成运营流程 SOP 草稿'}
            </button>

            {interviewAnalysis && (
              <>
                <div className="sub" style={{ margin: '0 0 12px' }}>上次生成：{interviewAnalysis.analyzed_at}</div>

                {(interviewAnalysis.modules || []).map((m, i) => (
                  <div className="ticket" key={i}>
                    <div className="meta"><span>{m.module_name}</span></div>
                    <div className="summary">{m.summary}</div>
                  </div>
                ))}

                {interviewAnalysis.risks && interviewAnalysis.risks.length > 0 && (
                  <>
                    <div className="sectionLabel">高风险点 · 只存在于她脑子里</div>
                    {interviewAnalysis.risks.map((r, i) => (
                      <div className="ticket" key={i}>
                        <div className="meta"><span>{r.module_name}</span></div>
                        <div className="summary sevHi">{r.point}</div>
                      </div>
                    ))}
                  </>
                )}

                {interviewAnalysis.contradictions && interviewAnalysis.contradictions.length > 0 && (
                  <>
                    <div className="sectionLabel">前后矛盾的说法</div>
                    {interviewAnalysis.contradictions.map((c, i) => (
                      <div className="ticket" key={i}>
                        <div className="meta"><span>{(c.related_modules || []).join(', ')}</span></div>
                        <div className="summary">{c.description}</div>
                      </div>
                    ))}
                  </>
                )}
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
}
