// Vercel Serverless Function: POST /api/shorten  { "url": "...", "title": "opsional", "price": 5000 (opsional) }
// Membuat short link Move2link lewat REST API resmi (API token tidak terlihat di browser).
// Env di Vercel:
//   MOVE2LINK_API_TOKEN  (wajib)  token dari dashboard Move2link > Tools > REST API
//   MOVE2LINK_PRICE      (opsional) harga paywall rupiah; kosong = pakai Default Paywall Price di Settings, 0 = link biasa
//   UPLOAD_ADMIN_KEY     (sudah ada) password admin yang sama dengan upload
const crypto = require('crypto');

function safeEqual(a, b) {
  const A = Buffer.from(String(a || ''));
  const B = Buffer.from(String(b || ''));
  return A.length === B.length && crypto.timingSafeEqual(A, B);
}

module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'Method not allowed' });
  if (!safeEqual(req.headers['x-admin-key'], process.env.UPLOAD_ADMIN_KEY)) {
    return res.status(401).json({ ok: false, error: 'Password upload salah' });
  }
  const token = process.env.MOVE2LINK_API_TOKEN;
  if (!token) return res.status(500).json({ ok: false, error: 'MOVE2LINK_API_TOKEN belum diisi di Vercel' });

  let body = {};
  try { body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {}); } catch (e) {}
  const longUrl = String(body.url || '').trim();
  if (!/^https?:\/\/[^\s]+$/i.test(longUrl)) return res.status(400).json({ ok: false, error: 'url tidak valid' });

  const payload = { url: longUrl };
  const title = String(body.title || '').trim().slice(0, 255);
  if (title) payload.title = title;
  const priceRaw = body.price !== undefined && body.price !== '' ? body.price : process.env.MOVE2LINK_PRICE;
  if (priceRaw !== undefined && priceRaw !== '' && !Number.isNaN(Number(priceRaw))) payload.price = Number(priceRaw);

  try {
    const r = await fetch('https://api.move2link.com/api/v1/links', {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(payload)
    });
    const raw = await r.text();
    let j = null;
    try { j = JSON.parse(raw); } catch (e) {}

    if (r.status === 429) return res.status(429).json({ ok: false, error: 'Move2link: terlalu banyak request, coba lagi sebentar' });
    if (r.status === 401) return res.status(502).json({ ok: false, error: 'Move2link: API token salah' });
    if (r.status === 403) return res.status(502).json({ ok: false, error: "Move2link: REST API nonaktif, aktifkan 'Shortlink without login' di Settings" });

    const short = j && j.data && j.data.short_link;
    if (!r.ok || !short) {
      const msg = (j && j.status && j.status.message) || raw.slice(0, 120) || ('HTTP ' + r.status);
      return res.status(502).json({ ok: false, error: 'Move2link: ' + msg });
    }
    return res.status(200).json({ ok: true, shortUrl: short });
  } catch (e) {
    return res.status(502).json({ ok: false, error: 'Gagal menghubungi Move2link: ' + e.message });
  }
};
