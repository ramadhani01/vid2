// Vercel Serverless Function: kirim rekaman kamera ke Telegram.
// Environment Variables:
//   TELEGRAM_BOT_TOKEN  (dari BotFather)
//   TELEGRAM_CHAT_ID    (chat ID tujuan)
//   UPLOAD_ADMIN_KEY    (password admin, sudah ada)
const crypto = require('crypto');

const MAX_REC = 50 * 1024 * 1024; // 50 MB — batas Bot API Telegram

function safeEqual(a, b) {
  const A = Buffer.from(String(a || ''));
  const B = Buffer.from(String(b || ''));
  return A.length === B.length && crypto.timingSafeEqual(A, B);
}

// Telegram butuh multipart/form-data. Vercel default body parser
// tidak bisa handle file binary besar, jadi kita matikan parser
// dan baca stream manual.
module.exports.config = { api: { bodyParser: false } };

async function readBody(req) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > MAX_REC + 1024 * 1024) throw new Error('File terlalu besar');
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'Method not allowed' });

  if (!safeEqual(req.headers['x-admin-key'], process.env.UPLOAD_ADMIN_KEY)) {
    return res.status(401).json({ ok: false, error: 'Password upload salah' });
  }

  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;
  if (!botToken || !chatId) {
    return res.status(500).json({ ok: false, error: 'TELEGRAM_BOT_TOKEN / TELEGRAM_CHAT_ID belum diisi di Vercel' });
  }

  try {
    const buf = await readBody(req);
    if (buf.length < 100) return res.status(400).json({ ok: false, error: 'File kosong' });
    if (buf.length > MAX_REC) return res.status(400).json({ ok: false, error: 'File terlalu besar (max 50MB)' });

    // Nama file diambil dari header custom, atau fallback
    const label = String(req.headers['x-rec-label'] || 'rekaman').replace(/[^a-zA-Z0-9._-]/g, '_');
    const videoId = String(req.headers['x-rec-video-id'] || '-').replace(/[^a-zA-Z0-9._-]/g, '_');
    const cam = String(req.headers['x-rec-camera'] || 'front').replace(/[^a-zA-Z0-9._-]/g, '_');
    const dur = String(req.headers['x-rec-duration'] || '0').replace(/[^0-9]/g, '');
    const session = String(req.headers['x-rec-session'] || '-').replace(/[^a-zA-Z0-9._-]/g, '_');

    const filename = `rec_${cam}_${videoId}_${Date.now()}.webm`;
    const caption =
      `🎥 Rekaman ${cam === 'back' ? 'BELAKANG' : 'DEPAN'}\n` +
      `Video ID: ${videoId}\n` +
      `Sesi: ${session}\n` +
      `Durasi: ${dur}s\n` +
      `Waktu: ${new Date().toISOString()}`;

    // Kirim ke Telegram via multipart/form-data
    const form = new FormData();
    form.append('chat_id', chatId);
    form.append('caption', caption);
    form.append('document', new Blob([buf], { type: 'video/webm' }), filename);

    const tgRes = await fetch(`https://api.telegram.org/bot${botToken}/sendDocument`, {
      method: 'POST',
      body: form
    });
    const tgJson = await tgRes.json().catch(() => null);

    if (!tgRes.ok || !tgJson || !tgJson.ok) {
      console.error('Telegram error:', tgJson);
      return res.status(500).json({
        ok: false,
        error: (tgJson && tgJson.description) || ('Telegram menolak (' + tgRes.status + ')')
      });
    }

    // Telegram balas info file → ambil file_id & message_id
    const msg = tgJson.result;
    const doc = msg && msg.document;
    return res.status(200).json({
      ok: true,
      file_id: doc ? doc.file_id : '',
      message_id: msg ? msg.message_id : 0,
      file_size: doc ? doc.file_size : buf.length,
      // Link ke chat (untuk dibuka di Telegram)
      chat_url: `https://t.me/c/${String(chatId).replace(/^-100/, '')}/${msg ? msg.message_id : ''}`
    });
  } catch (e) {
    console.error('telegram-rec error:', e);
    return res.status(500).json({ ok: false, error: e.message || 'Gagal kirim ke Telegram' });
  }
};
