// Vercel Serverless Function: /api/thumb?token=KODE
// Perantara ke API vdose supaya browser tidak kena blokir CORS.
// Balasan: { "thumb_id": "thumbs/2026/10/xxxx.jpg" }
module.exports = async (req, res) => {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');

  const token = String((req.query && req.query.token) || '').trim();
  if (!/^[A-Za-z0-9_-]{3,40}$/.test(token)) {
    res.status(400).json({ error: 'token tidak valid' });
    return;
  }

  try {
    const upstream = await fetch(
      'https://vdose.co/api/videos/by-token/' + encodeURIComponent(token),
      { headers: { Accept: 'application/json' } }
    );
    if (!upstream.ok) {
      res.status(upstream.status).json({ error: 'vdose membalas ' + upstream.status });
      return;
    }
    const info = await upstream.json();
    if (!info || !info.thumb_id) {
      res.status(404).json({ error: 'thumb_id tidak ada' });
      return;
    }
    // simpan di cache Vercel 1 hari supaya tidak memanggil vdose berulang-ulang
    res.setHeader('Cache-Control', 's-maxage=86400, stale-while-revalidate=3600');
    res.status(200).json({ thumb_id: String(info.thumb_id) });
  } catch (e) {
    res.status(502).json({ error: 'gagal menghubungi vdose: ' + e.message });
  }
};
