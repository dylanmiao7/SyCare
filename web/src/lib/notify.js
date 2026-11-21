// 让网页能发手机通知。
// 现在的做法：网页开着（哪怕在后台）时，由网页按规则判断，再通过 service worker 弹出通知。
// 网页完全关掉后还要提醒，需要服务器定时检查再推送（Web Push），是下一步。

const SW_URL = `${import.meta.env.BASE_URL}sw.js`

export function isStandalone() {
  return window.matchMedia?.('(display-mode: standalone)').matches || window.navigator.standalone === true
}

const isIOS = () => /iPhone|iPad|iPod/.test(navigator.userAgent)

// unsupported：这个浏览器不能发通知；needs-install：iPhone 要先"添加到主屏幕"
// default：还没问过；granted：已允许；denied：被拒绝了
export function notificationStatus() {
  if (!('Notification' in window) || !('serviceWorker' in navigator)) {
    return isIOS() && !isStandalone() ? 'needs-install' : 'unsupported'
  }
  return Notification.permission
}

export async function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) return null
  try {
    return await navigator.serviceWorker.register(SW_URL)
  } catch (error) {
    console.warn('提醒服务没有启动：', error.message)
    return null
  }
}

// 必须在老人点按钮时调用，浏览器才会弹出"是否允许通知"
export async function requestNotifications() {
  if (notificationStatus() !== 'default') return notificationStatus()
  const result = await Notification.requestPermission()
  if (result === 'granted') await registerServiceWorker()
  return result
}

export async function showNotification({ title, body, key }) {
  if (notificationStatus() !== 'granted') return false
  const registration = (await navigator.serviceWorker.getRegistration(SW_URL)) || (await registerServiceWorker())
  if (!registration) return false
  await registration.showNotification(`小安提醒：${title}`, {
    body,
    tag: key,
    icon: `${import.meta.env.BASE_URL}icon-192.png`,
    badge: `${import.meta.env.BASE_URL}icon-192.png`,
    data: { key },
  })
  return true
}

// 点了通知以后，service worker 会叫网页打开"问小安"
export function onNotificationClick(handler) {
  if (!('serviceWorker' in navigator)) return () => {}
  const listener = (event) => { if (event.data?.type === 'open-chat') handler(event.data.key) }
  navigator.serviceWorker.addEventListener('message', listener)
  return () => navigator.serviceWorker.removeEventListener('message', listener)
}
