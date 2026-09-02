import { redis } from '../../../lib/redis';

export async function GET(req) {
  const { searchParams } = new URL(req.url);
  const key = searchParams.get('key');

  if (!key || key !== process.env.ACCESS_KEY) {
    return Response.json({ error: 'unauthorized' }, { status: 401 });
  }

  const raw = await redis.lrange('interview_sessions', 0, -1);
  const sessions = (raw || [])
    .map((r) => (typeof r === 'string' ? JSON.parse(r) : r))
    .reverse();

  return Response.json({ sessions });
}

export async function DELETE(req) {
  const body = await req.json();
  const { key, id } = body || {};

  if (!key || key !== process.env.ACCESS_KEY) {
    return Response.json({ error: 'unauthorized' }, { status: 401 });
  }
  if (!id) return Response.json({ error: 'bad_request' }, { status: 400 });

  const raw = await redis.lrange('interview_sessions', 0, -1);
  const list = (raw || []).map((r) => (typeof r === 'string' ? JSON.parse(r) : r));
  const index = list.findIndex((s) => s.id === id);
  if (index === -1) return Response.json({ error: 'not_found' }, { status: 404 });

  const target = list[index];
  await redis.lrem('interview_sessions', 1, raw[index]);

  // If that was the module's last remaining session, put the module back to pending.
  const remaining = list.filter((s) => s.id !== id && s.module_id === target.module_id);
  const stateRaw = await redis.get('interview_modules');
  const state = stateRaw ? (typeof stateRaw === 'string' ? JSON.parse(stateRaw) : stateRaw) : {};
  if (remaining.length === 0) {
    delete state[target.module_id];
  } else {
    const latest = remaining.reduce((a, b) => (a.date > b.date ? a : b));
    state[target.module_id] = { status: 'done', last_session_date: latest.date };
  }
  await redis.set('interview_modules', JSON.stringify(state));

  return Response.json({ ok: true });
}
