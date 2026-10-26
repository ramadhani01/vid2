// Vercel Serverless Function: /api/file?k=videos/2026/10/xxxx.mp4
// Untuk bucket PRIVATE: membuat link sementara (presigned GET) lalu mengarahkan
// (redirect 302) ke storage. File tidak lewat Vercel, jadi tidak kena batas ukuran.
// Link /api/file?k=... bersifat permanen walau link storage-nya kedaluwarsa.
const { S3Client, GetObjectCommand } = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');

module.exports = async (req, res) => {
  const key = String((req.query && req.query.k) || '');
  if (!/^(videos|thumbs)\/\d{4}\/\d{2}\/[A-Za-z0-9-]+\.(mp4|webm|mov|m4v|jpg)$/.test(key)) {
    res.statusCode = 400;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ ok: false, error: 'key tidak valid' }));
    return;
  }

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
    const url = await getSignedUrl(
      s3,
      new GetObjectCommand({ Bucket: process.env.R2_BUCKET, Key: key }),
      { expiresIn: 6 * 3600 }
    );
    // cache 1 jam di CDN Vercel (link storage berlaku 6 jam), 10 menit di browser
    res.setHeader('Cache-Control', 'public, s-maxage=3600, max-age=600');
    res.statusCode = 302;
    res.setHeader('Location', url);
    res.end();
  } catch (e) {
    console.error('file redirect error', e);
    res.statusCode = 502;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ ok: false, error: 'gagal membuat link' }));
  }
};
