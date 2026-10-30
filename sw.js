// Service Worker — intercept semua request ke surrit.com
// Inject Referer + Origin header biar gak ke-block

const SURRIT_HOSTS = ['surrit.com'];

function isSurritUrl(url) {
    try {
        const hostname = new URL(url).hostname;
        return SURRIT_HOSTS.some(h => hostname === h || hostname.endsWith('.' + h));
    } catch (e) {
        return false;
    }
}

self.addEventListener('install', function(event) {
    self.skipWaiting();
});

self.addEventListener('activate', function(event) {
    event.waitUntil(self.clients.claim());
});

self.addEventListener('fetch', function(event) {
    const url = event.request.url;

    if (!isSurritUrl(url)) return;

    event.respondWith(
        fetch(url, {
            method: event.request.method,
            headers: {
                'Referer': 'https://surrit.com/',
                'Origin': 'https://surrit.com',
                'User-Agent': 'Mozilla/5.0 (Linux; Android 10; Mobile) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Mobile Safari/537.36',
                'Accept': '*/*',
                'Accept-Language': 'id-ID,id;q=0.9,en;q=0.8',
            },
            mode: 'cors',
            credentials: 'omit',
        }).catch(function(err) {
            console.warn('[SW] fetch failed for', url, err);
            return fetch(event.request);
        })
    );
});
