/// <reference lib="webworker" />

// The service worker is deliberately limited to PWA lifecycle concerns.
// Local API execution and SQLite live in pure-frontend-api-worker.ts, because
// database work should stay off the UI thread and the API worker owns its
// dedicated SQLite worker connection.
let serviceWorkerGlobal = globalThis as unknown as ServiceWorkerGlobalScope

serviceWorkerGlobal.addEventListener('install', () => {
  void serviceWorkerGlobal.skipWaiting()
})

serviceWorkerGlobal.addEventListener('activate', (event: ExtendableEvent) => {
  event.waitUntil(serviceWorkerGlobal.clients.claim())
})
