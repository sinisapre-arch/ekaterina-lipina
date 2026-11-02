/**
 * POST /api/contact — same-origin fallback for the enquiry form.
 *
 * Identical contract to the Cloudflare worker (worker/src/index.js), so the
 * client code is the same for both:
 *   body: { name, message, projectType }
 *   → 200 { success: true }
 *   → 4xx/5xx { error }
 *
 * The bot token + chat ID live in the Vercel environment
 * (TELEGRAM_BOT_TOKEN / TELEGRAM_CHAT_ID), never in the browser.
 */
const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

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
  Object.entries(CORS).forEach(([k, v]) => res.setHeader(k, v));

  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;

  let body = req.body;
  if (typeof body === 'string') {
    try { body = JSON.parse(body); } catch (e) { body = {}; }
  }
  body = body || {};

  // Honeypot — a filled field means a bot. Answer as if it worked.
  if (body.company) return res.status(200).json({ success: true });

  const name = String(body.name || '').trim().slice(0, 100);
  const message = String(body.message || '').trim().slice(0, 2000);
  const projectType = String(body.projectType || 'contact').trim().slice(0, 60);

  if (name.length < 2) {
    return res.status(400).json({ error: 'name is required' });
  }

  const ip =
    (req.headers['x-forwarded-for'] || '').toString().split(',')[0].trim() ||
    req.socket?.remoteAddress ||
    'unknown';
  if (rateLimited(ip)) {
    return res.status(429).json({ error: 'too_many_requests' });
  }

  if (!token || !chatId) {
    return res.status(503).json({ error: 'telegram_not_configured' });
  }

  const lines = [`<b>👤 ${esc(name)}</b>`, ''];
  if (message) lines.push(esc(message));
  if (projectType) lines.push('', `<i>источник: ${esc(projectType)}</i>`);

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
      return res.status(502).json({ error: data?.description || `HTTP ${r.status}` });
    }
    return res.status(200).json({ success: true });
  } catch (e) {
    return res.status(502).json({ error: e?.message || 'telegram_unreachable' });
  }
};
