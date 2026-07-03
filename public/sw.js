// SIR V2 — Service Worker para Web Push notifications.
//
// El browser registra este SW cuando Aaron activa notificaciones desde /yo.
// Cuando el cron (/api/cron/status-diff) detecta que una relación empeoró,
// llama a web-push con la subscription guardada → el push service manda
// un evento 'push' a este worker → mostramos una notificación.
//
// Ojo: este archivo se sirve directo desde /sw.js (no bundleado por Next).

self.addEventListener('install', () => {
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim())
})

self.addEventListener('push', (event) => {
  let data = { title: 'SIR', body: 'Nueva señal en tu red' }
  try {
    if (event.data) data = { ...data, ...JSON.parse(event.data.text()) }
  } catch (e) {
    try { data.body = event.data ? event.data.text() : data.body } catch (_) {}
  }
  const options = {
    body: data.body,
    icon: data.icon || '/icon-192.png',
    badge: data.badge || '/badge-72.png',
    tag: data.tag || 'sir-alert',
    data: { url: data.url || '/panel' },
    requireInteraction: !!data.requireInteraction,
  }
  event.waitUntil(self.registration.showNotification(data.title, options))
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const targetUrl = (event.notification.data && event.notification.data.url) || '/panel'
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((wins) => {
      for (const w of wins) {
        if (w.url.includes(new URL(targetUrl, self.location.origin).pathname) && 'focus' in w) return w.focus()
      }
      if (self.clients.openWindow) return self.clients.openWindow(targetUrl)
    }),
  )
})
