function stripJsonFence(text) {
  return text.trim().replace(/^```json/, '').replace(/^```/, '').replace(/```$/, '').trim();
}

async function callAnthropicOnce(system, userContent) {
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new Error('ANTHROPIC_API_KEY is not set');
  }

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': process.env.ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: process.env.ANTHROPIC_MODEL || 'claude-sonnet-5',
      max_tokens: 1000,
      system,
      messages: [{ role: 'user', content: userContent }],
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error('Anthropic API error: ' + text);
  }

  const data = await res.json();
  const textBlock = (data.content || []).find((c) => c.type === 'text');
  if (!textBlock) throw new Error('Anthropic 返回内容里没有文本块');
  return JSON.parse(stripJsonFence(textBlock.text));
}

async function callOpenAIOnce(system, userContent) {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error('OPENAI_API_KEY is not set');
  }

  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
    },
    body: JSON.stringify({
      model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: userContent },
      ],
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error('OpenAI API error: ' + text);
  }

  const data = await res.json();
  const text = data.choices?.[0]?.message?.content;
  if (!text) throw new Error('OpenAI 返回内容里没有文本');
  return JSON.parse(stripJsonFence(text));
}

async function tryProvider(name, fn, attempts) {
  let lastError;
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      return await fn();
    } catch (e) {
      lastError = e;
      console.error(`${name} attempt ${attempt}/${attempts} failed:`, e.message);
    }
  }
  throw lastError;
}

export async function callAI(system, userContent, maxAttempts = 2) {
  const providers = [
    ['Anthropic', () => callAnthropicOnce(system, userContent), !!process.env.ANTHROPIC_API_KEY],
    ['OpenAI', () => callOpenAIOnce(system, userContent), !!process.env.OPENAI_API_KEY],
  ].filter(([, , enabled]) => enabled);

  if (providers.length === 0) {
    throw new Error('No AI provider configured. Set ANTHROPIC_API_KEY or OPENAI_API_KEY.');
  }

  let lastError;
  for (const [name, fn] of providers) {
    try {
      return await tryProvider(name, fn, maxAttempts);
    } catch (e) {
      lastError = e;
      console.error(`${name} failed; trying next provider if configured:`, e.message);
    }
  }
  throw lastError;
}

// Backward compatible name used by existing routes.
export const callClaude = callAI;

export function todayInShanghai() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Shanghai' }).format(new Date());
}

// 'YYYY-MM-DD' 格式的两个日期相差几天（b - a）
export function daysBetween(dateA, dateB) {
  const a = new Date(dateA + 'T00:00:00+08:00');
  const b = new Date(dateB + 'T00:00:00+08:00');
  return Math.round((b - a) / 86400000);
}
