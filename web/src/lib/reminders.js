// 小安的主动提醒：什么时候该主动找老人说一句话。
// 规则全部写在这里，不让 AI 自己判断；话术是固定的，不诊断、不提用药。
// 下面的天数、数值都是课堂示例，需要临床老师核对后才能用在真实老人身上。

import { daysBetween, hasBloodPressure, localDate } from './format'

export const REMINDER_RULES = {
  trendDays: 7, // 看最近几天的血压
  trendMinReadings: 4, // 至少有几次血压才看趋势
  trendRise: 10, // 最近 3 次的平均高压，比之前高出多少算"往上走"
  trendFloor: 130, // 最近 3 次的平均高压至少多少才提醒
  lowMoodDays: 2, // 连续几次心情"不太好"
  missedTime: '19:00', // 这个时间以后今天还没记录，提醒一次
  chatTime: '15:00', // 这个时间以后今天还没聊过，问一句想不想聊
  restTime: '21:00', // 提醒休息
  minGapMinutes: 30, // 两条提醒之间至少隔多久，不要一下子连着说
}

// 照护模式里能单独开关的提醒，按优先级排列：一天条数有限时，先发前面的
export const REMINDER_TYPES = [
  { key: 'bpTrend', label: '血压这几天往上走', hint: '最近 3 次的平均高压比之前高 10 以上，并且在 130 以上' },
  { key: 'quietDays', label: '两天没有记录，问问还好吗', hint: '昨天和前天都没有任何记录' },
  { key: 'lowMood', label: '心情不太好，问问想不想聊聊', hint: '最近两次心情都是"不太好"，或今天说想找人聊' },
  { key: 'missedToday', label: '今天还没记录', hint: `晚上 ${REMINDER_RULES.missedTime} 以后今天还没有任何记录` },
  { key: 'chat', label: '今天还没聊过天', hint: `下午 ${REMINDER_RULES.chatTime} 以后今天还没跟小安说过话` },
  { key: 'rest', label: '晚上提醒休息', hint: `晚上 ${REMINDER_RULES.restTime} 以后` },
]

export const DEFAULT_REMINDER_SETTINGS = {
  enabled: Object.fromEntries(REMINDER_TYPES.map((type) => [type.key, true])),
  maxPerDay: 3,
  quietStart: '22:00',
  quietEnd: '07:00',
}

const clock = (now) => `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`

// 夜里不发系统通知。老人自己打开手机时，聊天里照样能看到
export function inQuietHours(settings, now = new Date()) {
  const time = clock(now)
  const { quietStart, quietEnd } = settings
  return quietStart > quietEnd ? time >= quietStart || time < quietEnd : time >= quietStart && time < quietEnd
}

function hasAnyRecord(date, checkins, measurements) {
  const row = checkins.find((item) => item.record_date === date)
  const rowHasValue = row && (hasBloodPressure(row) || row.sleep_hours != null || row.mood_response || row.wants_to_talk)
  return Boolean(rowHasValue || measurements.some((item) => item.record_date === date))
}

// 血压趋势：最近 3 次的平均高压，和这之前几次比
export function bpTrend(checkins, today = localDate()) {
  const rows = checkins
    .filter((row) => hasBloodPressure(row) && daysBetween(row.record_date, today) >= 0 && daysBetween(row.record_date, today) < REMINDER_RULES.trendDays)
    .sort((a, b) => b.record_date.localeCompare(a.record_date))
  if (rows.length < REMINDER_RULES.trendMinReadings) return null
  const avg = (list) => list.reduce((sum, row) => sum + Number(row.systolic_mmhg), 0) / list.length
  const recent = avg(rows.slice(0, 3))
  const before = avg(rows.slice(3))
  return { recent: Math.round(recent), before: Math.round(before), rising: recent - before >= REMINDER_RULES.trendRise && recent >= REMINDER_RULES.trendFloor }
}

// 返回现在符合条件的提醒（还没考虑今天发过几条），每条带固定话术
export function dueReminders({ checkins, measurements, items, lastChatDate, now = new Date() }) {
  const today = localDate()
  const time = clock(now)
  const todayRow = checkins.find((row) => row.record_date === today)
  const due = []

  if (items.some((item) => item.kind === 'bp')) {
    const trend = bpTrend(checkins, today)
    if (trend?.rising) {
      due.push({
        key: 'bpTrend',
        title: '这几天血压有点往上走',
        text: '这几天的血压有点往上走。这两天可以多量几次，吃得清淡一点，早点休息。如果头痛得厉害、胸口痛或者说话不清楚，请马上拨打 120。',
        reason: `最近 3 次平均高压约 ${trend.recent}，之前约 ${trend.before}`,
      })
    }
  }

  const quiet = !hasAnyRecord(today, checkins, measurements) && !hasAnyRecord(localDate(-1), checkins, measurements) && !hasAnyRecord(localDate(-2), checkins, measurements)
  if (quiet) {
    due.push({ key: 'quietDays', title: '这两天还好吗？', text: '这两天没看到您的记录，身体还好吗？跟我说说就行。', reason: '昨天和前天都没有记录' })
  }

  const moods = checkins.filter((row) => row.mood_response && row.mood_response !== '跳过' && daysBetween(row.record_date, today) < 3)
    .sort((a, b) => b.record_date.localeCompare(a.record_date))
  const lowStreak = moods.length >= REMINDER_RULES.lowMoodDays && moods.slice(0, REMINDER_RULES.lowMoodDays).every((row) => row.mood_response === '不太好')
  if (lowStreak || todayRow?.wants_to_talk === '愿意') {
    due.push({
      key: 'lowMood',
      title: '想聊聊吗？',
      text: '这两天心情好像不太好。想聊聊吗？跟我说说今天的事也行。想家人了，我也可以帮您联系他们。',
      reason: lowStreak ? '最近两次心情都是"不太好"' : '今天说想找人聊聊',
    })
  }

  if (!quiet && time >= REMINDER_RULES.missedTime && !hasAnyRecord(today, checkins, measurements)) {
    due.push({ key: 'missedToday', title: '今天还没记录呢', text: '今天还没记录呢。量好血压可以告诉我，或者说说今天睡得怎么样、心情怎么样。', reason: '今天还没有任何记录' })
  }

  if (time >= REMINDER_RULES.chatTime && lastChatDate !== today) {
    due.push({ key: 'chat', title: '今天过得怎么样？', text: '今天过得怎么样？想聊聊天吗？点一下大按钮，跟我说说就行。', reason: '今天还没跟小安说过话' })
  }

  if (time >= REMINDER_RULES.restTime) {
    due.push({ key: 'rest', title: '该准备休息了', text: '到晚上了，该准备休息了。睡前少喝点水，起夜慢一点。晚安！', reason: `已经过了 ${REMINDER_RULES.restTime}` })
  }

  return due
}

// 从符合条件的提醒里挑出现在该发的一条：开着的、今天没发过的、没超过每天条数的、离上一条够久的
export function nextReminder(due, settings, sentToday, now = new Date()) {
  if (sentToday.length >= settings.maxPerDay) return null
  const last = sentToday.at(-1)
  if (last && now - new Date(last.at) < REMINDER_RULES.minGapMinutes * 60000) return null
  const sentKeys = new Set(sentToday.map((item) => item.key))
  const order = REMINDER_TYPES.map((type) => type.key)
  return due
    .filter((item) => settings.enabled[item.key] !== false && !sentKeys.has(item.key))
    .sort((a, b) => order.indexOf(a.key) - order.indexOf(b.key))[0] || null
}
