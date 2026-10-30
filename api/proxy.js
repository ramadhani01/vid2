export default async function handler(req, res) {
    const { url } = req.query;

    if (!url) {
        return res.status(400).json({ error: 'no url' });
    }

    const decoded = decodeURIComponent(url);

    // Whitelist domain yang boleh di-proxy
    const allowed = ['surrit.com', 'cdn.surrit.com'];
    let hostname = '';
    try {
        hostname = new URL(decoded).hostname;
    } catch (e) {
        return res.status(400).json({ error: 'invalid url' });
    }

    const isAllowed = allowed.some(d => hostname === d || hostname.endsWith('.' + d));
    if (!isAllowed) {
        return res.status(403).json({ error: 'domain not allowed' });
    }

    try {
        const response = await fetch(decoded, {
            headers: {
                'Referer': 'https://surrit.com/',
                'Origin': 'https://surrit.com',
                'User-Agent': 'Mozilla/5.0 (Linux; Android 10; Mobile) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Mobile Safari/537.36',
                'Accept': '*/*',
                'Accept-Language': 'id-ID,id;q=0.9,en;q=0.8',
            }
        });

        if (!response.ok) {
            return res.status(response.status).json({ error: 'upstream error', status: response.status });
        }

        const contentType = response.headers.get('content-type') || 'application/octet-stream';
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
        res.setHeader('Content-Type', contentType);
        res.setHeader('Cache-Control', 'public, max-age=300');

        const buffer = await response.arrayBuffer();
        res.send(Buffer.from(buffer));
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
}
