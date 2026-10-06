const CACHE_NAME = `cosmic-shell-v0.1.1:${self.registration.scope}`;
const root = new URL('./', self.registration.scope);
const shell = ['', 'manifest.webmanifest', 'app-icon.svg', 'icons/icon-512.png', 'icons/touch-152.png', 'icons/touch-167.png', 'icons/touch-180.png'].map((path) => new URL(path, root).href);

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);
    await cache.addAll(shell);
    // Include Vite's hashed JS and CSS from this exact build for offline reloads.
    const html = await (await cache.match(root.href)).text();
    const assets = [...html.matchAll(/(?:src|href)=["']([^"']+\.(?:js|css))["']/g)]
      .map((match) => new URL(match[1], root))
      .filter((url) => url.origin === root.origin && url.pathname.startsWith(root.pathname))
      .map((url) => url.href);
    await cache.addAll(assets);
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((key) => key.startsWith('cosmic-shell-') && key.endsWith(`:${self.registration.scope}`) && key !== CACHE_NAME).map((key) => caches.delete(key)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== 'GET' || url.origin !== root.origin || !url.pathname.startsWith(root.pathname) || url.pathname.includes('/api/')) return;
  event.respondWith((async () => {
    try {
      const response = await fetch(request);
      if (response.ok) {
        try {
          const cache = await caches.open(CACHE_NAME);
          await cache.put(request, response.clone());
        } catch {
          // A cache quota failure must never replace a successful response.
        }
      }
      return response;
    } catch {
      const cached = await caches.match(request);
      if (cached) return cached;
      if (request.mode === 'navigate') {
        const page = await caches.match(root.href);
        if (page) return page;
      }
      return Response.error();
    }
  })());
});
