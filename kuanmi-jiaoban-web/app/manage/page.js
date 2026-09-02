'use client';

import { useEffect, useState } from 'react';

export default function ManagePage() {
  const [accessKey, setAccessKey] = useState('');
  const [entries, setEntries] = useState([]);
  const [analysis, setAnalysis] = useState(null);
  const [ready, setReady] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
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
      const [er, ar] = await Promise.all([
        fetch(`/api/entries?key=${encodeURIComponent(k)}`),
        fetch(`/api/analyze?key=${encodeURIComponent(k)}`),
      ]);
      if (er.status === 401 || ar.status === 401) {
        setError('无权限，检查链接里的 key 参数是不是对的');
        setFatalError(true);
        setReady(true);
        return;
      }
      const ed = await er.json();
      const ad = await ar.json();
      setEntries(ed.entries || []);
      setAnalysis(ad.analysis || null);
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

  if (!ready) return <div className="loading">加载中…</div>;
  if (fatalError) return <div className="empty">{error}</div>;

  return (
    <div className="app">
      <div className="head">
        <div>
          <h1>宽米 · 规律与 SOP</h1>
          <div className="sub">共 {entries.length} 条记录</div>
        </div>
        <button className="plain" onClick={runAnalyze} disabled={analyzing}>
          {analyzing ? '分析中…' : analysis ? '重新分析规律' : '分析规律'}
        </button>
      </div>

      <div className="bodyArea">
        {error && <div className="err" style={{ marginBottom: 12 }}>{error}</div>}

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
            <div className="ticket" key={e.id}>
              <div className="meta"><span>{e.date}</span><span className="cat">{e.category}</span></div>
              <div className="summary">{e.issue_summary}</div>
              <div className="raw">{e.raw_notes}</div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
