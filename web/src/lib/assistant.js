// 小安：老人端 AI 助手的"大脑"。
// 记录、急症、危机、用药问题都先在这里用规则把关；剩下的"回答问题"交给 DeepSeek
// （见 lib/ai.js 和 supabase/functions/ask），连不上时用这里的 answerQuestion() 兜底。

import { average, daysBetween, displayPatientName, displayRecordText, hasBloodPressure, monthDay } from './format'
import { isUnverified } from './recordLabels'

export const ASSISTANT_NAME = '小安'

// 血压提示的数值只是示例，需要临床老师按国内现行指南核对
export const BP_RULES = {
  urgentSystolic: 180,
  urgentDiastolic: 110,
  lowSystolic: 90,
  highSystolic: 140,
}

const NUM = '(\\d{2,3}|[零〇一二两三四五六七八九十百]+)'
const DIGITS = { 零: 0, 〇: 0, 一: 1, 二: 2, 两: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9 }

// "一百三十八" → 138，"六" → 6，"一百三" → 130
export function chineseNumber(text) {
  if (!text) return null
  if (/^\d+(\.\d+)?$/.test(text)) return Number(text)
  let rest = text
  let total = 0
  if (rest.includes('百')) {
    const [hundreds, after] = rest.split('百')
    total += (hundreds ? DIGITS[hundreds] ?? NaN : 1) * 100
    if (after && after.length === 1 && DIGITS[after] != null) return total + DIGITS[after] * 10
    rest = (after || '').replace(/^[零〇]/, '')
  }
  if (rest.includes('十')) {
    const [tens, units] = rest.split('十')
    total += (tens ? DIGITS[tens] ?? NaN : 1) * 10
    total += units ? DIGITS[units] ?? NaN : 0
  } else if (rest) {
    total += DIGITS[rest] ?? NaN
  }
  return Number.isFinite(total) ? total : null
}

function firstNumber(text, pattern) {
  const match = text.match(new RegExp(pattern))
  return match ? chineseNumber(match[1]) : null
}

export function parseCheckin(text) {
  const fields = {}

  const pair = text.match(new RegExp(`${NUM}\\s*(?:/|／|比)\\s*${NUM}`))
  let systolic = pair ? chineseNumber(pair[1]) : firstNumber(text, `(?:高压|收缩压)\\D{0,3}?${NUM}`)
  let diastolic = pair ? chineseNumber(pair[2]) : firstNumber(text, `(?:低压|舒张压)\\D{0,3}?${NUM}`)
  if (systolic == null && diastolic == null) {
    const loose = text.match(/血压\D{0,4}?(\d{2,3})\D{1,4}?(\d{2,3})/)
    if (loose) {
      systolic = Number(loose[1])
      diastolic = Number(loose[2])
    }
  }
  if (systolic != null && diastolic != null) {
    fields.systolic_mmhg = systolic
    fields.diastolic_mmhg = diastolic
  }

  const pulse = firstNumber(text, `(?:心跳|脉搏|心率)\\D{0,3}?${NUM}`)
  if (pulse != null) fields.pulse_bpm = pulse

  const sleep = text.match(/睡了?\D{0,4}?(\d+(?:\.\d+)?|[一二两三四五六七八九十]+)\s*个?\s*(半)?\s*个?\s*(?:小时|钟头)/)
  if (sleep) {
    const hours = chineseNumber(sleep[1])
    if (hours != null) fields.sleep_hours = hours + (sleep[2] ? 0.5 : 0)
  }

  if (/(不太好|心情不好|心情差|难受|不太舒服|不舒服|闷|烦|低落|不开心|难过|孤单|寂寞)/.test(text)) fields.mood_response = '不太好'
  else if (/(一般|还行|凑合|马马虎虎|还可以)/.test(text)) fields.mood_response = '一般'
  else if (/(很好|不错|挺好|开心|高兴|舒服|心情好)/.test(text)) fields.mood_response = '很好'

  if (/(想找人聊|想聊聊|想说说话|想找人说|孤单|寂寞|没人说话|没人陪)/.test(text)) fields.wants_to_talk = '愿意'

  return fields
}

