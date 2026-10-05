// HorseRacePredictor PWA Service Worker
const CACHE_VERSION = 'v1.0.1';
const CACHE_NAME = `hrp-cache-${CACHE_VERSION}`;

// Essential app shell static assets to pre-cache
const STATIC_ASSETS = [
  './',
  './index.html',
  './manifest.webmanifest',
  './manifest.json',
  './favicon.svg',
  './favicon.ico',
  './favicon.png',
  './favicon-48x48.png',
  './favicon-32x32.png',
  './favicon-16x16.png',
  './apple-touch-icon.png',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-maskable-192.png',
  './icons/icon-maskable-512.png'
];

// Install Event: pre-cache app shell assets
self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(STATIC_ASSETS).catch((err) => {
        console.warn('[PWA SW] Pre-caching partial failure (assets will be cached on first fetch):', err);
      });
    })
  );
});

// Activate Event: purge stale caches and claim clients immediately
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME) {
            console.log('[PWA SW] Removing legacy cache:', key);
            return caches.delete(key);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

// Fetch Event: Stale-while-revalidate for local static assets; Network-only for API requests
self.addEventListener('fetch', (event) => {
  const request = event.request;
  const url = new URL(request.url);

  // 1. Never intercept external API requests (KRA API, Gemini API, etc.)
  // Data caching is handled exclusively by IndexedDB and In-Memory Tier per AGENTS.md
  if (url.origin !== self.location.origin || url.pathname.includes('/B551015') || url.pathname.includes('/api/')) {
    return;
  }

  // 2. Navigation request (HTML page): Network-first with cache fallback
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response.status === 200) {
            const copy = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
          }
          return response;
        })
        .catch(() => {
          return caches.match('./index.html').then((cached) => {
            return cached || caches.match('/HorseRacePredictor/index.html');
          });
        })
    );
    return;
  }

  // 3. Static assets (JS, CSS, images, fonts): Cache-first with background revalidation
  event.respondWith(
    caches.match(request).then((cachedResponse) => {
      const fetchPromise = fetch(request)
        .then((networkResponse) => {
          if (networkResponse && networkResponse.status === 200 && networkResponse.type === 'basic') {
            const responseToCache = networkResponse.clone();
            caches.open(CACHE_NAME).then((cache) => {
              cache.put(request, responseToCache);
            });
          }
          return networkResponse;
        })
        .catch(() => {
          // Offline or network error
          return cachedResponse;
        });

      return cachedResponse || fetchPromise;
    })
  );
});

// Message listener (for manual reload/skipWaiting triggers)
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});
