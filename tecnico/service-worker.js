/**
 * Service Worker — Renostter Técnico PWA
 * Cache Strategy: Cache-first for assets, network-first for API
 * Offline queue for checklist submissions
 */

const CACHE_NAME = 'renostter-tec-v1';
const API_CACHE = 'renostter-api-v1';
const OFFLINE_QUEUE = 'offline-queue';

const PRECACHE = [
  './',
  './index.html',
  '../css/global.css',
  '../css/dashboard.css',
  '../js/storage.js',
  '../js/auth.js',
  '../js/utils.js',
];

// ─── Install: precache shell ───
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      console.log('[SW] Precaching app shell…');
      return cache.addAll(PRECACHE).catch(err => {
        console.warn('[SW] Precache failed (non-fatal):', err);
      });
    }).then(() => self.skipWaiting())
  );
});

// ─── Activate: cleanup old caches ───
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME && k !== API_CACHE).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

// ─── Fetch: network-first for API, cache-first for assets ───
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);

  // Skip non-GET
  if (event.request.method !== 'GET') return;

  // API calls: network-first, fallback to cache
  if (url.pathname.startsWith('/api/')) {
    event.respondWith(
      fetch(event.request)
        .then(response => {
          if (response.ok) {
            const clone = response.clone();
            caches.open(API_CACHE).then(cache => cache.put(event.request, clone));
          }
          return response;
        })
        .catch(() => caches.match(event.request))
    );
    return;
  }

  // Static assets: cache-first
  event.respondWith(
    caches.match(event.request).then(cached => {
      if (cached) return cached;
      return fetch(event.request).then(response => {
        if (response.ok) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
        }
        return response;
      });
    })
  );
});

// ─── Background Sync: submit offline checklist results ───
self.addEventListener('sync', event => {
  if (event.tag === 'sync-checklists') {
    event.waitUntil(syncOfflineChecklists());
  }
});

async function syncOfflineChecklists() {
  try {
    const db = await openDB();
    const tx = db.transaction(OFFLINE_QUEUE, 'readonly');
    const store = tx.objectStore(OFFLINE_QUEUE);
    const items = await new Promise((resolve, reject) => {
      const req = store.getAll();
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });

    for (const item of items) {
      try {
        const res = await fetch(item.url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(item.body),
        });
        if (res.ok) {
          // Remove from offline queue
          const delTx = db.transaction(OFFLINE_QUEUE, 'readwrite');
          delTx.objectStore(OFFLINE_QUEUE).delete(item.id);
          console.log('[SW] Synced offline item:', item.id);
          // Notify clients
          const clients = await self.clients.matchAll();
          clients.forEach(c => c.postMessage({ type: 'SYNC_SUCCESS', id: item.id }));
        }
      } catch (e) {
        console.warn('[SW] Sync failed for item:', item.id, e);
      }
    }
  } catch (e) {
    console.error('[SW] Sync error:', e);
  }
}

function openDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open('RenostterTec', 1);
    req.onupgradeneeded = e => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains(OFFLINE_QUEUE)) {
        db.createObjectStore(OFFLINE_QUEUE, { keyPath: 'id', autoIncrement: true });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

// ─── Push notifications (for future use) ───
self.addEventListener('push', event => {
  if (!event.data) return;
  const data = event.data.json();
  event.waitUntil(
    self.registration.showNotification(data.title || 'Renostter', {
      body: data.body || '',
      icon: '../assets/logo-crm.png',
      badge: '../assets/logo-crm.png',
      tag: data.tag || 'default',
      data: data.url ? { url: data.url } : undefined,
    })
  );
});

self.addEventListener('notificationclick', event => {
  event.notification.close();
  if (event.notification.data?.url) {
    event.waitUntil(self.clients.openWindow(event.notification.data.url));
  }
});
