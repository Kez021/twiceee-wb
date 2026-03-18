// Kez Media Service Worker
// Handles offline caching and PWA install support

const CACHE_NAME = 'kez-media-v1';

// Assets to cache on install (shell resources only — no Firebase data)
const PRECACHE = [
  '/',
  '/index.html',
  '/icon-192.png',
  '/icon-512.png',
  'https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,900;1,900&family=Jost:wght@300;400;500;600&display=swap'
];

// Install: pre-cache shell
self.addEventListener('install', function(event) {
  event.waitUntil(
    caches.open(CACHE_NAME).then(function(cache) {
      // Cache what we can, ignore failures (e.g. cross-origin fonts)
      return Promise.allSettled(
        PRECACHE.map(function(url) {
          return cache.add(url).catch(function() {});
        })
      );
    }).then(function() {
      return self.skipWaiting();
    })
  );
});

// Activate: clean up old caches
self.addEventListener('activate', function(event) {
  event.waitUntil(
    caches.keys().then(function(keys) {
      return Promise.all(
        keys.filter(function(key) { return key !== CACHE_NAME; })
            .map(function(key) { return caches.delete(key); })
      );
    }).then(function() {
      return self.clients.claim();
    })
  );
});

// Fetch: network-first for Firebase/API calls, cache-first for static assets
self.addEventListener('fetch', function(event) {
  const url = event.request.url;

  // Always go network-first for Firebase, Cloudinary, and API calls
  if (
    url.includes('firestore.googleapis.com') ||
    url.includes('firebase') ||
    url.includes('cloudinary') ||
    url.includes('googleapis.com') ||
    url.includes('gstatic.com/firebasejs')
  ) {
    event.respondWith(fetch(event.request).catch(function() {
      return caches.match(event.request);
    }));
    return;
  }

  // For same-origin HTML/JS/CSS/images: cache-first with network fallback
  if (event.request.method === 'GET') {
    event.respondWith(
      caches.match(event.request).then(function(cached) {
        if (cached) return cached;
        return fetch(event.request).then(function(response) {
          // Cache valid responses
          if (response && response.status === 200 && response.type !== 'opaque') {
            const clone = response.clone();
            caches.open(CACHE_NAME).then(function(cache) {
              cache.put(event.request, clone);
            });
          }
          return response;
        }).catch(function() {
          // Offline fallback: return cached index.html for navigation
          if (event.request.mode === 'navigate') {
            return caches.match('/index.html');
          }
        });
      })
    );
  }
});
