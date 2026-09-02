'use client';

import { useEffect, useRef, useState } from 'react';

function todayInShanghai() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Shanghai' }).format(new Date());
}

// 语音输入：安卓 Chrome 等支持 Web Speech API 的浏览器才会显示麦克风按钮，
// iOS Safari 不支持这个 API，会自动隐藏（但系统输入法自带的语音听写不受影响）。
function useSpeechToText(onResult) {
  const [supported, setSupported] = useState(false);
  const [recording, setRecording] = useState(false);
  const recognitionRef = useRef(null);

  useEffect(() => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) return;
    const recognition = new SpeechRecognition();
    recognition.lang = 'zh-CN';
    recognition.continuous = true;
    recognition.interimResults = false;
    recognition.onresult = (e) => {
      let text = '';
      for (let i = e.resultIndex; i < e.results.length; i++) {
        if (e.results[i].isFinal) text += e.results[i][0].transcript;
      }
      if (text) onResult(text);
    };
    recognition.onend = () => setRecording(false);
    recognition.onerror = () => setRecording(false);
    recognitionRef.current = recognition;
    setSupported(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function toggle() {
    if (!recognitionRef.current) return;
    if (recording) {
      recognitionRef.current.stop();
      setRecording(false);
    } else {
      recognitionRef.current.start();
      setRecording(true);
    }
  }

  return { supported, recording, toggle };
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

  // 专题访谈
  const [interviewModules, setInterviewModules] = useState([]);
  const [interviewSkipped, setInterviewSkipped] = useState(false);
  const [interviewActive, setInterviewActive] = useState(false);
  const [interviewDone, setInterviewDone] = useState(false);
  const [interviewConv, setInterviewConv] = useState([]);
  const [interviewGroupIndex, setInterviewGroupIndex] = useState(0);
  const [interviewTurnCount, setInterviewTurnCount] = useState(0);
  const [interviewGroupTurnCount, setInterviewGroupTurnCount] = useState(0);
  const [interviewInput, setInterviewInput] = useState('');
  const [interviewLoading, setInterviewLoading] = useState(false);
  const [interviewError, setInterviewError] = useState('');

  const dailySpeech = useSpeechToText((text) => setInput((prev) => (prev ? prev + text : text)));
  const interviewSpeech = useSpeechToText((text) => setInterviewInput((prev) => (prev ? prev + text : text)));

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
      const imRes = await fetch(`/api/interview-modules?key=${encodeURIComponent(k)}`);
      if (imRes.ok) {
        const imData = await imRes.json();
        setInterviewModules(imData.modules || []);
      }
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

  const interviewModule = interviewModules.find((m) => m.status === 'in_progress');

  function startInterview() {
    if (!interviewModule) return;
    const firstGroup = interviewModule.groups[0];
    setInterviewGroupIndex(0);
    setInterviewTurnCount(0);
    setInterviewGroupTurnCount(0);
    setInterviewConv([
      { role: 'assistant', text: `另外想跟你聊聊"${interviewModule.name}"。${firstGroup.questions[0]}` },
    ]);
    setInterviewActive(true);
    setInterviewDone(false);
    setInterviewError('');
  }

  async function sendInterview(earlyExit) {
    if (!interviewModule) return;
    let newConv = interviewConv;
    if (!earlyExit) {
      const val = interviewInput.trim();
      if (!val) {
        setInterviewError('先打几个字再发送');
        return;
      }
      newConv = [...interviewConv, { role: 'user', text: val }];
      setInterviewConv(newConv);
      setInterviewInput('');
    }
    setInterviewError('');
    setInterviewLoading(true);
    const nextTurn = turnCountOrZero(interviewTurnCount, earlyExit);
    const nextGroupTurn = turnCountOrZero(interviewGroupTurnCount, earlyExit);
    if (!earlyExit) {
      setInterviewTurnCount(nextTurn);
      setInterviewGroupTurnCount(nextGroupTurn);
    }

    try {
      const res = await fetch('/api/interview-chat', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          key: accessKey,
          module_id: interviewModule.id,
          conv: newConv,
          turnCount: nextTurn,
          groupIndex: interviewGroupIndex,
          groupTurnCount: nextGroupTurn,
          earlyExit: !!earlyExit,
        }),
      });
      if (res.status === 401) {
        setInterviewError('无权限，链接可能不对');
        setInterviewLoading(false);
        return;
      }
      const data = await res.json();
      if (data.action === 'ask') {
        setInterviewConv([...newConv, { role: 'assistant', text: data.question }]);
      } else if (data.action === 'next_group') {
        setInterviewGroupIndex(data.groupIndex);
        setInterviewGroupTurnCount(0);
        const label = data.group ? `${data.group}。` : '';
        setInterviewConv([...newConv, { role: 'assistant', text: label + data.question }]);
      } else {
        setInterviewDone(true);
        setInterviewModules((prev) =>
          prev.map((m) => (m.id === interviewModule.id ? { ...m, status: 'done' } : m))
        );
      }
    } catch (e) {
      setInterviewError('网络出了点问题，再试一次');
    }
    setInterviewLoading(false);
  }

  function turnCountOrZero(count, earlyExit) {
    return earlyExit ? count : count + 1;
  }

  if (!ready) return <div className="loading">加载中…</div>;
  if (!accessKey || (error && entries.length === 0 && conv.length === 0)) {
    return <div className="empty">{error || '链接不对，找宽米管理员要一下正确链接。'}</div>;
  }

  const todaysEntries = entries.filter((e) => e.date === today);
  const finishedTodaysCheckIn = done || (conv.length === 0 && todaysEntries.length > 0);
  const showInterviewBlock =
    interviewModule &&
    !interviewSkipped &&
    !interviewActive &&
    !interviewDone &&
    finishedTodaysCheckIn;

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
                  {dailySpeech.supported && (
                    <button
                      type="button"
                      className={`mic ${dailySpeech.recording ? 'recording' : ''}`}
                      onClick={dailySpeech.toggle}
                    >
                      🎤
                    </button>
                  )}
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

        {showInterviewBlock && (
          <div className="interviewPrompt">
            <div className="ask">另外想跟你聊聊"{interviewModule.name}"，方便的话说两句？</div>
            <div className="interviewRow">
              <button className="plain" onClick={startInterview}>现在聊两句</button>
              <button className="plain" onClick={() => setInterviewSkipped(true)}>下次再说</button>
            </div>
          </div>
        )}

        {interviewActive && (
          <div className="interviewPrompt">
            <div className="chat">
              {interviewConv.map((m, i) => (
                <div key={i} className={`bubble ${m.role === 'assistant' ? 'ai' : 'user'}`}>{m.text}</div>
              ))}
            </div>

            {!interviewDone ? (
              <>
                <div className="inputRow">
                  <textarea
                    className="inp"
                    value={interviewInput}
                    onChange={(e) => setInterviewInput(e.target.value)}
                    placeholder="随便打几个字就行……"
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault();
                        sendInterview(false);
                      }
                    }}
                  />
                  {interviewSpeech.supported && (
                    <button
                      type="button"
                      className={`mic ${interviewSpeech.recording ? 'recording' : ''}`}
                      onClick={interviewSpeech.toggle}
                    >
                      🎤
                    </button>
                  )}
                  <button className="send" disabled={interviewLoading} onClick={() => sendInterview(false)}>
                    {interviewLoading ? '...' : '发送'}
                  </button>
                </div>
                <button
                  className="plain"
                  disabled={interviewLoading}
                  onClick={() => sendInterview(true)}
                  style={{ marginTop: 10 }}
                >
                  先聊到这，下次再继续
                </button>
                {interviewError && <div className="err">{interviewError}</div>}
              </>
            ) : (
              <div className="loadingNote">这个话题聊完了，谢谢你 ✓</div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
