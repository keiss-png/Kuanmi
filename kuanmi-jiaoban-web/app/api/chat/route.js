import { redis } from '../../../lib/redis';
import { callClaude, todayInShanghai } from '../../../lib/claude';

const MAX_TURNS = 3;

export async function POST(req) {
  const body = await req.json();
  const { key, conv, turnCount } = body || {};

  if (!key || key !== process.env.ACCESS_KEY) {
    return Response.json({ error: 'unauthorized' }, { status: 401 });
  }
  if (!Array.isArray(conv) || conv.length === 0) {
    return Response.json({ error: 'bad_request' }, { status: 400 });
  }

  const forceFinish = (turnCount || 0) >= MAX_TURNS;

  const sys = `你是一个帮中餐馆老板做"每日交班记录"的助手，语气自然、口语化、简短。老板是一位不太习惯写长文字的中年女性餐厅经营者。
你的任务：
1. 如果她刚才的回答里提到了具体的问题、异常、或值得关注的事（比如顾客投诉、员工请假、供应商延迟、设备故障、营业额异常等），追问一个具体细节（什么时候、多严重、是不是常发生），但每次只问一个问题，问题要短。
2. 如果她说"一切正常"或者信息已经足够清楚，不需要再问，直接结束。
3. ${forceFinish ? '这是最后一轮，无论如何都必须结束（action=done），不能再问问题。' : '最多再问1个问题就必须结束。'}
只输出严格的 JSON，不要有任何其他文字、不要markdown代码块标记：
{"action":"ask","question":"..."} 或者
{"action":"done","summary":{"category":"顾客|员工|供应|设备|财务|其他","issue_summary":"一句话概括核心内容","severity":"低|中|高","recurring_guess":true或false,"raw_notes":"把老板说的内容整合成完整的一段话"}}`;

  const historyText = conv.map((m) => (m.role === 'assistant' ? '助手: ' : '老板: ') + m.text).join('\n');

  let result;
  try {
    result = await callClaude(sys, historyText);
  } catch (e) {
    result = null;
  }

  if (result && result.action === 'ask' && !forceFinish) {
    return Response.json({ action: 'ask', question: result.question });
  }

  const userTexts = conv.filter((m) => m.role === 'user').map((m) => m.text);
  const fallbackSummary = {
    category: '其他',
    issue_summary: userTexts.join(' / '),
    severity: '低',
    recurring_guess: false,
    raw_notes: userTexts.join(' '),
  };
  const summary = (result && result.summary) || fallbackSummary;

  const entry = {
    id: Date.now().toString(),
    date: todayInShanghai(),
    category: summary.category || '其他',
    issue_summary: summary.issue_summary || '',
    severity: summary.severity || '低',
    recurring_guess: !!summary.recurring_guess,
    raw_notes: summary.raw_notes || userTexts.join(' '),
  };

  await redis.lpush('entries', JSON.stringify(entry));

  return Response.json({ action: 'done', entry });
}
