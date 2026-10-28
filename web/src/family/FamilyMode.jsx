import { useMemo, useState } from 'react'
import { BloodPressureChart, CaptureBadge, InlineEmpty, MoodBadge, PageHeading, StatCard } from './parts'
import { BP_RULES } from '../lib/assistant'
import { average, dateLabel, daysBetween, displayPatientName, displayRecordSource, displayRecordText, hasBloodPressure, localDate, monthDay, shortDate } from '../lib/format'
import { DEMO_PIN, getMedLog, getPhoto, medSlots } from '../lib/localStore'
import { isPhotoRecord, isUnverified } from '../lib/recordLabels'

// 日常的（每天看的数据、用药、提醒）放一页，单次的（复诊、病历）放一页
const NAV_ITEMS = [
  { id: 'daily', label: '日常总览', icon: '⌂' },
  { id: 'visit', label: '复诊与病历', icon: '▤' },
]

export default function FamilyMode(props) {
  const [unlocked, setUnlocked] = useState(false)
  const [section, setSection] = useState('daily')
  const { patient, patients, patientId, onPatientChange, onExit, error, notice, clearAlerts } = props

  if (!unlocked) return <PinGate onUnlock={() => setUnlocked(true)} onExit={onExit} />

  const navLabel = NAV_ITEMS.find((item) => item.id === section)?.label

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <span className="brand-mark">S</span>
          <span><strong>SyCare</strong><small>家属模式</small></span>
        </div>
        <div className="sidebar-label">家属与医护</div>
        <nav className="main-nav" aria-label="家属模式导航">
          {NAV_ITEMS.map((item) => (
            <button key={item.id} className={`nav-item ${section === item.id ? 'active' : ''}`} onClick={() => { setSection(item.id); clearAlerts() }}>
              <span className="nav-icon" aria-hidden="true">{item.icon}</span><span>{item.label}</span>
            </button>
          ))}
        </nav>
        <div className="sidebar-spacer" />
        <button className="button button-outline exit-family" onClick={onExit}>‹ 回到老人模式</button>
        <div className="sidebar-note">
          <span className="note-icon">✦</span>
          <strong>课堂体验</strong>
          <p>当前展示的是示例资料，仅供体验。请勿填写真实姓名、病历或健康信息。</p>
        </div>
      </aside>

      <main className="main-area">
        <header className="topbar">
          <div className="breadcrumb"><span>家属模式</span><span className="crumb-divider">/</span><strong>{navLabel}</strong></div>
          <div className="topbar-actions">
            <label className="patient-picker">
              <span className="sr-only">演示：切换长辈</span>
              <span className="avatar">{patient.display_name?.slice(-1) || '长'}</span>
              <select value={patientId} onChange={(event) => onPatientChange(event.target.value)}>
                {patients.map((item) => <option key={item.patient_id} value={item.patient_id}>{displayPatientName(item.display_name)}</option>)}
              </select>
              <span className="chevron">⌄</span>
            </label>
          </div>
        </header>

        <div className="page-wrap">
          {error && <div className="alert alert-error" role="alert"><span>!</span><div>{error}</div><button aria-label="关闭提示" onClick={clearAlerts}>×</button></div>}
          {notice && <div className="alert alert-success" role="status"><span>✓</span><div>{notice}</div><button aria-label="关闭提示" onClick={clearAlerts}>×</button></div>}
          {section === 'daily' && <Daily {...props} />}
          {section === 'visit' && <VisitAndRecords {...props} />}
          <footer className="page-footer"><span>SyCare · 体验版</span><span>记录帮助日常沟通，不用于诊断或治疗决策。</span></footer>
        </div>
      </main>
    </div>
  )
}

function PinGate({ onUnlock, onExit }) {
  const [pin, setPin] = useState('')
  const [wrong, setWrong] = useState(false)
  const submit = (event) => {
    event.preventDefault()
    if (pin === DEMO_PIN) onUnlock()
    else { setWrong(true); setPin('') }
  }
  return (
    <div className="pin-screen">
      <form className="pin-card" onSubmit={submit}>
        <h1>家属模式</h1>
        <p>这里可以查看记录、设置用药和准备复诊。请输入 4 位密码。</p>
        <input
          type="password"
          inputMode="numeric"
          maxLength="4"
          autoFocus
          value={pin}
          onChange={(event) => { setPin(event.target.value.replace(/\D/g, '')); setWrong(false) }}
          aria-label="4 位密码"
        />
        {wrong && <p className="pin-error">密码不对，请再试一次。</p>}
        <button className="button button-primary" type="submit" disabled={pin.length !== 4}>进入</button>
        <button className="text-button" type="button" onClick={onExit}>‹ 回到老人模式</button>
        <small>演示密码：{DEMO_PIN}</small>
      </form>
    </div>
  )
}

