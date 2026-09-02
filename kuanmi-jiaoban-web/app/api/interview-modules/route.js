import { redis } from '../../../lib/redis';
import { SEED_MODULES } from '../../../lib/interviewModules';

async function loadState() {
  const raw = await redis.get('interview_modules');
  return raw ? (typeof raw === 'string' ? JSON.parse(raw) : raw) : {};
}

function mergeModules(state) {
  return SEED_MODULES.map((m) => {
    const s = state[m.id] || {};
    return {
      id: m.id,
      name: m.name,
      status: s.status || 'pending',
      last_session_date: s.last_session_date || null,
      groups: m.groups,
    };
  });
}

export async function GET(req) {
  const { searchParams } = new URL(req.url);
  const key = searchParams.get('key');

  if (!key || key !== process.env.ACCESS_KEY) {
    return Response.json({ error: 'unauthorized' }, { status: 401 });
  }

  const state = await loadState();
  return Response.json({ modules: mergeModules(state) });
}

export async function POST(req) {
  const body = await req.json();
  const { key } = body || {};

  if (!key || key !== process.env.ACCESS_KEY) {
    return Response.json({ error: 'unauthorized' }, { status: 401 });
  }

  const state = await loadState();
  const next = SEED_MODULES.find((m) => !state[m.id] || !state[m.id].status || state[m.id].status === 'pending');

  if (!next) {
    return Response.json({ error: 'no_pending_module' }, { status: 400 });
  }

  state[next.id] = {
    status: 'in_progress',
    last_session_date: (state[next.id] && state[next.id].last_session_date) || null,
  };
  await redis.set('interview_modules', JSON.stringify(state));

  return Response.json({ module: { id: next.id, name: next.name, status: 'in_progress' } });
}
