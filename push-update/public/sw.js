// GAV YOUTH service worker — handles background push notifications.
self.addEventListener('push', (event) => {
  let data = {}
  try { data = event.data.json() } catch (e) { data = { title: 'GAV YOUTH', body: '' } }
  event.waitUntil(
    self.registration.showNotification(data.title || 'GAV YOUTH', {
      body: data.body || '',
      tag: data.url || 'gav-youth',
      data: { url: data.url || '/chats' },
    })
  )
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const url = event.notification.data?.url || '/chats'
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
      for (const c of list) {
        if ('focus' in c) { c.navigate(url); return c.focus() }
      }
      if (self.clients.openWindow) return self.clients.openWindow(url)
    })
  )
})
