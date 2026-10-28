export function localDate(offsetDays = 0) {
  const date = new Date()
  date.setDate(date.getDate() + offsetDays)
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000)
  return local.toISOString().slice(0, 10)
}

export function dateLabel(value) {
  if (!value) return '日期未记录'
  const date = new Date(`${value}T00:00:00`)
  return Number.isNaN(date.valueOf())
    ? value
    : new Intl.DateTimeFormat('zh-CN', { year: 'numeric', month: 'long', day: 'numeric' }).format(date)
}

export function monthDay(value) {
  if (!value) return ''
  const date = new Date(`${value}T00:00:00`)
  return Number.isNaN(date.valueOf()) ? value : `${date.getMonth() + 1}月${date.getDate()}日`
}

export function shortDate(value) {
  if (!value) return ''
  const date = new Date(`${value}T00:00:00`)
  return Number.isNaN(date.valueOf()) ? value : `${date.getMonth() + 1}/${date.getDate()}`
}

export function todayHeading() {
  return new Intl.DateTimeFormat('zh-CN', { month: 'long', day: 'numeric', weekday: 'long' }).format(new Date())
}

export function greetingWord() {
  const hour = new Date().getHours()
  if (hour < 11) return '早上好'
  if (hour < 14) return '中午好'
  if (hour < 18) return '下午好'
  return '晚上好'
}

export function displayPatientName(value) {
  return (value || '').replace(/^模拟\s*/, '') || '长辈'
}

export function displayRecordText(value) {
  return (value || '').replace(/【完全模拟病历】/g, '').trim()
}

export function displayRecordSource(value) {
  return (value || '').replace(/中文教学模拟文本/g, '病历资料')
}

export function nullableNumber(value) {
  if (value === '' || value === null || value === undefined) return null
  const number = Number(value)
  return Number.isFinite(number) ? number : null
}

export function average(values) {
  const usable = values.filter((value) => value !== null && value !== '' && Number.isFinite(Number(value))).map(Number)
  if (!usable.length) return null
  return usable.reduce((sum, value) => sum + value, 0) / usable.length
}

export function hasBloodPressure(row) {
  return row?.capture_status === 'recorded' && row.systolic_mmhg != null && row.diastolic_mmhg != null
}

export function daysBetween(from, to) {
  const start = new Date(`${from}T00:00:00`)
  const end = new Date(`${to}T00:00:00`)
  return Math.round((end - start) / 86400000)
}
