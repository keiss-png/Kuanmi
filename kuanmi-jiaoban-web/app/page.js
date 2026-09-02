'use client';

import { useEffect, useRef, useState } from 'react';

function todayInShanghai() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Shanghai' }).format(new Date());
}

function Ticket({ e }) {
  const [expanded, setExpanded] = useState(false);
  return (
    <div className="ticket" onClick={() => setExpanded(!expanded)}>
      <div className="meta"><span>{e.date}</span><span className="cat">{e.category}</span></div>
      <div className={`summary ${e.severity === '高' ? 'sevHi' : ''}`}>{e.issue_summary}</div>
      {expanded && <div className="raw">{e.raw_notes}</div>}
    </div>
  );
}

export default function MomPage() {
  const [ready, setReady] = useState(false);
  const [accessKey, setAccessKey] = useState('');
  const [entries, setEntries] = useState([]);
  const [conv, setConv] = useState([]);
  const [turnCount, setTurnCount] = useState(0);
  const [done, setDone] = useState(false);
  const [loading, setLoading] = useState(false);
  const [input, setInput] = useState('');
  const [error, setError] = useState('');
  const today = useRef(todayInShanghai()).current;

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const k = params.get('key') || '';
    setAccessKey(k);
    load(k);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function load(k) {
    try {
      const res = await fetch(`/api/entries?key=${encodeURIComponent(k)}`);
      if (!res.ok) {
        setError('这个链接不对，找宽米管理员要一下正确的链接');
        setReady(true);
        return;
      }
      const data = await res.json();
      setEntries(data.entries || []);
    } catch (e) {
      setError('网络出了点问题，刷新页面再试试');
    }
    setReady(true);
  }

  function startConversation() {
    setConv([{ role: 'assistant', text: '今天店里有什么想说的？顾客、员工、进货、设备、账目，随便说说，没有也可以说"一切正常"。' }]);
    setDone(false);
    setTurnCount(0);
    setError('');
  }

  async function send() {
    const val = input.trim();
    if (!val) {
      setError('先打几个字再发送');
      return;
    }
    setError('');
    const newConv = [...conv, { role: 'user', text: val }];
    setConv(newConv);
    setInput('');
    setLoading(true);
    const nextTurn = turnCount + 1;
    setTurnCount(nextTurn);

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ key: accessKey, conv: newConv, turnCount: nextTurn }),
      });
      if (res.status === 401) {
        setError('无权限，链接可能不对');
        setLoading(false);
        return;
      }
      const data = await res.json();
      if (data.action === 'ask') {
        setConv([...newConv, { role: 'assistant', text: data.question }]);
      } else {
        setDone(true);
        setEntries((prev) => [data.entry, ...prev]);
      }
    } catch (e) {
      setError('网络出了点问题，再试一次');
    }
    setLoading(false);
  }

  if (!ready) return <div className="loading">加载中…</div>;
  if (!accessKey || (error && entries.length === 0 && conv.length === 0)) {
    return <div className="empty">{error || '链接不对，找宽米管理员要一下正确链接。'}</div>;
  }

  const todaysEntries = entries.filter((e) => e.date === today);

  return (
    <div className="app">
      <div className="head">
        <div>
          <h1>宽米 · 交班本</h1>
          <div className="sub">{today} · 每天几句话，不用填表</div>
        </div>
      </div>
      <div className="bodyArea">
        {conv.length === 0 && (
          <>
            {todaysEntries.length > 0 && (
              <>
                <div className="sectionLabel">今天已经记了 {todaysEntries.length} 条</div>
                {todaysEntries.map((e) => <Ticket key={e.id} e={e} />)}
              </>
            )}
            <button className="plain" onClick={startConversation} style={{ marginTop: 10 }}>
              {todaysEntries.length > 0 ? '+ 再记一条' : '开始记录今天'}
            </button>
          </>
        )}

        {conv.length > 0 && (
          <>
            <div className="chat">
              {conv.map((m, i) => (
                <div key={i} className={`bubble ${m.role === 'assistant' ? 'ai' : 'user'}`}>{m.text}</div>
              ))}
            </div>

            {!done ? (
              <>
                <div className="inputRow">
                  <textarea
                    className="inp"
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    placeholder="随便打几个字就行……"
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault();
                        send();
                      }
                    }}
                  />
                  <button className="send" disabled={loading} onClick={send}>{loading ? '...' : '发送'}</button>
                </div>
                {error && <div className="err">{error}</div>}
              </>
            ) : (
              <>
                <div className="loadingNote">已记录，盖章完成 ✓</div>
                <button className="plain" onClick={startConversation} style={{ marginTop: 10 }}>+ 再记一条</button>
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
}