export function checkBloodPressure(fields) {
  const sys = fields.systolic_mmhg
  const dia = fields.diastolic_mmhg
  const pulse = fields.pulse_bpm
  const result = { implausible: false, urgent: false, low: false }
  if (sys != null && dia != null) {
    result.implausible = dia >= sys || sys < 60 || sys > 260 || dia < 30 || dia > 150
    result.urgent = !result.implausible && (sys >= BP_RULES.urgentSystolic || dia >= BP_RULES.urgentDiastolic)
    result.low = !result.implausible && sys < BP_RULES.lowSystolic
  }
  if (pulse != null && (pulse < 30 || pulse > 200)) result.implausible = true
  if (fields.sleep_hours != null && fields.sleep_hours > 20) result.implausible = true
  return result
}

export function describeFields(fields) {
  const parts = []
  if (fields.systolic_mmhg != null) parts.push(`高压 ${fields.systolic_mmhg}，低压 ${fields.diastolic_mmhg}`)
  if (fields.pulse_bpm != null) parts.push(`心跳 ${fields.pulse_bpm}`)
  if (fields.sleep_hours != null) parts.push(`睡了 ${fields.sleep_hours} 小时`)
  if (fields.mood_response) parts.push(`心情${fields.mood_response}`)
  if (fields.wants_to_talk === '愿意') parts.push('想找人聊聊')
  // 没有识别出数字和心情时，原话照录
  if (!parts.length && fields.self_report_note) parts.push(`"${fields.self_report_note}"`)
  return parts.join('；')
}

export const SAFETY_TEXT = {
  urgent: `这次血压偏高。请先坐下休息 5 分钟，再量一次。如果同时有剧烈头痛、胸痛、气短、说话不清或手脚无力，请马上拨打 120。`,
  low: '这次血压偏低。如果觉得头晕、眼前发黑，先坐下或躺下，起身时慢一点；一直不舒服请联系医生。',
  implausible: '这个数字和平时不太一样，请再看一眼血压计，确认没有看错。',
  measure: '量之前先坐着休息 5 分钟，用同一只手臂，可以量两次。',
}

function isQuestion(text) {
  return /[?？]$/.test(text.trim()) || /(怎么样|怎样|多少|什么|是不是|吗|呢|哪|几次|几天|好不好)/.test(text)
}

// 把老人说的一句话变成一个"动作"。顺序很重要：安全情况永远最先判断。
export function interpret(text, ctx) {
  const input = text.trim()

  if (/(胸.{0,3}(痛|疼)|心口.{0,2}(痛|疼)|喘不(上|过)气|呼吸困难|说话不清|口齿不清|嘴歪|半边身|手脚.{0,3}(无力|发麻|没劲)|晕倒|昏倒|突然看不清)/.test(input)) {
    return {
      type: 'emergency',
      text: '您说的情况需要马上处理。请立刻拨打 120，或者请身边的人帮您打。打电话时说清楚哪里不舒服、从什么时候开始的。先坐下或躺下，不要一个人出门。',
    }
  }

  if (/(不想活|活着没意思|活够了|想死|轻生|自杀|不如死了)/.test(input)) {
    return {
      type: 'crisis',
      text: '谢谢您愿意告诉我，您现在一定很难受。您不是一个人。请现在就给信任的家人或朋友打个电话；也可以拨打心理援助热线 12356，有专人陪您说说话。如果觉得自己可能会伤害自己，请马上拨打 120。',
    }
  }

  if (/(拍病历|存病历|上传病历|拍处方|拍照|拍一下)/.test(input)) return { type: 'photo' }

  if (/(问医生|问问医生|问大夫|问一下医生)/.test(input) && /(想|要|帮我记|记一下)/.test(input)) {
    const question = input.split(/[:：]/).slice(1).join('：').trim() || input.replace(/.*(问医生|问问医生|问大夫|问一下医生)/, '').replace(/^[，,。\s]+/, '').trim()
    return question ? { type: 'doctor_question', question } : { type: 'ask_doctor_question' }
  }

  if (/(调药|加药|减药|药量|剂量|吃几片|多吃|少吃|停药|换药|能不能吃|可以吃.*药)/.test(input)) {
    return {
      type: 'refuse',
      text: '药怎么吃，我不能替医生决定。请带上药盒和最近的记录，去问医生或药师，他们会根据您的情况来判断。需要的话，我可以帮您把这个问题记下来，复诊时问医生。',
    }
  }

  if (/(诊断|是不是.*病|得了什么病|治疗方案)/.test(input)) {
    return {
      type: 'refuse',
      text: '是不是生了病，要医生检查以后才能判断，我不能替医生下结论。看病时把哪里不舒服、从什么时候开始的，连同最近的记录一起告诉医生。需要的话，我可以帮您把这个问题记下来，复诊时问医生。',
    }
  }

  if (/(忘了吃|忘记吃|没吃药|药没吃|漏吃|漏了)/.test(input)) {
    return {
      type: 'missed_med',
      text: '没关系。是不是需要补吃，每种药不一样，请打电话问医生或药师。千万不要下一次一下吃两份。',
    }
  }

  if (/(药.{0,3}(吃了|吃过|已经吃)|吃过药|吃了药)/.test(input)) return { type: 'meds_taken' }

  const fields = parseCheckin(input)
  const hasNumbers = fields.systolic_mmhg != null || fields.sleep_hours != null || fields.pulse_bpm != null
  const hasFeeling = fields.mood_response || fields.wants_to_talk || /(没睡好|睡得不好|睡不着|失眠|腿肿|头晕|没胃口)/.test(input)
  if (hasNumbers || (hasFeeling && !isQuestion(input))) {
    return { type: 'record', fields: { ...fields, self_report_note: input }, check: checkBloodPressure(fields) }
  }

  return { type: 'answer', ...answerQuestion(input, ctx) }
}

