/**
 * Telegram relay for the Ekaterina Sosnovaya presenter site.
 *
 * Mirrors the contract of the PlanoLand2 worker
 * (https://mscw-bureau-bot.sinisapre.workers.dev) so both projects share one
 * pattern — the client POSTs a small JSON payload and the bot token + chat ID
 * stay server-side, never in the browser.
 *
 *   POST <worker-url>
 *   Content-Type: application/json
 *   body: { name: string, message: string, projectType: string }
 *   → 200 { success: true }
 *   → 4xx/5xx { error: string }
 */

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function json(data, status) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', ...CORS },
  });
}

function esc(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

export default {
  async fetch(request, env) {
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: CORS });
    }
    if (request.method !== 'POST') {
      return json({ error: 'Method not allowed' }, 405);
    }

    let body;
    try {
      body = await request.json();
    } catch {
      return json({ error: 'Invalid JSON body' }, 400);
    }
    body = body || {};

    // Honeypot — a filled field means a bot. Answer as if it worked.
    if (body.company) return json({ success: true });

    const name = String(body.name || '').trim().slice(0, 100);
    const message = String(body.message || '').trim().slice(0, 2000);
    const projectType = String(body.projectType || 'contact').trim().slice(0, 60);

    if (name.length < 2) {
      return json({ error: 'name is required' }, 400);
    }
    // Trim the secrets: a stray newline from a CLI pipe would otherwise turn
    // into a Telegram 404 ("Not Found") instead of a clear error.
    const botToken = String(env.TELEGRAM_BOT_TOKEN || '').trim();
    const chatId = String(env.TELEGRAM_CHAT_ID || '').trim();
    if (!botToken || !chatId) {
      return json({ error: 'telegram_not_configured' }, 503);
    }

    const lines = [`<b>👤 ${esc(name)}</b>`, ''];
    if (message) lines.push(esc(message));
    if (projectType) lines.push('', `<i>источник: ${esc(projectType)}</i>`);

    try {
      const res = await fetch(
        `https://api.telegram.org/bot${botToken}/sendMessage`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            chat_id: chatId,
            text: lines.join('\n'),
            parse_mode: 'HTML',
            disable_web_page_preview: true,
          }),
        },
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.ok) {
        const detail = data?.description || `HTTP ${res.status}`;
        return json({ error: detail }, 502);
      }
      return json({ success: true });
    } catch (err) {
      return json({ error: err?.message || 'telegram_unreachable' }, 502);
    }
  },
};