function Daily(props) {
  const { patient, checkins, records } = props
  const [tab, setTab] = useState('health')
  const recent = checkins.slice(0, 7)
  const bpRows = recent.filter(hasBloodPressure)
  const sleepRows = recent.filter((row) => row.sleep_hours != null)
  const sleepAverage = average(sleepRows.map((row) => row.sleep_hours))
  const talkDays = recent.filter((row) => row.wants_to_talk === '愿意').length
  const unverified = records.filter(isUnverified).length
  const careRows = checkins.filter((row) => row.self_report_note || row.wants_to_talk || row.mood_response)

  return (
    <>
      <PageHeading eyebrow="每天看看" title={`${displayPatientName(patient.display_name)}的近况`} description="只整理已经记录的内容，空白不会按 0 计算。" />
      <div className="stats-grid">
        <StatCard icon="⌁" tone="blue" label="最近血压" value={bpRows[0] ? `${bpRows[0].systolic_mmhg} / ${bpRows[0].diastolic_mmhg}` : '暂无'} unit={bpRows[0] ? 'mmHg' : ''} foot={bpRows[0] ? `${monthDay(bpRows[0].record_date)} · 近 7 条中 ${bpRows.length} 天有读数` : '最近 7 条记录'} />
        <StatCard icon="◷" tone="violet" label="平均睡眠" value={sleepAverage == null ? '暂无' : sleepAverage.toFixed(1)} unit={sleepAverage == null ? '' : '小时'} foot={`${sleepRows.length} 天填写了睡眠`} />
        <StatCard icon="♡" tone="rose" label="想找人聊聊" value={`${talkDays} 天`} unit="" foot="本人意愿，不代表已通知家人" />
        <StatCard icon="▤" tone="green" label="病历" value={`${records.length} 份`} unit="" foot={unverified ? `${unverified} 份拍照上传待核对` : '没有待核对的照片'} />
      </div>
      <section className="panel chart-panel">
        <div className="panel-heading"><div><h2>血压记录</h2><p>最近 7 条记录中的读数，虚线为高压 {BP_RULES.highSystolic}</p></div></div>
        <BloodPressureChart rows={recent} />
        <div className="chart-legend"><span><i className="legend-dot systolic" />高压（收缩压）</span><span><i className="legend-dot diastolic" />低压（舒张压）</span><span className="chart-footnote">仅展示记录值，不作诊断</span></div>
      </section>

      <MedList {...props} />

      <div className="tab-row" role="tablist">
        <button role="tab" aria-selected={tab === 'health'} className={tab === 'health' ? 'active' : ''} onClick={() => setTab('health')}>健康数据</button>
        <button role="tab" aria-selected={tab === 'care'} className={tab === 'care' ? 'active' : ''} onClick={() => setTab('care')}>关怀动态</button>
      </div>

      {tab === 'health' ? (
        <section className="panel data-panel">
          {checkins.length ? (
            <div className="table-scroll">
              <table className="data-table">
                <thead><tr><th>日期</th><th>血压</th><th>脉搏</th><th>睡眠</th><th>心情</th><th>记录人</th><th>状态</th></tr></thead>
                <tbody>
                  {checkins.map((row) => (
                    <tr key={row.checkin_id}>
                      <td><strong>{dateLabel(row.record_date)}</strong></td>
                      <td>{hasBloodPressure(row) ? `${row.systolic_mmhg}/${row.diastolic_mmhg}` : <span className="muted">—</span>}</td>
                      <td>{row.pulse_bpm ?? <span className="muted">—</span>}</td>
                      <td>{row.sleep_hours != null ? `${row.sleep_hours} 小时` : <span className="muted">—</span>}</td>
                      <td><MoodBadge value={row.mood_response} /></td>
                      <td>{row.recorded_by_type === 'family' ? '家属代录' : '本人'}</td>
                      <td><CaptureBadge value={row.capture_status} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : <InlineEmpty text="还没有每日记录。" />}
        </section>
      ) : (
        <section className="panel care-panel">
          {careRows.length ? (
            <div className="care-timeline">
              {careRows.map((row) => (
                <article className="timeline-card" key={row.checkin_id}>
                  <div className="timeline-date"><strong>{new Date(`${row.record_date}T00:00:00`).getDate()}</strong><span>{shortDate(row.record_date)}</span></div>
                  <div className="timeline-line" />
                  <div className="timeline-content">
                    <div className="timeline-head">
                      <span className={`mood-pill ${row.wants_to_talk === '愿意' ? 'talk-pill' : ''}`}>{row.wants_to_talk === '愿意' ? '♡ 想找人聊聊' : row.mood_response && row.mood_response !== '跳过' ? `心情 · ${row.mood_response}` : '日常记录'}</span>
                      <span className="timeline-by">{row.recorded_by_type === 'family' ? '家属代录' : '本人记录'}</span>
                    </div>
                    <p>{row.self_report_note || (row.wants_to_talk === '愿意' ? '本人表示愿意交流。' : '未填写补充说明。')}</p>
                    {row.sleep_hours != null && <span className="timeline-detail">睡眠 {row.sleep_hours} 小时</span>}
                  </div>
                </article>
              ))}
            </div>
          ) : <InlineEmpty text="还没有关怀内容。" />}
        </section>
      )}

      <Reminders {...props} />
    </>
  )
}

function RecordCard({ record, onVerify, saving }) {
  const photo = isPhotoRecord(record) ? getPhoto(record.record_id) : null
  const unverified = isUnverified(record)
  return (
    <article className={`panel record-card ${unverified ? 'record-unverified' : ''}`}>
      <div className="record-icon">{isPhotoRecord(record) ? '📷' : '▤'}</div>
      <div className="record-body">
        <div className="record-title-row">
          <div>
            <span className="record-type">{record.record_type || '病历记录'}</span>
            <h2>{displayRecordSource(record.source_label) || '病历文字'}</h2>
          </div>
          <time>{dateLabel(record.record_date)}</time>
        </div>
        {isPhotoRecord(record) && (
          photo
            ? <img className="record-photo" src={photo} alt={`${record.record_type}照片`} />
            : <p className="record-text muted">原图保存在老人使用的那台手机上。</p>
        )}
        {!isPhotoRecord(record) && (
          <details><summary>查看记录内容 <span>⌄</span></summary><p className="record-text">{displayRecordText(record.record_text)}</p></details>
        )}
        {unverified && onVerify && (
          <div className="verify-row">
            <span>对照原图核对过日期和内容后，再标为已核对。</span>
            <button className="button button-soft" onClick={() => onVerify(record)} disabled={saving}>标为已核对</button>
          </div>
        )}
      </div>
    </article>
  )
}

function Records({ records, saving, onVerify, onAddTextRecord }) {
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({ recordDate: localDate(), recordType: '门诊病历', recordText: '' })
  const unverified = records.filter(isUnverified).length
  const submit = async (event) => {
    event.preventDefault()
    if (!form.recordText.trim()) return
    const ok = await onAddTextRecord({ ...form, recordText: form.recordText.trim() })
    if (ok) { setShowForm(false); setForm({ recordDate: localDate(), recordType: '门诊病历', recordText: '' }) }
  }
  return (
    <section className="no-print records-section">
      <div className="section-heading">
        <div><h2>病历（{records.length}）</h2><p>{unverified ? `${unverified} 份老人拍照上传的还没核对。AI 会提醒以原件为准，也不会根据处方照片修改用药清单。` : '老人拍照上传的病历和家属录入的文字。'}</p></div>
        <button className="button button-outline" onClick={() => setShowForm(!showForm)}>{showForm ? '收起' : '＋ 录入病历文字'}</button>
      </div>
      {showForm && (
        <form className="panel form-panel" onSubmit={submit}>
          <div className="form-grid">
            <label className="field"><span>日期</span><input type="date" required value={form.recordDate} onChange={(event) => setForm({ ...form, recordDate: event.target.value })} /></label>
            <label className="field"><span>类型</span><select value={form.recordType} onChange={(event) => setForm({ ...form, recordType: event.target.value })}><option>门诊病历</option><option>随访记录</option><option>检查报告</option><option>处方</option></select></label>
            <label className="field field-wide"><span>病历文字</span><textarea rows="5" required maxLength="3000" placeholder="请只填写模拟内容，不要填写真实病历。" value={form.recordText} onChange={(event) => setForm({ ...form, recordText: event.target.value })} /></label>
          </div>
          <div className="form-actions"><span>家属录入的文字视为已核对。</span><button className="button button-primary" type="submit" disabled={saving}>{saving ? '正在保存…' : '保存'}</button></div>
        </form>
      )}
      <section className="record-list">
        {records.length ? records.map((record) => <RecordCard key={record.record_id} record={record} onVerify={onVerify} saving={saving} />) : <section className="panel"><InlineEmpty text="还没有病历。" /></section>}
      </section>
    </section>
  )
}

function MedList({ meds, slots, onMedsChange }) {
  const [form, setForm] = useState({ name: '', dose: '', times: '08:00' })
  const [formError, setFormError] = useState('')
  const add = (event) => {
    event.preventDefault()
    const times = form.times.split(/[,，\s]+/).filter(Boolean)
    if (!form.name.trim() || !times.length || times.some((time) => !/^([01]\d|2[0-3]):[0-5]\d$/.test(time))) {
      setFormError('请填写药名，时间写成 08:00 这样的格式，多个时间用逗号隔开。')
      return
    }
    onMedsChange([...meds, { id: crypto.randomUUID(), name: form.name.trim(), dose: form.dose.trim(), times }])
    setForm({ name: '', dose: '', times: '08:00' })
    setFormError('')
  }
  return (
    <section className="panel meds-panel">
      <div className="panel-heading"><div><h2>用药</h2><p>请按医生处方填写；老人拍了新处方，AI 也不会自动改这里。老人首页每个时间点有一个打卡按钮。</p></div></div>
      {meds.length ? (
        <div className="table-scroll">
          <table className="data-table">
            <thead><tr><th>药名</th><th>每次用量</th><th>今天打卡</th><th /></tr></thead>
            <tbody>
              {meds.map((med) => (
                <tr key={med.id}>
                  <td><strong>{med.name}</strong></td>
                  <td>{med.dose || '—'}</td>
                  <td>
                    {slots.filter((slot) => slot.med.id === med.id).map((slot) => (
                      <span key={slot.id} className={`dose-chip ${slot.taken ? 'taken' : ''}`}>{slot.time} {slot.taken ? '✓ 已吃' : '未打卡'}</span>
                    ))}
                  </td>
                  <td><button className="text-button" onClick={() => onMedsChange(meds.filter((item) => item.id !== med.id))}>删除</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : <InlineEmpty text="还没有设置用药。" />}
        <form className="med-form" onSubmit={add}>
          <label className="field"><span>药名</span><input value={form.name} placeholder="例如：降压药（示例）" onChange={(event) => setForm({ ...form, name: event.target.value })} /></label>
          <label className="field"><span>每次用量</span><input value={form.dose} placeholder="例如：1片" onChange={(event) => setForm({ ...form, dose: event.target.value })} /></label>
          <label className="field"><span>时间</span><input value={form.times} placeholder="08:00, 20:00" onChange={(event) => setForm({ ...form, times: event.target.value })} /></label>
          <button className="button button-primary" type="submit">添加</button>
        </form>
      {formError && <p className="form-error">{formError}</p>}
    </section>
  )
}

function medAdherence(patientId, meds, from, to) {
  const slots = medSlots(meds)
  if (!slots.length) return null
  const days = []
  for (let date = new Date(`${to}T00:00:00`); date >= new Date(`${from}T00:00:00`) && days.length < 14; date.setDate(date.getDate() - 1)) {
    const key = new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 10)
    const log = getMedLog(patientId, key)
    const taken = slots.filter((slot) => log[slot.id]).length
    days.push({ date: key, taken, total: slots.length })
  }
  return {
    days: days.length,
    full: days.filter((day) => day.taken === day.total).length,
    partial: days.filter((day) => day.taken > 0 && day.taken < day.total).length,
    none: days.filter((day) => day.taken === 0).length,
  }
}

function buildVisitText({ patient, checkins, records, meds, questions, from, to }) {
  const rows = checkins.filter((row) => row.record_date >= from && row.record_date <= to)
  const bp = rows.filter(hasBloodPressure)
  const highest = bp.length ? bp.reduce((a, b) => (Number(b.systolic_mmhg) > Number(a.systolic_mmhg) ? b : a)) : null
  const lowest = bp.length ? bp.reduce((a, b) => (Number(b.systolic_mmhg) < Number(a.systolic_mmhg) ? b : a)) : null
  const highDays = bp.filter((row) => row.systolic_mmhg >= BP_RULES.highSystolic).length
  const missing = rows.filter((row) => !hasBloodPressure(row)).length
  const sleep = average(rows.map((row) => row.sleep_hours))
  const lowMood = rows.filter((row) => row.mood_response === '不太好').length
  const talk = rows.filter((row) => row.wants_to_talk === '愿意').length
  const notes = rows.filter((row) => row.self_report_note && row.recorded_by_type === 'self').slice(0, 5)
  const adherence = medAdherence(patient.patient_id, meds, from, to)
  const periodRecords = records.filter((record) => record.record_date >= from && record.record_date <= to)

  return [
    `复诊准备：${displayPatientName(patient.display_name)}（${patient.age_years ? `${patient.age_years} 岁` : '年龄未记录'}，编号 ${patient.patient_id}）`,
    `整理范围：${dateLabel(from)} 至 ${dateLabel(to)}，共有 ${rows.length} 天记录`,
    `既往情况：${patient.history_summary || '未记录'}　过敏：${patient.allergy_status || '未记录'}`,
    '',
    '一、老人想问医生的问题',
    ...(questions.length ? questions.map((item, index) => `${index + 1}. ${item.text}`) : ['（这次没有记下问题）']),
    '',
    '二、血压',
    bp.length
      ? `• ${bp.length} 天有完整读数，最高 ${highest.systolic_mmhg}/${highest.diastolic_mmhg}（${monthDay(highest.record_date)}），最低 ${lowest.systolic_mmhg}/${lowest.diastolic_mmhg}（${monthDay(lowest.record_date)}）`
      : '• 这段时间没有完整血压读数',
    bp.length ? `• 高压 ≥ ${BP_RULES.highSystolic} 的有 ${highDays} 天` : null,
    missing ? `• 有 ${missing} 天未测或设备出错，未按 0 计算` : null,
    '',
    '三、睡眠、心情与交流',
    `• 睡眠：${sleep == null ? '未记录' : `平均约 ${sleep.toFixed(1)} 小时`}`,
    `• 心情记为"不太好"的有 ${lowMood} 天；想找人聊聊的有 ${talk} 天`,
    ...notes.map((row) => `• ${monthDay(row.record_date)} 老人原话："${row.self_report_note.replace(/\s+/g, ' ')}"`),
    '',
    '四、用药',
    meds.length ? `• 用药清单：${meds.map((med) => `${med.name} ${med.dose} ${med.times.join('、')}`).join('；')}` : '• 没有设置用药清单',
    adherence ? `• 最近 ${adherence.days} 天打卡：${adherence.full} 天全部打卡，${adherence.partial} 天部分打卡，${adherence.none} 天没有打卡（没有打卡不等于没吃药）` : null,
    '',
    '五、这段时间的病历',
    ...(periodRecords.length
      ? periodRecords.map((record) => `• ${monthDay(record.record_date)} ${record.record_type || '病历'}${isUnverified(record) ? '（老人拍照上传，未核对，请看原图）' : ''}`)
      : ['• 没有新的病历']),
    '',
    '以上由记录整理，请核对后使用，不作为诊断或治疗依据。',
  ].filter((line) => line !== null).join('\n')
}

function VisitAndRecords(props) {
  const { patient, checkins, records, meds, questions, onQuestionsChange, visitDate, onVisitDateChange } = props
  const today = localDate()
  // 默认从上一次就诊记录开始（老人拍照上传的不算）
  const lastVisit = records.find((record) => !isPhotoRecord(record) && record.record_date < today)?.record_date
  const [from, setFrom] = useState(lastVisit || localDate(-30))
  const [edited, setEdited] = useState(null)
  const draft = useMemo(() => buildVisitText({ patient, checkins, records, meds, questions, from, to: today }), [patient, checkins, records, meds, questions, from, today])
  const text = edited ?? draft

  const copy = async () => {
    try { await navigator.clipboard.writeText(text); window.alert('已复制，可以粘贴到微信里分享。') }
    catch { window.alert('浏览器没有允许复制，请选中文字手动复制。') }
  }

  return (
    <>
      <PageHeading eyebrow="看病的时候用" title="复诊与病历" description="设好下次复诊日期；去之前整理上次就诊以来的记录，核对、修改后打印或分享给医生护士。" action={<button className="button button-primary no-print" onClick={() => window.print()}>打印 / 保存 PDF</button>} />
      <section className="panel visit-panel no-print">
        <label className="field"><span>下次复诊日期</span><input type="date" min={localDate()} value={visitDate} onChange={(event) => onVisitDateChange(event.target.value)} /></label>
        <p>{visitDate ? `还有 ${daysBetween(localDate(), visitDate)} 天。` : '还没有设置。'}复诊前 7 天，小安会主动问老人有什么想问医生的。</p>
      </section>
      <div className="summary-toolbar no-print">
        <label>从 <input type="date" value={from} max={today} onChange={(event) => { setFrom(event.target.value); setEdited(null) }} /> 到今天{lastVisit ? `（上次就诊：${monthDay(lastVisit)}）` : ''}</label>
        <button className="text-button" onClick={() => setEdited(null)}>重新整理</button>
      </div>
      <section className="panel summary-panel">
        <div className="summary-paper-head"><div className="paper-logo">S</div><div><strong>复诊准备</strong><span>SyCare · 请核对后使用</span></div><span className="paper-date">整理日期 {dateLabel(today)}</span></div>
        <textarea aria-label="复诊准备内容" value={text} onChange={(event) => setEdited(event.target.value)} rows="22" />
        <div className="form-actions no-print"><span>文字可以修改。打印前请核对日期、读数和来源。</span><button className="button button-outline" onClick={copy}>复制文字</button></div>
      </section>

      {questions.length > 0 && (
        <section className="panel no-print question-panel">
          <div className="panel-heading"><div><h2>老人记下的问题</h2><p>问过医生后可以删掉</p></div></div>
          {questions.map((item) => (
            <div className="detail-pair" key={item.id}>
              <span>{monthDay(item.date)}　{item.text}</span>
              <button className="text-button" onClick={() => onQuestionsChange(questions.filter((question) => question.id !== item.id))}>删除</button>
            </div>
          ))}
        </section>
      )}

      <Records {...props} />
    </>
  )
}

function Reminders({ patient, checkins, sms, onSmsChange, outbox, onQueueSms }) {
  const [consent, setConsent] = useState(false)
  const today = localDate()
  const recordedToday = checkins.some((row) => row.record_date === today)
  const name = displayPatientName(patient.display_name)
  const declined = (patient.sharing_preference || '').includes('不分享')

  const turnOn = () => {
    if (!consent) return
    onSmsChange({ ...sms, notifyFamily: true })
  }

  return (
    <section className="panel reminder-panel">
        <div className="panel-heading"><div><h2>短信通知家人</h2><p>联系人：{patient.support_person || '未指定'}　·　分享偏好：{patient.sharing_preference || '未记录'}</p></div><span className="subtle-tag">{sms.notifyFamily ? '已开启' : '已关闭'}</span></div>
        <p className="reminder-copy">提醒老人本人（吃药、量血压、复诊前记问题）由小安在首页负责，默认开启。通知家人必须老人本人同意，短信只发提醒，不发血压、药名等健康数据。演示版只显示预览，不会真的发送。</p>
        {sms.notifyFamily ? (
          <button className="button button-outline" onClick={() => onSmsChange({ ...sms, notifyFamily: false })}>关闭短信通知</button>
        ) : (
          <div className="consent-box">
            {declined && <p className="form-error">{name}选择了"不分享"。除非本人改变主意并明确同意，否则不要开启。</p>}
            <label><input type="checkbox" checked={consent} onChange={(event) => setConsent(event.target.checked)} /> 我已经当面问过{name}，本人同意在下面的情况给家人发短信</label>
            <button className="button button-primary" onClick={turnOn} disabled={!consent}>开启短信通知</button>
          </div>
        )}
        <div className="detail-pair"><span>当天晚上 8 点还没有任何记录</span><strong>"{name}今天还没有记录，可以打个电话问候一下。"</strong></div>
        <div className="detail-pair"><span>老人拍照上传了新处方</span><strong>"{name}上传了一张新处方，请帮忙确认用药清单。"</strong></div>
        {sms.notifyFamily && (
          <button className="button button-soft" onClick={() => onQueueSms(recordedToday ? `${name}今天已经记录了，不需要发提醒。` : `${name}今天还没有记录，可以打个电话问候一下。`, recordedToday)}>
            演示：模拟今晚 8 点检查
          </button>
        )}
        {outbox.length > 0 && (
          <details className="outbox">
            <summary>将发送的短信预览（{outbox.length}）<span>⌄</span></summary>
            {outbox.map((item) => (
              <div className="detail-pair" key={item.id}><span>{new Date(item.at).toLocaleString('zh-CN')}</span><strong>{item.text}</strong></div>
            ))}
          </details>
        )}
    </section>
  )
}
