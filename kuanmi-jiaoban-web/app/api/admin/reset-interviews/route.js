import { redis } from '../../../../lib/redis';

const RESET_TOKEN = '592e70926b70a80eafcf1224ab685613ebc3886865266e71';
const INTERVIEW_KEYS = ['interview_modules', 'interview_sessions', 'interview_analysis'];

export async function POST(req) {
  const token = req.headers.get('x-reset-token');
  if (token !== RESET_TOKEN) {
    return Response.json({ error: 'unauthorized' }, { status: 401 });
  }

  const deleted = await redis.del(...INTERVIEW_KEYS);
  return Response.json({ ok: true, deleted, keys: INTERVIEW_KEYS });
}
