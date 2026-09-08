import { redis } from '../../../lib/redis';

export async function GET(req) {
  const { searchParams } = new URL(req.url);
  const key = searchParams.get('key');
  const id = searchParams.get('id');

  if (!key || key !== process.env.ACCESS_KEY) {
    return Response.json({ error: 'unauthorized' }, { status: 401 });
  }
  if (!id) {
    return Response.json({ error: 'bad_request' }, { status: 400 });
  }

  const raw = await redis.get(`entry_transcript:${id}`);
  if (!raw) {
    return Response.json({ error: 'expired_or_not_found' }, { status: 404 });
  }

  const transcript = typeof raw === 'string' ? JSON.parse(raw) : raw;
  return Response.json({ transcript });
}
