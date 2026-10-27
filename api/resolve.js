// Vercel serverless function: /api/resolve?u=<link slicndrive>
// Mengubah https://cdn2.slicndrive.com/<token>.mp4 menjadi link download
// https://stream.alflix.cv/videos/YYYY/MM/<uuid>.mp4 (dijalankan di server,
// jadi tidak kena CORS seperti kalau dipanggil langsung dari browser).
//
// Urutan: 1) API vdose  2) ikuti redirect link slicndrive
const STREAM_BASE = 'https://stream.alflix.cv/';
const THUMB_BASE = 'https://thumbs.alflix.cv/';
const UA = 'Mozilla/5.0 (Linux; Android 13) AppleWebKit/537.36 Chrome/120 Mobile Safari/537.36';

function toStream(videoId) {
  return /^https?:\/\//i.test(videoId) ? videoId : STREAM_BASE + String(videoId).replace(/^\/+/, '');
}
function toThumb(thumbId, videoId) {
  if (thumbId) return /^https?:\/\//i.test(thumbId) ? thumbId : THUMB_BASE + String(thumbId).replace(/^\/+/, '');
  const key = String(videoId).replace(/^https?:\/\/[^/]+\//i, '').replace(/^\/+/, '');
  return THUMB_BASE + key.replace(/^videos\//, 'thumbs/').replace(/\.[a-z0-9]+$/i, '.jpg');
}

module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  const q = req.query || {};
  let token = String(q.token || '');
  let host = 'cdn2.slicndrive.com';

  if (q.u) {
    try {
      const u = new URL(String(q.u));
      // Hanya host slicndrive yang diizinkan (cegah penyalahgunaan sebagai proxy)
      if (!/(^|\.)slicndrive\.com$/i.test(u.hostname)) {
        return res.status(400).json({ ok: false, error: 'host tidak diizinkan' });
      }
      host = u.hostname;
      const m = u.pathname.match(/^\/([A-Za-z0-9_-]+)\.mp4$/i);
      if (m) token = m[1];
    } catch (e) {
      return res.status(400).json({ ok: false, error: 'url tidak valid' });
    }
  }
  if (!/^[A-Za-z0-9_-]{3,64}$/.test(token)) {
    return res.status(400).json({ ok: false, error: 'token tidak valid' });
  }

  const errors = [];

  // 1) API vdose
  try {
    const r = await fetch('https://vdose.co/api/videos/by-token/' + encodeURIComponent(token), {
      headers: { accept: 'application/json', 'user-agent': UA }
    });
    if (r.ok) {
      const j = await r.json();
      if (j && j.video_id) {
        return res.status(200).json({ ok: true, source: 'vdose', url: toStream(j.video_id), thumb: toThumb(j.thumb_id, j.video_id) });
      }
      errors.push('vdose tanpa video_id');
    } else {
      errors.push('vdose membalas ' + r.status);
    }
  } catch (e) {
    errors.push('vdose gagal: ' + e.message);
  }

  // 2) Ikuti redirect dari link slicndrive (kalau memang mengarah ke stream.alflix.cv)
  try {
    let url = 'https://' + host + '/' + token + '.mp4';
    for (let hop = 0; hop < 5; hop++) {
      const r = await fetch(url, { method: 'GET', redirect: 'manual', headers: { range: 'bytes=0-0', 'user-agent': UA } });
      const loc = r.headers.get('location');
      try { if (r.body && r.body.cancel) await r.body.cancel(); } catch (_) {}
      if (r.status >= 300 && r.status < 400 && loc) {
        url = new URL(loc, url).toString();
        if (/^https?:\/\/stream\.alflix\.cv\/videos\//i.test(url)) break;
        continue;
      }
      break;
    }
    if (/^https?:\/\/stream\.alflix\.cv\/videos\//i.test(url)) {
      const clean = url.split(/[?#]/)[0];
      return res.status(200).json({ ok: true, source: 'redirect', url: clean, thumb: toThumb('', clean) });
    }
    errors.push('redirect tidak mengarah ke stream.alflix.cv');
  } catch (e) {
    errors.push('redirect gagal: ' + e.message);
  }

  return res.status(502).json({ ok: false, error: errors.join(' | ') });
};
