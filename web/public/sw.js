// SyCare 的 service worker：负责显示小安的提醒通知，点通知回到"问小安"。
// 现在只显示网页自己发出的提醒；以后接上服务器推送（Web Push），也在这里收。

self.addEventListener('install', () => self.skipWaiting())
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()))

// 以后服务器推送的提醒走这里，格式 { title, body, key }
self.addEventListener('push', (event) => {
  const data = event.data ? event.data.json() : {}
  event.waitUntil(self.registration.showNotification(data.title || '小安提醒', {
    body: data.body || '',
    tag: data.key || 'sycare',
    icon: 'icon-192.png',
    data: { key: data.key },
  }))
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const scope = self.registration.scope
  event.waitUntil((async () => {
    const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
    const open = windows.find((client) => client.url.startsWith(scope))
    if (open) {
      await open.focus()
      open.postMessage({ type: 'open-chat', key: event.notification.data?.key })
    } else {
      await self.clients.openWindow(scope)
    }
  })())
})
