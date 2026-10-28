import { hasBloodPressure, localDate, monthDay } from '../lib/format'
import { SYMPTOM_KEY, formatValue } from '../lib/items'

const WEEKDAYS = ['星期日', '星期一', '星期二', '星期三', '星期四', '星期五', '星期六']

// "我的记录"：最近 7 天，大字列表，不用图表
export default function ElderHistory({ checkins, items, measurements }) {
  const days = [...Array(7)].map((_, index) => localDate(-index))

  function linesFor(date) {
    const row = checkins.find((checkin) => checkin.record_date === date)
    const ofDay = measurements.filter((measurement) => measurement.record_date === date)
    const lines = []
    if (hasBloodPressure(row)) lines.push(['血压', `${row.systolic_mmhg} / ${row.diastolic_mmhg}${row.pulse_bpm ? `，心跳 ${row.pulse_bpm}` : ''}`])
    items.filter((item) => item.kind === 'number').forEach((item) => {
      const readings = ofDay.filter((measurement) => measurement.item_key === item.key && measurement.value_num != null)
      if (readings.length) lines.push([item.label, readings.map((reading) => `${reading.value_text ? `${reading.value_text} ` : ''}${formatValue(item, reading.value_num)}`).join('；')])
    })
    if (row?.sleep_hours != null) lines.push(['睡眠', `${row.sleep_hours} 小时`])
    if (row?.mood_response && row.mood_response !== '跳过') lines.push(['心情', row.mood_response])
    const symptoms = [...new Set(ofDay.filter((measurement) => measurement.item_key === SYMPTOM_KEY).flatMap((measurement) => measurement.value_text.split('、')))]
    if (symptoms.length) lines.push(['不舒服', symptoms.join('、')])
    return lines
  }

  return (
    <div className="elder-home">
      <header className="history-header">
        <h1>我的记录</h1>
        <p>最近 7 天。没记的日子空着，不要紧。</p>
      </header>
      {days.map((date, index) => {
        const lines = linesFor(date)
        return (
          <section className="elder-card history-day" key={date}>
            <h2>{index === 0 ? '今天' : index === 1 ? '昨天' : monthDay(date)}<small>{WEEKDAYS[new Date(`${date}T00:00:00`).getDay()]}</small></h2>
            {lines.length ? (
              <dl>
                {lines.map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}
              </dl>
            ) : <p className="elder-empty">这天没有记录。</p>}
          </section>
        )
      })}
    </div>
  )
}
