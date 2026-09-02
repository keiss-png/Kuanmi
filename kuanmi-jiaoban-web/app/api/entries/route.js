import { redis } from '../../../lib/redis';

export async function GET(req) {
  const { searchParams } = new URL(req.url);
  const key = searchParams.get('key');

  if (!key || key !== process.env.ACCESS_KEY) {
    return Response.json({ error: 'unauthorized' }, { status: 401 });
  }

  const raw = await redis.lrange('entries', 0, -1);
  const entries = (raw || [])
    .map((r) => (typeof r === 'string' ? JSON.parse(r) : r))
    .reverse();

  return Response.json({ entries });
}

export async function DELETE(req) {
  const body = await req.json();
  const { key, id } = body || {};

  if (!key || key !== process.env.ACCESS_KEY) {
    return Response.json({ error: 'unauthorized' }, { status: 401 });
  }
  if (!id) return Response.json({ error: 'bad_request' }, { status: 400 });

  const raw = await redis.lrange('entries', 0, -1);
  const rawEntry = (raw || []).find((r) => {
    const e = typeof r === 'string' ? JSON.parse(r) : r;
    return e.id === id;
  });
  if (!rawEntry) return Response.json({ error: 'not_found' }, { status: 404 });

  await redis.lrem('entries', 1, rawEntry);
  return Response.json({ ok: true });
}

export async function PATCH(req) {
  const body = await req.json();
  const { key, id, updates } = body || {};

  if (!key || key !== process.env.ACCESS_KEY) {
    return Response.json({ error: 'unauthorized' }, { status: 401 });
  }
  if (!id || !updates) return Response.json({ error: 'bad_request' }, { status: 400 });

  const raw = await redis.lrange('entries', 0, -1);
  const index = (raw || []).findIndex((r) => {
    const e = typeof r === 'string' ? JSON.parse(r) : r;
    return e.id === id;
  });
  if (index === -1) return Response.json({ error: 'not_found' }, { status: 404 });

  const entry = typeof raw[index] === 'string' ? JSON.parse(raw[index]) : raw[index];
  const updated = {
    ...entry,
    category: updates.category ?? entry.category,
    issue_summary: updates.issue_summary ?? entry.issue_summary,
    raw_notes: updates.raw_notes ?? entry.raw_notes,
    severity: updates.severity ?? entry.severity,
  };

  await redis.lset('entries', index, JSON.stringify(updated));
  return Response.json({ entry: updated });
}
