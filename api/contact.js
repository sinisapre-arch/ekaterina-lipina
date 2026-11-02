/**
 * POST /api/contact  —  booking enquiry -> Telegram.
 *
 * The bot token never reaches the browser: it lives in the server-side
 * environment (TELEGRAM_BOT_TOKEN / TELEGRAM_CHAT_ID on Vercel).
 *
 * Body: { name, phone, email?, callback?: boolean }
 */
const RATE_WINDOW_MS = 60 * 1000;
const RATE_MAX = 5;
const hits = new Map();

function rateLimited(ip) {
  const now = Date.now();
  const list = (hits.get(ip) || []).filter((t) => now - t < RATE_WINDOW_MS);
  if (list.length >= RATE_MAX) {
    hits.set(ip, list);
    return true;
  }
  list.push(now);
  hits.set(ip, list);
  if (hits.size > 5000) hits.clear();
  return false;
}

function esc(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

module.exports = async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');

  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ ok: false, error: 'method_not_allowed' });
  }

  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;
  if (!token || !chatId) {
    return res.status(503).json({ ok: false, error: 'telegram_not_configured' });
  }

  const ip =
    (req.headers['x-forwarded-for'] || '').toString().split(',')[0].trim() ||
    req.socket?.remoteAddress ||
    'unknown';
  if (rateLimited(ip)) {
    return res.status(429).json({ ok: false, error: 'too_many_requests' });
  }

  let body = req.body;
  if (typeof body === 'string') {
    try { body = JSON.parse(body); } catch (e) { body = {}; }
  }
  body = body || {};

  // honeypot — a filled field means a bot; answer as if it worked
  if (body.company) return res.status(200).json({ ok: true });

  const name = String(body.name || '').trim().slice(0, 120);
  const phone = String(body.phone || '').trim().slice(0, 60);
  const email = String(body.email || '').trim().slice(0, 120);
  const callback = !!body.callback;

  if (name.length < 2 || phone.length < 5) {
    return res.status(400).json({ ok: false, error: 'name_and_phone_required' });
  }

  const lines = [
    '<b>Новая заявка с сайта</b>',
    '',
    `<b>ФИО:</b> ${esc(name)}`,
    `<b>Телефон:</b> ${esc(phone)}`,
  ];
  if (email) lines.push(`<b>Email:</b> ${esc(email)}`);
  lines.push('', callback ? 'Запрошен <b>обратный звонок</b>.' : 'Ответ по почте.');

  try {
    const r = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text: lines.join('\n'),
        parse_mode: 'HTML',
        disable_web_page_preview: true,
      }),
    });
    const data = await r.json().catch(() => ({}));
    if (!r.ok || !data.ok) {
      return res.status(502).json({ ok: false, error: 'telegram_rejected' });
    }
    return res.status(200).json({ ok: true });
  } catch (e) {
    return res.status(502).json({ ok: false, error: 'telegram_unreachable' });
  }
};
