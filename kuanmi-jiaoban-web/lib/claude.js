async function callClaudeOnce(system, userContent) {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': process.env.ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-5',
      max_tokens: 1000,
      system,
      messages: [{ role: 'user', content: userContent }],
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error('Claude API error: ' + text);
  }

  const data = await res.json();
  const textBlock = (data.content || []).find((c) => c.type === 'text');
  if (!textBlock) throw new Error('Claude 返回内容里没有文本块');

  let raw = textBlock.text.trim();
  raw = raw.replace(/^```json/, '').replace(/^```/, '').replace(/```$/, '').trim();
  return JSON.parse(raw);
}

// 网络抖动或者模型偶尔没按格式回复都可能导致单次调用失败，
// 重试一次再放弃，避免一次瞬时故障就把整段对话草草结束。
export async function callClaude(system, userContent, maxAttempts = 2) {
  let lastError;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await callClaudeOnce(system, userContent);
    } catch (e) {
      lastError = e;
      console.error(`callClaude attempt ${attempt}/${maxAttempts} failed:`, e.message);
    }
  }
  throw lastError;
}

export function todayInShanghai() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Shanghai' }).format(new Date());
}

// 'YYYY-MM-DD' 格式的两个日期相差几天（b - a）
export function daysBetween(dateA, dateB) {
  const a = new Date(dateA + 'T00:00:00+08:00');
  const b = new Date(dateB + 'T00:00:00+08:00');
  return Math.round((b - a) / 86400000);
}
