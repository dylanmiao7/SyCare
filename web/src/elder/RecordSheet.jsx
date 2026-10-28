import { useState } from 'react'
import { IMPLAUSIBLE_TEXT, SAFETY_TEXT, checkBloodPressure, safetyAfterSave } from '../lib/assistant'
import { checkValue } from '../lib/items'

// 首页直接填写：点"血压""血糖""睡眠"等卡片弹出来。
// 和跟小安说走同一套检查：看错了先确认，超出范围给提示。
export default function RecordSheet({ item, todayRow, onSave, onClose }) {
  const [values, setValues] = useState(() => (item.kind === 'sleep' ? { hours: todayRow?.sleep_hours ?? 7 } : {}))
  const [tag, setTag] = useState(item.tags?.[0] || null)
  const [warning, setWarning] = useState('')
  const [confirming, setConfirming] = useState(false)
  const [saving, setSaving] = useState(false)
  const [result, setResult] = useState(null)

  const set = (key) => (event) => { setValues({ ...values, [key]: event.target.value }); setConfirming(false); setWarning('') }

  function buildEntry() {
    if (item.kind === 'bp') {
      const sys = Number(values.sys)
      const dia = Number(values.dia)
      if (!values.sys || !values.dia) return { missing: '请把高压和低压都填上。' }
      const fields = { systolic_mmhg: sys, diastolic_mmhg: dia }
      if (values.pulse) fields.pulse_bpm = Number(values.pulse)
      return { entry: { fields }, implausible: checkBloodPressure(fields).implausible }
    }
    if (item.kind === 'sleep') {
      return { entry: { fields: { sleep_hours: values.hours } }, implausible: values.hours > 20 }
    }
    if (values.value === undefined || values.value === '') return { missing: `请填上${item.label}的数字。` }
    const value = Number(values.value)
    return { entry: { measures: [{ item, value, tag }] }, implausible: Boolean(checkValue(item, value).implausible) }
  }

  async function submit(event) {
    event.preventDefault()
    const { entry, implausible, missing } = buildEntry()
    if (missing) { setWarning(missing); return }
    if (implausible && !confirming) {
      setWarning(IMPLAUSIBLE_TEXT)
      setConfirming(true)
      return
    }
    setSaving(true)
    const error = await onSave(entry)
    setSaving(false)
    if (error) { setWarning(`没有保存成功，请检查一下网络再试一次。（${error.message}）`); return }
    const safety = safetyAfterSave(entry.fields || {}, entry.measures || [])
    if (safety) setResult(safety)
    else onClose()
  }

  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <section className="profile-sheet record-sheet" onClick={(event) => event.stopPropagation()} role="dialog" aria-label={`记${item.label}`}>
        {result ? (
          <>
            <h2>记好了</h2>
            <p className={`sheet-safety ${result.tone}`}>{result.text}</p>
            <button className="elder-primary" onClick={onClose}>知道了</button>
          </>
        ) : (
          <form onSubmit={submit}>
            <h2>记{item.label}</h2>
            {item.kind === 'bp' && (
              <>
                <p className="sheet-hint">{SAFETY_TEXT.measure}</p>
                <div className="big-fields">
                  <label><span>高压</span><input inputMode="numeric" autoFocus value={values.sys || ''} onChange={set('sys')} /></label>
                  <label><span>低压</span><input inputMode="numeric" value={values.dia || ''} onChange={set('dia')} /></label>
                  <label><span>心跳 <small>可不填</small></span><input inputMode="numeric" value={values.pulse || ''} onChange={set('pulse')} /></label>
                </div>
              </>
            )}
            {item.kind === 'sleep' && (
              <div className="stepper">
                <button type="button" onClick={() => setValues({ hours: Math.max(0, values.hours - 0.5) })} aria-label="少半小时">−</button>
                <strong>{values.hours}<small> 小时</small></strong>
                <button type="button" onClick={() => setValues({ hours: Math.min(24, values.hours + 0.5) })} aria-label="多半小时">＋</button>
              </div>
            )}
            {item.kind === 'number' && (
              <>
                {item.tags && (
                  <div className="tag-row">
                    {item.tags.map((candidate) => (
                      <button type="button" key={candidate} className={tag === candidate ? 'selected' : ''} onClick={() => setTag(candidate)}>{candidate}</button>
                    ))}
                  </div>
                )}
                <div className="big-fields single">
                  <label><span>{item.label}{item.unit && <small> {item.unit}</small>}</span><input inputMode="decimal" autoFocus value={values.value || ''} onChange={set('value')} /></label>
                </div>
              </>
            )}
            {warning && <p className="sheet-safety caution">{warning}</p>}
            <button className="elder-primary" type="submit" disabled={saving}>{saving ? '正在保存…' : confirming ? '没看错，保存' : '保存'}</button>
            <button className="elder-secondary" type="button" onClick={onClose}>不填了</button>
          </form>
        )}
      </section>
    </div>
  )
}
