import crypto from 'crypto';

export async function GET(req) {
  const auth = req.headers.get('authorization');
  if (process.env.CRON_SECRET && auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return Response.json({ error: 'unauthorized' }, { status: 401 });
  }

  const link = `${process.env.APP_URL}/?key=${encodeURIComponent(process.env.ACCESS_KEY)}`;

  const payload = { msg_type: 'text', content: { text: `该记今天的交班啦，点开说两句 👉 ${link}` } };

  if (process.env.FEISHU_SECRET) {
    const timestamp = Math.floor(Date.now() / 1000).toString();
    const stringToSign = `${timestamp}\n${process.env.FEISHU_SECRET}`;
    const sign = crypto.createHmac('sha256', stringToSign).update('').digest('base64');
    payload.timestamp = timestamp;
    payload.sign = sign;
  }

  const res = await fetch(process.env.FEISHU_WEBHOOK_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload),
  });

  const data = await res.json().catch(() => ({}));

  return Response.json({ ok: res.ok, feishu: data });
}
