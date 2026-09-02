import { redis } from '../../../lib/redis';
import { callClaude } from '../../../lib/claude';

export async function GET(req) {
  const { searchParams } = new URL(req.url);
  const key = searchParams.get('key');

  if (!key || key !== process.env.ACCESS_KEY) {
    return Response.json({ error: 'unauthorized' }, { status: 401 });
  }

  const raw = await redis.get('analysis');
  const analysis = raw ? (typeof raw === 'string' ? JSON.parse(raw) : raw) : null;

  return Response.json({ analysis });
}

export async function POST(req) {
  const body = await req.json();
  const { key } = body || {};

  if (!key || key !== process.env.ACCESS_KEY) {
    return Response.json({ error: 'unauthorized' }, { status: 401 });
  }

  const raw = await redis.lrange('entries', 0, -1);
  const entries = (raw || [])
    .map((r) => (typeof r === 'string' ? JSON.parse(r) : r))
    .reverse();

  if (entries.length < 2) {
    return Response.json({ error: 'not_enough_entries' }, { status: 400 });
  }

  const sys = `你是一个帮助连锁餐厅管理者从多天的口头交班记录中提炼"可落地SOP"的分析助手。
输入是若干条记录，每条包含日期、类别、一句话概括、严重程度、详细备注。
你的任务：
1. 找出主题相近、重复出现2次及以上的问题（比如"顾客抱怨上菜慢"出现了3次，即使措辞不同也算同一主题），把它们归为一个 pattern。
2. 给每个 pattern 起草一份简短、可执行的 SOP 步骤（3-5步，具体到"谁在什么情况下做什么"）。
3. 只出现1次、看起来是偶发的事项，放进 singles，不需要写SOP。
4. patterns 按出现次数从高到低排序。
只输出严格的 JSON，不要有其他文字或markdown代码块标记：
{"patterns":[{"theme":"问题主题","count":数字,"dates":["日期",...],"sop_title":"SOP标题","sop_steps":["步骤1","步骤2",...]}],"singles":[{"date":"日期","note":"一句话"}]}`;

  const compact = entries
    .map((e) => `[${e.date}] ${e.category} | ${e.issue_summary} | 严重度:${e.severity} | 详情:${e.raw_notes}`)
    .join('\n');

  const result = await callClaude(sys, compact);

  const analysis = {
    analyzed_at: new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' }),
    patterns: result.patterns || [],
    singles: result.singles || [],
  };

  await redis.set('analysis', JSON.stringify(analysis));

  return Response.json({ analysis });
}
