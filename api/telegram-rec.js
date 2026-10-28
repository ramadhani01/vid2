// Vercel Serverless Function: minta URL upload ke Telegram Bot API
// (bukan upload file ke Vercel — Vercel batas body 4.5MB)
// Fungsi ini CUMA kasih info bot token & chat id yang aman
// supaya browser bisa kirim file LANGSUNG ke Telegram.
//
// Environment Variables:
//   TELEGRAM_BOT_TOKEN  (dari BotFather)
//   TELEGRAM_CHAT_ID    (chat ID tujuan)
//   UPLOAD_ADMIN_KEY    (password admin, sudah ada)

const crypto = require('crypto');

function safeEqual(a, b) {
  const A = Buffer.from(String(a || ''));
  const B = Buffer.from(String(b || ''));
  return A.length === B.length && crypto.timingSafeEqual(A, B);
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

  // Kirim token & chatId ke browser admin — TAPI hanya kalau password upload benar.
  // Browser yang akan kirim file LANGSUNG ke Telegram (bukan lewat Vercel).
  return res.status(200).json({ ok: true, botToken, chatId });
};
