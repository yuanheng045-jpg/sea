self.addEventListener('push', (event) => {
  let d = { title: '苏煦', body: '' }
  try { d = event.data.json() } catch (e) { try { d = { title: '苏煦', body: event.data.text() } } catch (e2) {} }
  event.waitUntil(self.registration.showNotification(d.title || '苏煦', {
    body: d.body || '', icon: '/sea/icon-192.png', badge: '/sea/icon-192.png',
    tag: 'cc-msg', renotify: true, data: { url: '/sea/' },
  }))
})
self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  event.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((cs) => {
    for (const c of cs) { if (c.url.includes('/sea') && 'focus' in c) return c.focus() }
    if (self.clients.openWindow) return self.clients.openWindow('/sea/')
  }))
})
