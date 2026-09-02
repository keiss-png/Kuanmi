import { redis } from '../../../lib/redis';
import { callClaude } from '../../../lib/claude';

export async function GET(req) {
  const { searchParams } = new URL(req.url);
  const key = searchParams.get('key');

  if (!key || key !== process.env.ACCESS_KEY) {
    return Response.json({ error: 'unauthorized' }, { status: 401 });
  }

  const raw = await redis.get('interview_analysis');
  const analysis = raw ? (typeof raw === 'string' ? JSON.parse(raw) : raw) : null;

  return Response.json({ analysis });
}

export async function POST(req) {
  const body = await req.json();
  const { key } = body || {};

  if (!key || key !== process.env.ACCESS_KEY) {
    return Response.json({ error: 'unauthorized' }, { status: 401 });
  }

  const raw = await redis.lrange('interview_sessions', 0, -1);
  const sessions = (raw || []).map((r) => (typeof r === 'string' ? JSON.parse(r) : r));

  if (sessions.length === 0) {
    return Response.json({ error: 'not_enough_sessions' }, { status: 400 });
  }

  const byModule = {};
  for (const s of sessions) {
    if (!byModule[s.module_id]) byModule[s.module_id] = { module_name: s.module_name, sessions: [] };
    byModule[s.module_id].sessions.push(s);
  }

  const sys = `你是一个帮助连锁餐厅管理者，把口头访谈整理成结构化运营流程手册的助手。
输入是若干个"访谈模块"的问答记录，每个模块包含模块名和多轮问答。
你的任务：
1. 把每个模块的问答内容整理成一段结构化的流程描述（先讲清楚正常流程是什么样，按模块分段，语言要具体、可执行，不要空话）。
2. 特别标注"高风险点"——那些只存在于老板一个人脑子里、没有文字记录、依赖她临场判断的环节（比如"如果没货了就……"这类应急处理规则）。
3. 标注哪些环节在不同模块的回答中出现矛盾或不一致的说法。
只输出严格的 JSON，不要有其他文字或markdown代码块标记：
{"modules":[{"module_id":"...","module_name":"...","summary":"结构化流程描述"}],"risks":[{"module_name":"...","point":"风险点描述"}],"contradictions":[{"description":"矛盾描述","related_modules":["模块名",...]}]}`;

  const compact = Object.entries(byModule)
    .map(([, v]) => {
      const qa = v.sessions
        .map((s) => (s.qa_pairs || []).map((p) => `Q: ${p.question}\nA: ${p.answer}`).join('\n'))
        .join('\n');
      return `【${v.module_name}】\n${qa}`;
    })
    .join('\n\n');

  const result = await callClaude(sys, compact);

  const analysis = {
    analyzed_at: new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' }),
    modules: result.modules || [],
    risks: result.risks || [],
    contradictions: result.contradictions || [],
  };

  await redis.set('interview_analysis', JSON.stringify(analysis));

  return Response.json({ analysis });
}
