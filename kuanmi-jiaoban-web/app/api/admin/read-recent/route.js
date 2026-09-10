import { redis } from '../../../../lib/redis';
import { todayInShanghai } from '../../../../lib/claude';

function parseRedisValue(value) {
  return typeof value === 'string' ? JSON.parse(value) : value;
}

async function loadTranscript(entryId) {
  const raw = await redis.get(`entry_transcript:${entryId}`);
  return raw ? parseRedisValue(raw) : null;
}

export async function GET(req) {
  const token = req.headers.get('x-read-token');
  if (!process.env.TEMP_READ_TOKEN || token !== process.env.TEMP_READ_TOKEN) {
    return Response.json({ error: 'unauthorized' }, { status: 401 });
  }

  const today = todayInShanghai();
  const raw = await redis.lrange('entries', 0, 30);
  const entries = (raw || []).map(parseRedisValue);
  const selected = entries.filter((e) => e.date === today).length
    ? entries.filter((e) => e.date === today)
    : entries.slice(0, 10);

  const entriesWithTranscripts = await Promise.all(
    selected.map(async (entry) => ({
      entry,
      transcript: await loadTranscript(entry.id),
    }))
  );

  return Response.json({
    today,
    returned_today_only: selected.every((e) => e.date === today),
    entries: entriesWithTranscripts,
  });
}
