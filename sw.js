// Update Tracker — Offline Service Worker (sw.js)
// Place this file in the same folder as index.html on GitHub Pages.

const CACHE_NAME = 'update-tracker-v1';

// Core files needed for the site to open cleanly with zero internet
const APP_SHELL = [
  './',
  './index.html',
  './manifest.json',
  './icon-192-1.png'
];

// Install: pre-cache the app shell (individual missing optional files won't block install)
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) =>
      Promise.all(
        APP_SHELL.map((url) =>
          cache.add(new Request(url, { cache: 'reload' })).catch(() => {})
        )
      )
    )
  );
  self.skipWaiting();
});

// Activate: remove outdated caches from older versions and take control immediately
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key !== CACHE_NAME)
            .map((key) => caches.delete(key))
        )
      )
      .then(() => self.clients.claim())
  );
});

// Fetch: serve cached app shell & fonts offline while keeping online visits fresh
self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  let url;
  try {
    url = new URL(req.url);
  } catch (err) {
    return;
  }

  // Only handle http(s) requests
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return;

  // Let index.html manage Google Apps Script data fetching & localStorage offline cache
  if (
    url.hostname === 'script.google.com' ||
    url.hostname === 'script.googleusercontent.com'
  ) {
    return;
  }

  // Page navigations: Network-First so online users always get your latest index.html,
  // falling back to cached index.html when offline (including shared ?device= / #device/ links)
  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req)
        .then((res) => {
          if (res && res.ok) {
            const copy = res.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put('./index.html', copy)).catch(() => {});
          }
          return res;
        })
        .catch(() =>
          caches.match(req, { ignoreSearch: true })
            .then((cached) => cached || caches.match('./index.html'))
            .then((cached) => cached || caches.match('./'))
        )
    );
    return;
  }

  // Local assets, Google Fonts, and html2canvas: Cache-First with background refresh
  const isSameOrigin = url.origin === self.location.origin;
  const isCacheableCdn =
    url.hostname === 'fonts.googleapis.com' ||
    url.hostname === 'fonts.gstatic.com' ||
    url.hostname === 'cdnjs.cloudflare.com';

  if (isSameOrigin || isCacheableCdn) {
    event.respondWith(
      caches.match(req).then((cached) => {
        const networkFetch = fetch(req)
          .then((res) => {
            if (res && (res.ok || res.type === 'opaque')) {
              const copy = res.clone();
              caches.open(CACHE_NAME).then((cache) => cache.put(req, copy)).catch(() => {});
            }
            return res;
          })
          .catch(() => cached);

        return cached || networkFetch;
      })
    );
  }
});