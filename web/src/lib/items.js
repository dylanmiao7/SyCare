// 每天要记的项目。得什么病很难预先知道，所以由家属或医生在家属模式里选；
// 常用的有预设，不在列表里的可以自己加。
// 睡眠、心情、哪里不舒服适合所有人，固定显示，不在这里。
//
// 提醒范围只是示例，需要临床老师核对；家属可以按医生的意见改。

export const PRESET_ITEMS = [
  { key: 'bp', label: '血压', unit: 'mmHg', kind: 'bp', aliases: ['血压', '高压', '低压'] },
  {
    key: 'glucose', label: '血糖', unit: 'mmol/L', kind: 'number', decimals: 1, plausible: [1, 35],
    tags: ['空腹', '饭后2小时', '随机'], aliases: ['血糖'], low: 3.9, high: null,
    // 低血糖不能只是"休息再量"，要先补糖
    lowText: '这次血糖偏低。如果手抖、出冷汗、心慌、头晕，先吃几块糖或喝半杯果汁，15 分钟后再量一次；还是低或者人不清醒，马上拨打 120。',
  },
  { key: 'weight', label: '体重', unit: '公斤', kind: 'number', decimals: 1, plausible: [20, 200], aliases: ['体重', '称了'], low: null, high: null },
  { key: 'temperature', label: '体温', unit: '℃', kind: 'number', decimals: 1, plausible: [34, 43], aliases: ['体温', '发烧'], low: null, high: 37.3 },
  { key: 'spo2', label: '血氧', unit: '%', kind: 'number', decimals: 0, plausible: [50, 100], aliases: ['血氧', '氧饱和'], low: 93, high: null },
]

// 首页"哪里不舒服"的按钮。胸痛、喘不上气这类急症不放在这里，单独提示打 120。
export const SYMPTOMS = ['头晕', '头痛', '腿脚肿', '咳嗽', '没胃口', '身上疼', '大便不正常', '睡不好']

export const SYMPTOM_KEY = 'symptoms'

// 新建档案时默认勾选的项目：只根据既往病史做个起点，家属和医生可以随时改
export function defaultItems(patient) {
  const history = patient.history_summary || ''
  const items = []
  if (history.includes('高血压')) items.push(presetConfig('bp'))
  if (history.includes('糖尿病')) items.push(presetConfig('glucose'))
  return items
}

export function presetConfig(key) {
  const preset = PRESET_ITEMS.find((item) => item.key === key)
  return { key, low: preset.low ?? null, high: preset.high ?? null }
}

// 保存的设置只有 key 和提醒范围；自定义项目还带名称和单位
export function resolveItems(config) {
  return config.map((entry) => {
    const preset = PRESET_ITEMS.find((item) => item.key === entry.key)
    if (preset) return { ...preset, low: entry.low ?? null, high: entry.high ?? null }
    return {
      key: entry.key,
      label: entry.label,
      unit: entry.unit || '',
      kind: 'number',
      decimals: 1,
      plausible: [0, 100000],
      aliases: [entry.label],
      low: entry.low ?? null,
      high: entry.high ?? null,
      custom: true,
    }
  })
}

export function formatValue(item, value) {
  if (value == null || value === '') return ''
  const number = Number(value)
  return `${item.decimals ? number.toFixed(item.decimals).replace(/\.0$/, '') : Math.round(number)} ${item.unit}`.trim()
}

// 检查一个读数：看错了（不合常理），或者超出家属/医生设的提醒范围
export function checkValue(item, value) {
  const number = Number(value)
  const [min, max] = item.plausible || [-Infinity, Infinity]
  if (!Number.isFinite(number) || number < min || number > max) return { implausible: true }
  if (item.low != null && number < item.low) return { outOfRange: 'low' }
  if (item.high != null && number > item.high) return { outOfRange: 'high' }
  return {}
}

export function rangeText(item) {
  if (item.low != null && item.high != null) return `${item.low}–${item.high} ${item.unit}`
  if (item.low != null) return `低于 ${item.low} ${item.unit} 时提醒`
  if (item.high != null) return `高于 ${item.high} ${item.unit} 时提醒`
  return '没有设置提醒'
}

export function outOfRangeText(item, direction) {
  if (direction === 'low' && item.lowText) return item.lowText
  if (direction === 'high' && item.highText) return item.highText
  const word = direction === 'low' ? '低' : '高'
  return `这次${item.label}比家人和医生设的范围${word}。先坐下休息一会儿，过一阵再量一次。如果觉得很不舒服，请联系医生；有胸痛、喘不上气、说话不清这类情况，马上拨打 120。`
}

export const IMPLAUSIBLE_TEXT = '这个数字和平时不太一样，请再看一眼，确认没有看错。'

// 某个项目最近的读数（按时间从新到旧）
export function readingsFor(measurements, key) {
  return measurements.filter((row) => row.item_key === key && row.value_num != null)
}

export function todayReading(measurements, key, today) {
  return measurements.find((row) => row.item_key === key && row.record_date === today) || null
}
