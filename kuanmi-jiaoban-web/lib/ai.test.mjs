import assert from 'node:assert/strict';
import { test } from 'node:test';

process.env.ANTHROPIC_API_KEY = 'anthropic-key';
process.env.OPENAI_API_KEY = 'openai-key';

const { callAI } = await import('./ai.js');

test('callAI falls back to OpenAI when Anthropic fails', async () => {
  const calls = [];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url, opts) => {
    calls.push({ url: String(url), body: JSON.parse(opts.body), headers: opts.headers });
    if (String(url).includes('anthropic.com')) {
      return new Response(JSON.stringify({ error: { message: 'account disabled' } }), { status: 403 });
    }
    return new Response(JSON.stringify({ choices: [{ message: { content: '{"action":"ask","question":"今天客人怎么样？"}' } }] }), { status: 200 });
  };

  try {
    const result = await callAI('system prompt', 'user text');
    assert.deepEqual(result, { action: 'ask', question: '今天客人怎么样？' });
    assert.equal(calls.length, 3);
    assert.match(calls[0].url, /anthropic/);
    assert.match(calls[1].url, /anthropic/);
    assert.match(calls[2].url, /openai/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