export function answerQuestion(question, { patient, checkins, records, slots = [] }) {
  if (/^(你好|您好|hi|hello|在吗)/i.test(question)) {
    return { text: `您好，我是${ASSISTANT_NAME}。您可以告诉我今天的血压、睡眠和心情，也可以问我以前记过的情况。`, sources: [] }
  }

  if (/药/.test(question) && /(今天|吃了吗|吃没吃|有没有吃)/.test(question)) {
    if (!slots.length) return { text: '家里人还没有帮您设置用药清单，所以我这里没有吃药的记录。', sources: [] }
    const lines = slots.map((slot) => `${slot.time} ${slot.med.name}：${slot.taken ? '已经点了"已吃"' : '还没有打卡'}`)
    return { text: `今天的用药打卡：${lines.join('；')}。没有打卡不一定是没吃，如果不确定，请不要再吃一次，先问问家人或药师。`, sources: [], local: true }
  }

  if (/(血压|高压|低压)/.test(question)) {
    const rows = checkins.filter(hasBloodPressure).slice(0, 7)
    if (!rows.length) return { text: '记录里还没有完整的血压读数。没量的日子不会算成 0。', sources: [] }
    const highest = rows.reduce((a, b) => (Number(b.systolic_mmhg) > Number(a.systolic_mmhg) ? b : a))
    const lowest = rows.reduce((a, b) => (Number(b.systolic_mmhg) < Number(a.systolic_mmhg) ? b : a))
    const latest = rows[0]
    const highDays = rows.filter((row) => row.systolic_mmhg >= BP_RULES.highSystolic).length
    return {
      text: `最近 ${rows.length} 次血压（${monthDay(rows.at(-1).record_date)}到${monthDay(latest.record_date)}）：最近一次是 ${latest.systolic_mmhg}/${latest.diastolic_mmhg}；最高 ${highest.systolic_mmhg}/${highest.diastolic_mmhg}（${monthDay(highest.record_date)}），最低 ${lowest.systolic_mmhg}/${lowest.diastolic_mmhg}（${monthDay(lowest.record_date)}）。${highDays ? `其中 ${highDays} 次高压在 ${BP_RULES.highSystolic} 或以上，复诊时可以把这些记录给医生看。` : ''}我只整理记录，不判断病情。`,
      sources: rows.map((row) => monthDay(row.record_date)),
    }
  }

  if (/(睡|休息)/.test(question)) {
    const rows = checkins.filter((row) => row.sleep_hours != null).slice(0, 7)
    if (!rows.length) return { text: '记录里还没有睡眠时长。', sources: [] }
    const mean = average(rows.map((row) => row.sleep_hours))
    const shortest = rows.reduce((a, b) => (Number(b.sleep_hours) < Number(a.sleep_hours) ? b : a))
    return {
      text: `最近 ${rows.length} 天记了睡眠，平均每晚大约 ${mean.toFixed(1)} 小时，睡得最少的是 ${monthDay(shortest.record_date)}，${shortest.sleep_hours} 小时。如果总是睡不好，可以复诊时跟医生说说。`,
      sources: rows.map((row) => monthDay(row.record_date)),
    }
  }

  if (/(心情|聊天|交流|说话)/.test(question)) {
    const recent = checkins.slice(0, 7)
    const low = recent.filter((row) => row.mood_response === '不太好').length
    const talk = recent.filter((row) => row.wants_to_talk === '愿意').length
    return {
      text: `最近 ${recent.length} 天里，有 ${low} 天心情记的是"不太好"，${talk} 天说想找人聊聊。想聊天的时候，可以直接给家人或朋友打个电话；我不会替您通知别人。`,
      sources: recent.map((row) => monthDay(row.record_date)),
    }
  }

  if (/(病历|医生说|看病|检查|过敏|既往|处方)/.test(question)) {
    if (!records.length && !patient.history_summary) return { text: '记录里还没有病历。您可以点"拍病历"，把病历拍下来存好。', sources: [] }
    const latest = records.slice(0, 2)
    const parts = []
    if (/过敏/.test(question)) parts.push(`过敏情况：${patient.allergy_status || '记录里没有'}。`)
    latest.forEach((record) => {
      if (isUnverified(record)) {
        parts.push(`${monthDay(record.record_date)}您拍了一张${record.record_type}，照片里的字我还没有核对，请以原件为准。`)
      } else {
        const content = displayRecordText(record.record_text).replace(/\s+/g, ' ')
        parts.push(`${monthDay(record.record_date)}的${record.record_type || '病历'}：${content.slice(0, 90)}${content.length > 90 ? '…' : ''}`)
      }
    })
    return { text: `${parts.join(' ')} 具体意思请以医生的解释为准。`, sources: latest.map((record) => `${monthDay(record.record_date)} ${record.record_type || '病历'}`) }
  }

  return {
    text: '这个问题我现在还答不上来。我可以帮您记血压、睡眠和心情，查看以前的记录和病历，也可以帮您记下想问医生的问题。',
    sources: [],
  }
}

