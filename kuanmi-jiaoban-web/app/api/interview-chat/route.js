import { redis } from '../../../lib/redis';
import { callClaude, todayInShanghai } from '../../../lib/claude';
import { SEED_MODULES } from '../../../lib/interviewModules';

const MAX_GROUP_TURNS = 4; // 同一个子维度里最多问几轮就必须换维度
const MAX_TOTAL_TURNS = 20; // 整场访谈的硬上限，防止跑飞

async function loadModuleState() {
  const raw = await redis.get('interview_modules');
  return raw ? (typeof raw === 'string' ? JSON.parse(raw) : raw) : {};
}

function buildQaPairs(conv) {
  const pairs = [];
  for (let i = 0; i < conv.length; i++) {
    if (conv[i].role === 'assistant' && conv[i + 1] && conv[i + 1].role === 'user') {
      pairs.push({ question: conv[i].text, answer: conv[i + 1].text });
    }
  }
  return pairs;
}

export async function POST(req) {
  const body = await req.json();
  const { key, module_id, conv, turnCount, groupIndex, groupTurnCount, earlyExit } = body || {};

  if (!key || key !== process.env.ACCESS_KEY) {
    return Response.json({ error: 'unauthorized' }, { status: 401 });
  }

  const mod = SEED_MODULES.find((m) => m.id === module_id);
  if (!mod || !Array.isArray(conv) || conv.length === 0) {
    return Response.json({ error: 'bad_request' }, { status: 400 });
  }

  async function finishSession(summaryText) {
    const state = await loadModuleState();
    const date = todayInShanghai();
    const session = {
      id: Date.now().toString(),
      module_id: mod.id,
      module_name: mod.name,
      date,
      qa_pairs: buildQaPairs(conv),
      raw_summary: summaryText || '',
      follow_up_count: turnCount || 0,
    };
    await redis.lpush('interview_sessions', JSON.stringify(session));
    state[mod.id] = { status: 'done', last_session_date: date };
    await redis.set('interview_modules', JSON.stringify(state));
    return session;
  }

  if (earlyExit) {
    const userTexts = conv.filter((m) => m.role === 'user').map((m) => m.text);
    const session = await finishSession(userTexts.join(' '));
    return Response.json({ action: 'done', session });
  }

  const gIndex = Math.min(groupIndex || 0, mod.groups.length - 1);
  const currentGroup = mod.groups[gIndex];
  const isLastGroup = gIndex >= mod.groups.length - 1;
  const forceNext = (groupTurnCount || 0) >= MAX_GROUP_TURNS;
  const forceFinish = (turnCount || 0) >= MAX_TOTAL_TURNS;

  const sys = `你是一个帮中餐馆老板梳理"${mod.name}"这个环节运营流程的访谈助手，语气自然、口语化、简短。老板是一位不太习惯写长文字的中年女性餐厅经营者。
当前聊的方向是"${currentGroup.group || mod.name}"，想了解的内容大概包括：
${currentGroup.questions.map((q) => '- ' + q).join('\n')}

你的任务：
1. 结合她已经说的内容，判断这个方向是不是已经聊得差不多了（不用把上面每条都问一遍，抓到关键信息就够了，通常2-4个来回）。
2. 如果还没问透，追问一个具体问题（可以从上面挑一条，也可以顺着她刚才的回答自然往下问），每次只问一个，问题要短。
3. 如果这个方向已经聊得差不多，${isLastGroup ? '而且这是最后一个方向了，就直接结束整场访谈（action=done），并且用一段话总结一下她在这个环节说的内容（summary字段）。' : '就结束这个方向，进入下一个方向（action=next_group）。'}
${forceNext && !isLastGroup ? '4. 这个方向已经聊了不少轮了，不管有没有问透，这次都必须结束这个方向、进入下一个（action=next_group）。' : ''}
${forceFinish ? '5. 整场已经聊了很多轮了，不管当前方向问没问完，这次都必须直接结束整场访谈（action=done），并总结（summary字段）。' : ''}
只输出严格的 JSON，不要有任何其他文字、不要markdown代码块标记：
{"action":"ask","question":"..."} 或
{"action":"next_group"} 或
{"action":"done","summary":"用一段话概括老板在这个环节说的内容"}`;

  const historyText = conv.map((m) => (m.role === 'assistant' ? '助手: ' : '老板: ') + m.text).join('\n');

  let result;
  try {
    result = await callClaude(sys, historyText);
  } catch (e) {
    console.error('interview-chat route: callClaude failed, falling back:', e.message);
    result = null;
  }

  let action = result && result.action;
  if (forceFinish) {
    action = 'done';
  } else if (!action) {
    action = isLastGroup ? 'done' : 'next_group';
  } else if (forceNext && action === 'ask' && !isLastGroup) {
    action = 'next_group';
  }

  if (action === 'ask' && result && result.question) {
    return Response.json({ action: 'ask', question: result.question });
  }

  if (action === 'next_group' && !isLastGroup) {
    const nextIndex = gIndex + 1;
    const nextGroup = mod.groups[nextIndex];
    return Response.json({
      action: 'next_group',
      groupIndex: nextIndex,
      group: nextGroup.group,
      question: nextGroup.questions[0],
    });
  }

  const userTexts = conv.filter((m) => m.role === 'user').map((m) => m.text);
  const summaryText = (result && result.summary) || userTexts.join(' ');
  const session = await finishSession(summaryText);
  return Response.json({ action: 'done', session });
}
