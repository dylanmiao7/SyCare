import { hasBloodPressure, shortDate } from '../lib/format'

export function PageHeading({ eyebrow, title, description, action }) {
  return (
    <div className="page-heading">
      <div>
        <div className="eyebrow">{eyebrow}</div>
        <h1>{title}</h1>
        <p>{description}</p>
      </div>
      {action}
    </div>
  )
}

export function StatCard({ icon, tone, label, value, unit, foot }) {
  return (
    <article className="stat-card">
      <span className={`stat-icon ${tone}`}>{icon}</span>
      <span className="stat-label">{label}</span>
      <div className="stat-value">{value}<small>{unit}</small></div>
      <div className="stat-foot">{foot}</div>
    </article>
  )
}

export function InlineEmpty({ text }) {
  return <div className="inline-empty">{text}</div>
}

export function MoodBadge({ value }) {
  if (!value || value === '跳过') return <span className="muted">未填写</span>
  return <span className={`mood-badge ${value === '不太好' ? 'mood-low' : value === '很好' ? 'mood-good' : ''}`}>{value}</span>
}

export function CaptureBadge({ value }) {
  const labels = { recorded: ['已记录', 'capture-recorded'], not_recorded: ['未测血压', 'capture-missing'], device_error: ['设备错误', 'capture-error'] }
  const [label, cls] = labels[value] || ['未知', '']
  return <span className={`capture-badge ${cls}`}>{label}</span>
}

export function BloodPressureChart({ rows }) {
  const values = [...rows].reverse().filter(hasBloodPressure)
  if (!values.length) return <div className="chart-empty"><span>⌁</span><p>最近还没有完整的血压读数</p></div>
  const max = Math.max(180, ...values.map((row) => Number(row.systolic_mmhg)))
  const min = Math.min(50, ...values.map((row) => Number(row.diastolic_mmhg)))
  const scaleY = (value) => 150 - ((Number(value) - min) / (max - min || 1)) * 120
  const step = values.length > 1 ? 560 / (values.length - 1) : 280
  const points = (field) => values.map((row, index) => `${40 + index * step},${scaleY(row[field])}`).join(' ')
  return (
    <div className="chart-wrap">
      <svg viewBox="0 0 640 190" role="img" aria-label="最近血压记录折线图" preserveAspectRatio="none">
        <line x1="36" y1="30" x2="36" y2="152" className="chart-axis" />
        <line x1="36" y1="152" x2="620" y2="152" className="chart-axis" />
        <line x1="36" y1={scaleY(140)} x2="620" y2={scaleY(140)} className="chart-gridline" />
        <polyline points={points('systolic_mmhg')} className="chart-line chart-line-sys" />
        <polyline points={points('diastolic_mmhg')} className="chart-line chart-line-dia" />
        {values.map((row, index) => (
          <g key={row.checkin_id}>
            <circle cx={40 + index * step} cy={scaleY(row.systolic_mmhg)} r="4" className="chart-point-sys" />
            <circle cx={40 + index * step} cy={scaleY(row.diastolic_mmhg)} r="4" className="chart-point-dia" />
          </g>
        ))}
      </svg>
      <div className="chart-dates">{values.map((row) => <span key={row.checkin_id}>{shortDate(row.record_date)}</span>)}</div>
    </div>
  )
}