// 打开助手时小安先说的话，跟着今天的状态变
export function openingLine({ patient, todayRow, slots, visitDate, questions, today }) {
  const now = new Date()
  const clock = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`
  const dueSlot = slots.find((slot) => !slot.taken && slot.time <= clock)
  if (dueSlot) {
    return {
      bubble: `${dueSlot.time} 的${dueSlot.med.name}吃了吗？`,
      text: `${dueSlot.time} 的${dueSlot.med.name}吃了吗？吃过了，点一下首页的"已吃"，或者直接告诉我"吃过了"。`,
    }
  }
  if (!hasBloodPressure(todayRow)) {
    return {
      bubble: '今天量血压了吗？',
      text: `今天量血压了吗？量好了直接告诉我就行，比如"高压 130，低压 80，心跳 70"。${SAFETY_TEXT.measure}`,
    }
  }
  if (todayRow.systolic_mmhg >= BP_RULES.urgentSystolic || todayRow.diastolic_mmhg >= BP_RULES.urgentDiastolic) {
    return {
      bubble: '刚才血压偏高，休息后再量一次吧',
      text: `今天记的血压是 ${todayRow.systolic_mmhg}/${todayRow.diastolic_mmhg}，偏高。休息 5 分钟后再量一次，量好了告诉我。如果有剧烈头痛、胸痛、气短、说话不清或手脚无力，请马上拨打 120。`,
    }
  }
  if (!todayRow?.mood_response) {
    return { bubble: '今天心情怎么样？', text: '今天心情怎么样？昨晚睡了几个小时？随便说说就行。' }
  }
  if (visitDate && daysBetween(today, visitDate) >= 0 && daysBetween(today, visitDate) <= 7 && !questions.length) {
    return {
      bubble: '快复诊了，有想问医生的吗？',
      text: `${monthDay(visitDate)}要去复诊。您有什么想问医生的吗？告诉我"我想问医生：……"，我帮您记下来，到时候一起带去。`,
    }
  }
  return { bubble: '今天都记好啦', text: `今天都记好啦，谢谢您，${displayPatientName(patient.display_name)}。有什么想问的吗？` }
}
