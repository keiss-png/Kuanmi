import { redis } from '../../../lib/redis';
import { callClaude, todayInShanghai, daysBetween } from '../../../lib/claude';

const MAX_TURNS = 7;
const FOLLOW_UP_WINDOW_DAYS = 3; // 一件事几天内没标记"已解决"，还值得每天追问一下
const DEFAULT_OPENER = '今天店里有什么想说的？顾客、员工、进货、设备、账目，随便说说，没有也可以说"一切正常"。';
const SEVERITY_RANK = { 高: 3, 中: 2, 低: 1 };

async function loadEntries() {
  const raw = await redis.lrange('entries', 0, -1);
  return (raw || []).map((r) => (typeof r === 'string' ? JSON.parse(r) : r));
}

function pickFollowUpCandidate(entries, today) {
  const candidates = entries.filter((e) => {
    if (!e.issue_summary || e.issue_summary === '一切正常') return false;
    if (e.date === today) return false;
    if (e.resolved) return false;
    const diff = daysBetween(e.date, today);
    return diff >= 1 && diff <= FOLLOW_UP_WINDOW_DAYS;
  });

  candidates.sort((a, b) => {
    const rankDiff = (SEVERITY_RANK[b.severity] || 0) - (SEVERITY_RANK[a.severity] || 0);
    if (rankDiff !== 0) return rankDiff;
    if (!!a.recurring_guess !== !!b.recurring_guess) return b.recurring_guess ? 1 : -1;
    return b.date.localeCompare(a.date);
  });

  return candidates[0] || null;
}

async function markEntryResolved(id) {
  const raw = await redis.lrange('entries', 0, -1);
  const index = (raw || []).findIndex((r) => {
    const e = typeof r === 'string' ? JSON.parse(r) : r;
    return e.id === id;
  });
  if (index === -1) return;
  const entry = typeof raw[index] === 'string' ? JSON.parse(raw[index]) : raw[index];
  await redis.lset('entries', index, JSON.stringify({ ...entry, resolved: true }));
}

export async function GET(req) {
  const { searchParams } = new URL(req.url);
  const key = searchParams.get('key');

  if (!key || key !== process.env.ACCESS_KEY) {
    return Response.json({ error: 'unauthorized' }, { status: 401 });
  }

  const today = todayInShanghai();
  const entries = await loadEntries();
  const candidate = pickFollowUpCandidate(entries, today);

  if (!candidate) {
    return Response.json({ opener: DEFAULT_OPENER, followUpEntryId: null });
  }

  const diff = daysBetween(candidate.date, today);
  const label = diff === 1 ? '昨天' : `${diff}天前`;
  const opener = `先接着上次说的聊两句——${label}你提到"${candidate.issue_summary}"，现在怎么样了、解决了吗？`;

  return Response.json({ opener, followUpEntryId: candidate.id });
}

export async function POST(req) {
  const body = await req.json();
  const { key, conv, turnCount, followUpEntryId } = body || {};

  if (!key || key !== process.env.ACCESS_KEY) {
    return Response.json({ error: 'unauthorized' }, { status: 401 });
  }
  if (!Array.isArray(conv) || conv.length === 0) {
    return Response.json({ error: 'bad_request' }, { status: 400 });
  }

  const forceFinish = (turnCount || 0) >= MAX_TURNS;

  const sys = `你是一个帮中餐馆老板做"每日交班记录"的助手。说话自然、口语化、简短，语气像一个有经验、有耐心的心理咨询师在跟她聊今天过得怎么样，而不是在做审讯或走流程——你的目标是帮她把脑子里那些没有主动想起来说的细节，一点点引导着回忆出来。老板是一位不太习惯写长文字的中年女性餐厅经营者。

${followUpEntryId ? '这次对话一开始是在追问她之前提到过、可能还没解决的一件事。先把这件事现在的进展/是否解决问清楚（用规则2的方式深挖细节），问完之后再自然过渡到问问"今天"店里还有没有别的情况（用规则1的方式），不要问完旧事就直接结束。' : ''}

你的任务：
1. 不要因为她说"一切正常"或者回答很简单笼统，就当作没什么可问的了。这种笼统回答往往只是她还没细想，不代表真的什么都没发生。你要顺着具体场景轻轻引导她回忆——比如问问今天顾客多不多、有没有哪桌客人说了什么、员工今天状态怎么样、进货顺不顺、有没有什么东西不太够用、账目对没对上、设备有没有小毛病——一次只问一个方向，语气自然像在关心她今天过得怎么样，不要一次抛好几个问题，也不要让她觉得是在被盘问。
2. 如果她提到了具体的问题、异常、或值得关注的事（比如顾客投诉、员工请假、供应商延迟、设备故障、营业额异常等），要顺着往细节里问：什么时候、涉及谁、具体情况、严重程度、当时怎么处理的、是不是经常发生。
3. 只有当你已经从不同方向问过至少两三轮，而且她的回答都显示确实没什么可说的（比如明确说"真没有""就这样""没别的了"），才可以结束。不要为了走流程无限问下去，但也不能她一句"一切正常"就轻易放过。
4. 每次只问一个具体、简短的问题。
5. ${forceFinish ? '这是最后一轮，无论如何都必须结束（action=done），不能再问问题。' : '如果不同方向都已经问过、她也确实没什么可补充的了，就该结束；否则换一个方向继续轻轻问。'}
只输出严格的 JSON，不要有任何其他文字、不要markdown代码块标记：
{"action":"ask","question":"..."} 或者
{"action":"done","summary":{"category":"顾客|员工|供应|设备|财务|其他","issue_summary":"一句话概括核心内容，如果确实一切正常就写'一切正常'","severity":"低|中|高","recurring_guess":true或false,"resolved":${followUpEntryId ? 'true或false，判断这次追问的旧问题现在是不是已经解决了' : 'null，这次不是在追问旧问题'},"raw_notes":"把老板说的内容整合成完整、具体的一段话，尽量包含时间、涉及对象、经过、处理方式等细节"}}`;

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
    resolved: null,
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

  if (followUpEntryId && summary.resolved === true) {
    await markEntryResolved(followUpEntryId);
  }

  return Response.json({ action: 'done', entry });
}
