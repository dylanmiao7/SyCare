// 老人端"让小安提醒您"：打开手机通知。浏览器要求必须由老人自己点一下才能弹出授权
export default function NotifyCard({ status, onEnable }) {
  if (status === 'granted') return null
  const text = {
    default: '小安会在需要的时候提醒您，比如今天还没记录、该休息了。点下面的按钮，再点"允许"。',
    denied: '提醒被关掉了。请家人帮忙在手机的浏览器设置里，允许这个网站发通知。',
    'needs-install': '苹果手机要先把小安放到桌面：点浏览器下面的"分享"按钮，选"添加到主屏幕"，再从桌面打开。',
    unsupported: '这个浏览器不能发提醒。打开小安的时候，提醒会直接显示在对话里。',
  }[status]
  return (
    <section className="elder-card notify-card">
      <h2>🔔 让小安提醒您</h2>
      <p>{text}</p>
      {status === 'default' && <button className="elder-primary" onClick={onEnable}>打开提醒</button>}
    </section>
  )
}
