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
