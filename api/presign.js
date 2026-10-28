// Vercel Serverless Function: membuat URL upload (presigned PUT) ke Cloudflare R2.
// Environment Variables yang harus diisi di Vercel:
//   R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET,
//   R2_PUBLIC_BASE  (contoh: https://cdn.domainkamu.com  — tanpa slash di akhir)
//   UPLOAD_ADMIN_KEY (password rahasia admin untuk upload)
const crypto = require('crypto');
const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');

const MAX_VIDEO = 3 * 1024 * 1024 * 1024; // 3 GB
const MAX_THUMB = 5 * 1024 * 1024;        // 5 MB
const MAX_REC   = 500 * 1024 * 1024;      // 500 MB per rekaman (cukup untuk sesi panjang)
const VIDEO_EXT = { 'video/mp4': 'mp4', 'video/webm': 'webm', 'video/quicktime': 'mov', 'video/x-m4v': 'm4v' };

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

  const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
  const kind = body.kind === 'thumb' ? 'thumb' : (body.kind === 'rec' ? 'rec' : 'video');
  const size = Number(body.size || 0);

  let contentType, ext, prefix;

  if (kind === 'thumb') {
    contentType = 'image/jpeg';
    ext = 'jpg';
    prefix = 'thumbs';
    if (size > MAX_THUMB) return res.status(400).json({ ok: false, error: 'Thumbnail terlalu besar' });
  } else if (kind === 'rec') {
    // REKAMAN: selalu WebM dari MediaRecorder
    contentType = 'video/webm';
    ext = 'webm';
    prefix = 'recordings';
    if (size <= 0 || size > MAX_REC) return res.status(400).json({ ok: false, error: 'Ukuran rekaman tidak valid / terlalu besar' });
  } else {
    contentType = String(body.contentType || '').toLowerCase();
    if (!VIDEO_EXT[contentType]) {
      const m = String(body.filename || '').toLowerCase().match(/\.(mp4|webm|mov|m4v)$/);
      contentType = m ? ({ mp4: 'video/mp4', webm: 'video/webm', mov: 'video/quicktime', m4v: 'video/x-m4v' })[m[1]] : '';
    }
    if (!VIDEO_EXT[contentType]) return res.status(400).json({ ok: false, error: 'Format video tidak didukung (mp4/webm/mov)' });
    ext = VIDEO_EXT[contentType];
    prefix = 'videos';
    if (size <= 0 || size > MAX_VIDEO) return res.status(400).json({ ok: false, error: 'Ukuran video tidak valid / terlalu besar' });
  }

  const d = new Date();
  const key = `${prefix}/${d.getUTCFullYear()}/${String(d.getUTCMonth() + 1).padStart(2, '0')}/${crypto.randomUUID()}.${ext}`;

  try {
    const s3 = new S3Client({
      region: process.env.S3_REGION || 'auto',
      endpoint: process.env.S3_ENDPOINT || `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
      requestChecksumCalculation: 'WHEN_REQUIRED',
      responseChecksumValidation: 'WHEN_REQUIRED',
      credentials: {
        accessKeyId: process.env.R2_ACCESS_KEY_ID,
        secretAccessKey: process.env.R2_SECRET_ACCESS_KEY
      }
    });
    const expiresIn = 3600;
    const uploadUrl = await getSignedUrl(
      s3,
      new PutObjectCommand({ Bucket: process.env.R2_BUCKET, Key: key, ContentType: contentType }),
      { expiresIn }
    );
    const base = String(process.env.R2_PUBLIC_BASE || '').replace(/\/+$/, '');
    const publicUrl = base
      ? `${base}/${key}`
      : `https://${req.headers.host}/api/file?k=${encodeURIComponent(key)}`;
    return res.status(200).json({ ok: true, uploadUrl, contentType, key, publicUrl, expiresIn });
  } catch (e) {
    console.error('presign error', e);
    return res.status(500).json({ ok: false, error: 'Gagal membuat URL upload' });
  }
};
