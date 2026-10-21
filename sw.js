// sw.js - Coco Dance Video Player Service Worker
// Enables transparent local caching of R2 video streams and offline HTTP 206 range request serving.

const CACHE_NAME = 'coco-dance-videos-v1';
const R2_HOST = 'pub-18aec1f30ae442ebbfbee0cf65c7fc41.r2.dev';

self.addEventListener('install', (event) => {
    // Activate immediately on install
    self.skipWaiting();
});

self.addEventListener('activate', (event) => {
    // Claim clients immediately so caching works without manual reload
    event.waitUntil(
        caches.keys().then((keys) => {
            return Promise.all(
                keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))
            );
        }).then(() => self.clients.claim())
    );
});

// Helper to determine if a request is for an R2 video
function isR2VideoRequest(url) {
    return url.hostname === R2_HOST && url.pathname.endsWith('.mp4');
}

// Background caching helper to ensure the entire video file is cached
async function ensureVideoCached(url) {
    const cache = await caches.open(CACHE_NAME);
    const cachedResponse = await cache.match(url);
    if (cachedResponse) {
        return; // Already cached
    }
    try {
        // Fetch full video response (without Range header)
        const response = await fetch(url, { mode: 'cors' });
        if (response.status === 200) {
            await cache.put(url, response);
            // Notify clients that this video has finished caching
            notifyClients({ type: 'VIDEO_CACHED', url: url });
        }
    } catch (err) {
        console.warn('Background caching failed for:', url, err);
    }
}

// Intercept fetch requests
self.addEventListener('fetch', (event) => {
    const request = event.request;
    const url = new URL(request.url);

    if (!isR2VideoRequest(url)) {
        // Pass through non-video requests normally
        return;
    }

    event.respondWith(handleVideoRequest(request));
});

async function handleVideoRequest(request) {
    const url = request.url;
    const cache = await caches.open(CACHE_NAME);
    const cachedResponse = await cache.match(url);

    const rangeHeader = request.headers.get('range');

    if (cachedResponse) {
        // Cache HIT: Video is already fully cached locally!
        if (!rangeHeader) {
            // Standard GET request without Range
            return cachedResponse.clone();
        }

        // Handle HTTP 206 Partial Content Range Request from Cache
        return serveRangeFromCache(cachedResponse, rangeHeader);
    }

    // Cache MISS: Video is not cached yet.
    // Progressively kick off background full-file caching so next play is 100% local.
    ensureVideoCached(url);

    // Stream the original request directly from network
    return fetch(request);
}

// Slice cached video ArrayBuffer to fulfill byte-range requests
async function serveRangeFromCache(cachedResponse, rangeHeader) {
    const blob = await cachedResponse.blob();
    const totalSize = blob.size;

    // Parse 'Range: bytes=start-end'
    const parts = rangeHeader.replace(/bytes=/, '').split('-');
    const start = parseInt(parts[0], 10);
    const end = parts[1] ? parseInt(parts[1], 10) : totalSize - 1;

    // Boundary check
    if (start >= totalSize || end >= totalSize || start > end) {
        return new Response('Requested Range Not Satisfiable', {
            status: 416,
            headers: {
                'Content-Range': `bytes */${totalSize}`,
                'Accept-Ranges': 'bytes'
            }
        });
    }

    const chunk = blob.slice(start, end + 1);
    const contentLength = end - start + 1;

    return new Response(chunk, {
        status: 206,
        statusText: 'Partial Content',
        headers: {
            'Content-Type': cachedResponse.headers.get('Content-Type') || 'video/mp4',
            'Content-Length': contentLength.toString(),
            'Content-Range': `bytes ${start}-${end}/${totalSize}`,
            'Accept-Ranges': 'bytes',
            'Cache-Control': 'public, max-age=31536000, immutable',
            'X-Cached-By': 'Coco-Dance-ServiceWorker'
        }
    });
}

// Notify all connected UI window clients
async function notifyClients(message) {
    const clients = await self.clients.matchAll({ includeUncontrolled: true, type: 'window' });
    for (const client of clients) {
        client.postMessage(message);
    }
}

// Handle messages from the UI (query cache status, precache video, delete cache)
self.addEventListener('message', async (event) => {
    const data = event.data;
    if (!data || !data.action) return;

    const cache = await caches.open(CACHE_NAME);

    if (data.action === 'CHECK_CACHE_STATUS') {
        const urls = data.urls || [];
        const statusMap = {};
        for (const url of urls) {
            const match = await cache.match(url);
            statusMap[url] = !!match;
        }
        event.source.postMessage({
            type: 'CACHE_STATUS_RESULT',
            statusMap: statusMap
        });
    } else if (data.action === 'PRECACHE_VIDEO') {
        const url = data.url;
        try {
            const existing = await cache.match(url);
            if (!existing) {
                const response = await fetch(url, { mode: 'cors' });
                if (response.status === 200) {
                    await cache.put(url, response);
                }
            }
            event.source.postMessage({
                type: 'PRECACHE_SUCCESS',
                url: url
            });
            notifyClients({ type: 'VIDEO_CACHED', url: url });
        } catch (err) {
            event.source.postMessage({
                type: 'PRECACHE_FAILED',
                url: url,
                error: err.message
            });
        }
    } else if (data.action === 'REMOVE_FROM_CACHE') {
        const url = data.url;
        await cache.delete(url);
        event.source.postMessage({
            type: 'REMOVE_SUCCESS',
            url: url
        });
        notifyClients({ type: 'VIDEO_REMOVED', url: url });
    } else if (data.action === 'CLEAR_ALL_CACHE') {
        await caches.delete(CACHE_NAME);
        event.source.postMessage({
            type: 'CLEAR_ALL_SUCCESS'
        });
        notifyClients({ type: 'ALL_CACHES_CLEARED' });
    }
});
