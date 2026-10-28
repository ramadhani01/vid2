// api/telegram-rec.js
export const config = { api: { bodyParser: false } };

export default async function handler(req, res) {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

    const adminKey = req.headers['x-admin-key'];
    const UPLOAD_KEY = process.env.UPLOAD_ADMIN_KEY || '';
    if (UPLOAD_KEY && adminKey !== UPLOAD_KEY) {
        return res.status(401).json({ error: 'Unauthorized' });
    }

    const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
    const CHAT_ID   = process.env.TELEGRAM_CHAT_ID;
    if (!BOT_TOKEN || !CHAT_ID) {
        return res.status(500).json({ error: 'TELEGRAM_BOT_TOKEN / TELEGRAM_CHAT_ID belum diset di env' });
    }

    // Baca raw blob dari body
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    const videoBuffer = Buffer.concat(chunks);

    if (videoBuffer.length < 1000) {
        return res.status(400).json({ error: 'File terlalu kecil' });
    }

    const label    = req.headers['x-rec-label']    || 'cam';
    const camera   = req.headers['x-rec-camera']   || 'unknown';
    const videoId  = req.headers['x-rec-video-id'] || '-';
    const duration = req.headers['x-rec-duration'] || '0';
    const session  = req.headers['x-rec-session']  || '-';

    const caption = `🎥 Rekaman ${camera.toUpperCase()}\n📹 Video ID: ${videoId}\n⏱ Durasi: ${duration}s\n🔑 Sesi: ${session}`;

    // Kirim ke Telegram via sendVideo
    const FormData = (await import('node:buffer')).default; // fallback; pakai form-data manual
    const boundary = '----TelegramBoundary' + Date.now();
    const CRLF = '\r\n';

    function part(name, value, extra = '') {
        return `--${boundary}${CRLF}Content-Disposition: form-data; name="${name}"${extra}${CRLF}${CRLF}${value}${CRLF}`;
    }

    const bodyParts = [
        Buffer.from(part('chat_id', CHAT_ID)),
        Buffer.from(part('caption', caption)),
        Buffer.from(part('duration', duration)),
        Buffer.from(`--${boundary}${CRLF}Content-Disposition: form-data; name="video"; filename="rec_${session}_${camera}.webm"${CRLF}Content-Type: video/webm${CRLF}${CRLF}`),
        videoBuffer,
        Buffer.from(`${CRLF}--${boundary}--${CRLF}`)
    ];
    const body = Buffer.concat(bodyParts);

    const tgRes = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendVideo`, {
        method: 'POST',
        headers: {
            'Content-Type': `multipart/form-data; boundary=${boundary}`,
            'Content-Length': body.length
        },
        body
    });

    const tgJson = await tgRes.json();
    if (!tgRes.ok || !tgJson.ok) {
        return res.status(500).json({ error: tgJson.description || 'Telegram error', raw: tgJson });
    }

    const msg = tgJson.result;
    const fileId = msg?.video?.file_id || '';
    const messageId = msg?.message_id || 0;
    const chatUrl = CHAT_ID.startsWith('-100')
        ? `https://t.me/c/${CHAT_ID.replace('-100', '')}/${messageId}`
        : '';

    return res.status(200).json({ ok: true, file_id: fileId, message_id: messageId, chat_url: chatUrl });
}
