import { useCallback, useEffect, useMemo, useState } from 'react'
import { isSupabaseConfigured, supabase } from './lib/supabase'

const NAV_ITEMS = [
  { id: 'home', label: '总览', icon: '⌂' },
  { id: 'health', label: '健康记录', icon: '＋' },
  { id: 'care', label: '关怀记录', icon: '♡' },
  { id: 'records', label: '病历资料', icon: '▤' },
  { id: 'summary', label: '复诊小结', icon: '▧' },
  { id: 'ask', label: '问一问', icon: '✳' },
]

const EMPTY_FORM = {
  record_date: localDate(),
  systolic_mmhg: '',
  diastolic_mmhg: '',
  pulse_bpm: '',
  capture_status: 'recorded',
  recorded_by_type: 'self',
  sleep_hours: '',
  mood_response: '',
  wants_to_talk: '',
  self_report_note: '',
}

function localDate() {
  const date = new Date()
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000)
  return local.toISOString().slice(0, 10)
}

function dateLabel(value) {
  if (!value) return '日期未记录'
  const date = new Date(`${value}T00:00:00`)
  return Number.isNaN(date.valueOf())
    ? value
    : new Intl.DateTimeFormat('zh-CN', { year: 'numeric', month: 'long', day: 'numeric' }).format(date)
}

function nullableNumber(value) {
  if (value === '' || value === null || value === undefined) return null
  const number = Number(value)
  return Number.isFinite(number) ? number : null
}

function average(values) {
  const usable = values.filter((value) => Number.isFinite(Number(value))).map(Number)
  if (!usable.length) return null
  return usable.reduce((sum, value) => sum + value, 0) / usable.length
}

function shortDate(value) {
  if (!value) return ''
  const date = new Date(`${value}T00:00:00`)
  return Number.isNaN(date.valueOf()) ? value : `${date.getMonth() + 1}/${date.getDate()}`
}

function App() {
  const [section, setSection] = useState('home')
  const [patients, setPatients] = useState([])
  const [patientId, setPatientId] = useState('')
  const [checkins, setCheckins] = useState([])
  const [records, setRecords] = useState([])
  const [loading, setLoading] = useState(true)
  const [patientLoading, setPatientLoading] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [showCheckinForm, setShowCheckinForm] = useState(false)
  const [showRecordForm, setShowRecordForm] = useState(false)
  const [saving, setSaving] = useState(false)
  const [summary, setSummary] = useState('')
  const [question, setQuestion] = useState('')
  const [answer, setAnswer] = useState(null)
  const [form, setForm] = useState(EMPTY_FORM)
  const [recordForm, setRecordForm] = useState({ record_date: localDate(), record_type: '随访记录', record_text: '' })

  const patient = useMemo(() => patients.find((item) => item.patient_id === patientId) || null, [patients, patientId])
  const orderedCheckins = useMemo(
    () => [...checkins].sort((a, b) => b.record_date.localeCompare(a.record_date)),
    [checkins],
  )
  const orderedRecords = useMemo(
    () => [...records].sort((a, b) => b.record_date.localeCompare(a.record_date)),
    [records],
  )

  const loadPatients = useCallback(async () => {
    if (!isSupabaseConfigured) {
      setError('还没有配置 Supabase 连接信息。请在 web/.env.local 中填写项目 URL 和 Publishable key。')
      setLoading(false)
      return
    }
    const { data, error: queryError } = await supabase.from('patients').select('*').order('patient_id')
    if (queryError) {
      setError(`读取老人档案失败：${queryError.message}`)
      setLoading(false)
      return
    }
    setPatients(data || [])
    setPatientId((current) => current || data?.[0]?.patient_id || '')
    setError('')
    setLoading(false)
  }, [])

  const loadPatientData = useCallback(async (id) => {
    if (!id || !supabase) {
      setCheckins([])
      setRecords([])
      return
    }
    setPatientLoading(true)
    const [checkinResult, recordResult] = await Promise.all([
      supabase.from('daily_checkins').select('*').eq('patient_id', id).order('record_date', { ascending: false }),
      supabase.from('medical_records').select('*').eq('patient_id', id).order('record_date', { ascending: false }),
    ])
    if (checkinResult.error || recordResult.error) {
      setError(`读取${checkinResult.error ? '健康记录' : '病历'}失败：${(checkinResult.error || recordResult.error).message}`)
    } else {
      setCheckins(checkinResult.data || [])
      setRecords(recordResult.data || [])
      setError('')
    }
    setPatientLoading(false)
  }, [])

  useEffect(() => {
    loadPatients()
  }, [loadPatients])

  useEffect(() => {
    loadPatientData(patientId)
  }, [patientId, loadPatientData])

  useEffect(() => {
    if (patient) setSummary(buildSummary(patient, checkins, 7))
  }, [patient, checkins])

  async function refreshCurrentPatient() {
    await Promise.all([loadPatients(), loadPatientData(patientId)])
  }

  async function saveCheckin(event) {
    event.preventDefault()
    if (!patient) return
    setSaving(true)
    setError('')
    setNotice('')
    const row = {
      checkin_id: `CHK-${crypto.randomUUID()}`,
      patient_id: patient.patient_id,
      record_date: form.record_date,
      systolic_mmhg: nullableNumber(form.systolic_mmhg),
      diastolic_mmhg: nullableNumber(form.diastolic_mmhg),
      pulse_bpm: nullableNumber(form.pulse_bpm),
      capture_status: form.capture_status,
      recorded_by_type: form.recorded_by_type,
      sleep_hours: nullableNumber(form.sleep_hours),
      mood_response: form.mood_response || null,
      wants_to_talk: form.wants_to_talk || null,
      self_report_note: form.self_report_note.trim() || null,
      is_synthetic: true,
    }
    const { error: insertError } = await supabase.from('daily_checkins').insert(row)
    setSaving(false)
    if (insertError) {
      setError(insertError.code === '23505' ? '这位长辈当天已有一条记录。请修改日期或先查看已有记录。' : `保存失败：${insertError.message}`)
      return
    }
    setForm({ ...EMPTY_FORM, record_date: localDate() })
    setShowCheckinForm(false)
    setNotice('健康记录已保存。')
    await loadPatientData(patientId)
  }

  async function saveMedicalRecord(event) {
    event.preventDefault()
    if (!patient || !recordForm.record_text.trim()) return
    setSaving(true)
    setError('')
    setNotice('')
    const row = {
      record_id: `REC-${crypto.randomUUID()}`,
      patient_id: patient.patient_id,
      record_date: recordForm.record_date,
      record_type: recordForm.record_type,
      source_label: '课堂演示输入',
      record_text: recordForm.record_text.trim(),
      text_status: 'confirmed_demo',
      file_path: null,
      is_synthetic: true,
    }
    const { error: insertError } = await supabase.from('medical_records').insert(row)
    setSaving(false)
    if (insertError) {
      setError(`保存病历失败：${insertError.message}`)
      return
    }
    setRecordForm({ record_date: localDate(), record_type: '随访记录', record_text: '' })
    setShowRecordForm(false)
    setNotice('病历文字已保存。')
    await loadPatientData(patientId)
  }

  function askQuestion(event) {
    event.preventDefault()
    if (!question.trim() || !patient) return
    setAnswer(answerQuestion(question.trim(), patient, checkins, records))
  }

  const navLabel = NAV_ITEMS.find((item) => item.id === section)?.label || '总览'

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <a className="brand" href="#home" onClick={() => setSection('home')} aria-label="SyCare 首页">
          <span className="brand-mark">S</span>
          <span><strong>SyCare</strong><small>长辈健康小助手</small></span>
        </a>
        <div className="sidebar-label">我的空间</div>
        <nav className="main-nav" aria-label="主导航">
          {NAV_ITEMS.map((item) => (
            <button key={item.id} className={`nav-item ${section === item.id ? 'active' : ''}`} onClick={() => { setSection(item.id); setNotice('') }}>
              <span className="nav-icon" aria-hidden="true">{item.icon}</span><span>{item.label}</span>
              {item.id === 'ask' && <span className="nav-new">试用</span>}
            </button>
          ))}
        </nav>
        <div className="sidebar-spacer" />
        <div className="sidebar-note">
          <span className="note-icon">✦</span>
          <strong>演示资料</strong>
          <p>当前连接的是模拟数据。请勿填写真实姓名、病历或健康信息。</p>
        </div>
        <div className="sidebar-footer"><span className="status-dot" />数据库已连接 <span className="version">DEMO</span></div>
      </aside>

      <main className="main-area">
        <header className="topbar">
          <div className="breadcrumb"><span>SyCare</span><span className="crumb-divider">/</span><strong>{navLabel}</strong></div>
          <div className="topbar-actions">
            <span className="demo-badge"><span>●</span> 模拟数据演示</span>
            <label className="patient-picker">
              <span className="sr-only">选择长辈</span>
              <span className="avatar">{patient?.display_name?.slice(-1) || '长'}</span>
              <select value={patientId} onChange={(event) => setPatientId(event.target.value)} disabled={!patients.length}>
                {patients.length === 0 && <option value="">暂无档案</option>}
                {patients.map((item) => <option key={item.patient_id} value={item.patient_id}>{item.display_name}</option>)}
              </select>
              <span className="chevron">⌄</span>
            </label>
          </div>
        </header>

        <div className="page-wrap">
          {error && <div className="alert alert-error" role="alert"><span>!</span><div>{error}</div><button aria-label="关闭提示" onClick={() => setError('')}>×</button></div>}
          {notice && <div className="alert alert-success" role="status"><span>✓</span><div>{notice}</div><button aria-label="关闭提示" onClick={() => setNotice('')}>×</button></div>}
          {loading ? <LoadingState /> : patients.length === 0 ? <EmptyPatients onRetry={loadPatients} /> : !patient ? <LoadingState /> : (
            <>
              {section === 'home' && <HomePage patient={patient} checkins={orderedCheckins} records={orderedRecords} loading={patientLoading} onNavigate={setSection} />}
              {section === 'health' && <HealthPage patient={patient} checkins={orderedCheckins} loading={patientLoading} showForm={showCheckinForm} setShowForm={setShowCheckinForm} form={form} setForm={setForm} onSubmit={saveCheckin} saving={saving} />}
              {section === 'care' && <CarePage patient={patient} checkins={orderedCheckins} />}
              {section === 'records' && <RecordsPage patient={patient} records={orderedRecords} showForm={showRecordForm} setShowForm={setShowRecordForm} form={recordForm} setForm={setRecordForm} onSubmit={saveMedicalRecord} saving={saving} />}
              {section === 'summary' && <SummaryPage patient={patient} checkins={orderedCheckins} records={orderedRecords} summary={summary} setSummary={setSummary} />}
              {section === 'ask' && <AskPage patient={patient} question={question} setQuestion={setQuestion} onSubmit={askQuestion} answer={answer} />}
            </>
          )}
          <footer className="page-footer"><span>SyCare 演示版</span><span>记录帮助日常沟通，不用于诊断或治疗决策。</span></footer>
        </div>
      </main>
    </div>
  )
}

function LoadingState() {
  return <div className="loading-card"><span className="spinner" /><div><strong>正在读取资料</strong><p>请稍候片刻</p></div></div>
}

function EmptyPatients({ onRetry }) {
  return <section className="empty-state"><div className="empty-illustration">S</div><h1>还没有长辈档案</h1><p>数据库连接成功，但 patients 表目前没有可显示的资料。</p><button className="button button-primary" onClick={onRetry}>重新读取</button></section>
}

function PageHeading({ eyebrow, title, description, action }) {
  return <div className="page-heading"><div><div className="eyebrow">{eyebrow}</div><h1>{title}</h1><p>{description}</p></div>{action}</div>
}

function HomePage({ patient, checkins, records, loading, onNavigate }) {
  const recent = checkins.slice(0, 7)
  const bpRows = recent.filter((row) => row.capture_status === 'recorded' && row.systolic_mmhg != null && row.diastolic_mmhg != null)
  const latestBp = bpRows[0]
  const sleepRows = recent.filter((row) => row.sleep_hours != null)
  const sleepAverage = average(sleepRows.map((row) => row.sleep_hours))
  const conversationDays = recent.filter((row) => row.wants_to_talk === '愿意').length
  return (
    <>
      <PageHeading eyebrow="长辈档案" title={`早上好，${patient.display_name}`} description="把每天的小记录整理好，复诊时更容易说清楚。" action={<button className="button button-soft" onClick={() => onNavigate('health')}>＋ 记一条健康记录</button>} />
      <div className="profile-strip">
        <div className="profile-avatar">{patient.display_name?.slice(-1) || '长'}</div>
        <div className="profile-main"><strong>{patient.display_name}</strong><span>{patient.age_years ? `${patient.age_years} 岁` : '年龄未记录'}{patient.gender && patient.gender !== '未说明' ? ` · ${patient.gender}` : ''} · 编号 {patient.patient_id}</span></div>
        <div className="profile-meta"><span className="meta-label">居住情况</span><strong>{patient.living_arrangement || '未记录'}</strong></div>
        <div className="profile-meta"><span className="meta-label">分享偏好</span><strong>{patient.sharing_preference || '未记录'}</strong></div>
      </div>

      <div className="section-title-row"><div><h2>最近 7 天</h2><p>只整理已经记录的内容，空白不会按 0 计算。</p></div><button className="text-button" onClick={() => onNavigate('health')}>查看全部记录 <span>→</span></button></div>
      {loading ? <LoadingState /> : (
        <div className="stats-grid">
          <StatCard icon="⌁" tone="blue" label="最近血压" value={latestBp ? `${latestBp.systolic_mmhg} / ${latestBp.diastolic_mmhg}` : '暂无记录'} unit={latestBp ? 'mmHg' : ''} foot={bpRows.length ? `${bpRows.length} 天有完整读数` : '最近 7 条记录'} />
          <StatCard icon="◷" tone="violet" label="平均睡眠" value={sleepAverage == null ? '暂无记录' : sleepAverage.toFixed(1)} unit={sleepAverage == null ? '' : '小时'} foot={`${sleepRows.length} 天填写了睡眠`} />
          <StatCard icon="♡" tone="rose" label="希望交流" value={`${conversationDays} 天`} unit="" foot="根据本人记录的交流意愿" />
          <StatCard icon="▤" tone="green" label="病历资料" value={`${records.length} 份`} unit="" foot="已保存的文字记录" />
        </div>
      )}

      <div className="content-grid home-grid">
        <section className="panel chart-panel">
          <div className="panel-heading"><div><h2>血压记录</h2><p>最近 7 天已录入的读数</p></div><button className="icon-button" title="查看健康记录" onClick={() => onNavigate('health')}>↗</button></div>
          <BloodPressureChart rows={recent} />
          <div className="chart-legend"><span><i className="legend-dot systolic" />收缩压</span><span><i className="legend-dot diastolic" />舒张压</span><span className="chart-footnote">仅展示记录值，不作诊断</span></div>
        </section>
        <section className="panel activity-panel">
          <div className="panel-heading"><div><h2>最近动态</h2><p>健康与关怀记录</p></div></div>
          {recent.length ? <div className="activity-list">{recent.slice(0, 4).map((row) => <ActivityItem key={row.checkin_id} row={row} />)}</div> : <InlineEmpty text="还没有每日记录" />}
          <button className="panel-link" onClick={() => onNavigate('care')}>查看关怀记录 <span>→</span></button>
        </section>
      </div>
      <div className="home-bottom-grid">
        <section className="panel"><div className="panel-heading"><div><h2>档案摘要</h2><p>来自本人或家属的模拟资料</p></div></div><p className="summary-copy">{patient.history_summary || '还没有补充既往情况。'}</p><div className="detail-pair"><span>过敏情况</span><strong>{patient.allergy_status || '未记录'}</strong></div><div className="detail-pair"><span>支持对象</span><strong>{patient.support_person || '未指定'}</strong></div></section>
        <section className="panel visit-card"><div className="visit-badge">复</div><div><h2>准备下一次复诊</h2><p>把最近记录整理成一份可修改的小结草稿。</p><button className="button button-outline" onClick={() => onNavigate('summary')}>开始整理 <span>→</span></button></div></section>
      </div>
    </>
  )
}

function StatCard({ icon, tone, label, value, unit, foot }) {
  return <article className="stat-card"><span className={`stat-icon ${tone}`}>{icon}</span><span className="stat-label">{label}</span><div className="stat-value">{value}<small>{unit}</small></div><div className="stat-foot">{foot}</div></article>
}

function BloodPressureChart({ rows }) {
  const values = [...rows].reverse().filter((row) => row.capture_status === 'recorded' && row.systolic_mmhg != null && row.diastolic_mmhg != null)
  if (!values.length) return <div className="chart-empty"><span>⌁</span><p>最近还没有完整的血压读数</p></div>
  const max = Math.max(180, ...values.map((row) => Number(row.systolic_mmhg)))
  const min = Math.min(50, ...values.map((row) => Number(row.diastolic_mmhg)))
  const scaleY = (value) => 150 - ((Number(value) - min) / (max - min || 1)) * 120
  const step = values.length > 1 ? 560 / (values.length - 1) : 280
  const points = (field) => values.map((row, index) => `${40 + index * step},${scaleY(row[field])}`).join(' ')
  return <div className="chart-wrap"><svg viewBox="0 0 640 190" role="img" aria-label="最近血压记录折线图" preserveAspectRatio="none"><line x1="36" y1="30" x2="36" y2="152" className="chart-axis"/><line x1="36" y1="152" x2="620" y2="152" className="chart-axis"/><line x1="36" y1="91" x2="620" y2="91" className="chart-gridline"/><polyline points={points('systolic_mmhg')} className="chart-line chart-line-sys"/><polyline points={points('diastolic_mmhg')} className="chart-line chart-line-dia"/>{values.map((row, index) => <g key={row.checkin_id}><circle cx={40 + index * step} cy={scaleY(row.systolic_mmhg)} r="4" className="chart-point-sys"/><circle cx={40 + index * step} cy={scaleY(row.diastolic_mmhg)} r="4" className="chart-point-dia"/></g>)}</svg><div className="chart-dates">{values.map((row) => <span key={row.checkin_id}>{shortDate(row.record_date)}</span>)}</div></div>
}

function ActivityItem({ row }) {
  const hasNote = row.self_report_note?.trim()
  return <div className="activity-item"><span className={`activity-mark ${row.wants_to_talk === '愿意' ? 'needs-talk' : ''}`}>{row.wants_to_talk === '愿意' ? '♡' : '•'}</span><div className="activity-copy"><strong>{row.wants_to_talk === '愿意' ? '愿意找人聊聊' : row.mood_response && row.mood_response !== '跳过' ? `心情：${row.mood_response}` : '记了一条日常情况'}</strong><p>{hasNote ? row.self_report_note : `${dateLabel(row.record_date)} · ${row.recorded_by_type === 'family' ? '家属代录' : '本人记录'}`}</p></div><time>{shortDate(row.record_date)}</time></div>
}

function InlineEmpty({ text }) { return <div className="inline-empty">{text}</div> }

function HealthPage({ patient, checkins, loading, showForm, setShowForm, form, setForm, onSubmit, saving }) {
  return <>
    <PageHeading eyebrow="日常记录" title="健康记录" description={`记录 ${patient.display_name} 的血压、脉搏、睡眠和心情。空白表示未填写。`} action={<button className="button button-primary" onClick={() => setShowForm(!showForm)}>{showForm ? '收起表单' : '＋ 新增记录'}</button>} />
    {showForm && <CheckinForm form={form} setForm={setForm} onSubmit={onSubmit} saving={saving} />}
    <section className="panel data-panel"><div className="panel-heading"><div><h2>每日记录</h2><p>共 {checkins.length} 条 · 按日期从新到旧</p></div><span className="subtle-tag">{loading ? '正在更新…' : `${checkins.length} 条记录`}</span></div>
      {checkins.length ? <div className="table-scroll"><table className="data-table"><thead><tr><th>日期</th><th>血压</th><th>脉搏</th><th>睡眠</th><th>心情</th><th>记录人</th><th>状态</th></tr></thead><tbody>{checkins.map((row) => <tr key={row.checkin_id}><td><strong>{dateLabel(row.record_date)}</strong></td><td>{row.systolic_mmhg == null || row.diastolic_mmhg == null ? <span className="muted">未记录</span> : `${row.systolic_mmhg} / ${row.diastolic_mmhg} mmHg`}</td><td>{row.pulse_bpm == null ? '—' : `${row.pulse_bpm} 次/分`}</td><td>{row.sleep_hours == null ? '—' : `${row.sleep_hours} 小时`}</td><td><MoodBadge value={row.mood_response} /></td><td>{row.recorded_by_type === 'family' ? '家属' : '本人'}</td><td><CaptureBadge value={row.capture_status} /></td></tr>)}</tbody></table></div> : <InlineEmpty text="还没有健康记录。可以从上方新增一条模拟记录。" />}
    </section>
  </>
}

function CheckinForm({ form, setForm, onSubmit, saving }) {
  const change = (key) => (event) => setForm((current) => ({ ...current, [key]: event.target.value }))
  return <form className="panel form-panel" onSubmit={onSubmit}><div className="panel-heading"><div><h2>新增每日记录</h2><p>请使用虚构信息进行课堂演示。</p></div><span className="form-step">今日记录</span></div>
    <div className="form-grid"><label className="field"><span>记录日期</span><input type="date" value={form.record_date} onChange={change('record_date')} required /></label><label className="field"><span>记录状态</span><select value={form.capture_status} onChange={change('capture_status')}><option value="recorded">已记录</option><option value="not_recorded">未记录</option><option value="device_error">设备错误</option></select></label><label className="field"><span>收缩压 <small>mmHg</small></span><input type="number" min="50" max="280" placeholder="例如 128" value={form.systolic_mmhg} onChange={change('systolic_mmhg')} /></label><label className="field"><span>舒张压 <small>mmHg</small></span><input type="number" min="20" max="180" placeholder="例如 78" value={form.diastolic_mmhg} onChange={change('diastolic_mmhg')} /></label><label className="field"><span>脉搏 <small>次/分</small></span><input type="number" min="20" max="250" placeholder="选填" value={form.pulse_bpm} onChange={change('pulse_bpm')} /></label><label className="field"><span>睡眠 <small>小时</small></span><input type="number" min="0" max="24" step="0.1" placeholder="选填" value={form.sleep_hours} onChange={change('sleep_hours')} /></label><label className="field"><span>心情</span><select value={form.mood_response} onChange={change('mood_response')}><option value="">跳过此项</option><option>很好</option><option>一般</option><option>不太好</option><option>跳过</option></select></label><label className="field"><span>是否想找人聊聊</span><select value={form.wants_to_talk} onChange={change('wants_to_talk')}><option value="">跳过此项</option><option>愿意</option><option>暂时不需要</option><option>跳过</option></select></label><label className="field"><span>由谁记录</span><select value={form.recorded_by_type} onChange={change('recorded_by_type')}><option value="self">本人</option><option value="family">家属</option></select></label><label className="field field-wide"><span>补充说明 <small>选填</small></span><textarea rows="3" maxLength="500" placeholder="写下希望复诊时记住的情况" value={form.self_report_note} onChange={change('self_report_note')} /></label></div>
    <div className="form-actions"><span>空白读数会保留为空，不会自动填成 0。</span><button className="button button-primary" type="submit" disabled={saving}>{saving ? '正在保存…' : '保存记录'}</button></div>
  </form>
}

function CarePage({ patient, checkins }) {
  const notes = checkins.filter((row) => row.self_report_note || row.wants_to_talk || row.mood_response)
  return <>
    <PageHeading eyebrow="日常陪伴" title="关怀记录" description={`查看 ${patient.display_name} 留下的心情、交流意愿和补充说明。`} action={<span className="subtle-tag">交流意愿不代表已通知家人</span>} />
    <section className="panel care-panel"><div className="panel-heading"><div><h2>关怀时间线</h2><p>来自每日记录，可随时回到健康记录中补充。</p></div><span className="subtle-tag">{notes.length} 条</span></div>
      {notes.length ? <div className="care-timeline">{notes.map((row) => <article className="timeline-card" key={row.checkin_id}><div className="timeline-date"><strong>{new Date(`${row.record_date}T00:00:00`).getDate()}</strong><span>{shortDate(row.record_date)}</span></div><div className="timeline-line" /><div className="timeline-content"><div className="timeline-head"><span className={`mood-pill ${row.wants_to_talk === '愿意' ? 'talk-pill' : ''}`}>{row.wants_to_talk === '愿意' ? '♡ 想找人聊聊' : row.mood_response && row.mood_response !== '跳过' ? `心情 · ${row.mood_response}` : '日常记录'}</span><span className="timeline-by">{row.recorded_by_type === 'family' ? '家属代录' : '本人记录'}</span></div><p>{row.self_report_note || (row.wants_to_talk === '愿意' ? '本人表示愿意交流。' : '未填写补充说明。')}</p>{row.sleep_hours != null && <span className="timeline-detail">睡眠 {row.sleep_hours} 小时</span>}</div></article>)}</div> : <InlineEmpty text="还没有关怀内容。新增每日记录后，心情和交流意愿会显示在这里。" />}
    </section>
  </>
}

function RecordsPage({ patient, records, showForm, setShowForm, form, setForm, onSubmit, saving }) {
  return <>
    <PageHeading eyebrow="资料收纳" title="病历资料" description={`查看和整理 ${patient.display_name} 的模拟病历文字。`} action={<button className="button button-primary" onClick={() => setShowForm(!showForm)}>{showForm ? '收起表单' : '＋ 新增病历'}</button>} />
    <div className="storage-note"><span>i</span><div><strong>当前版本保存文字记录</strong><p>PDF 原件上传和私有文件存储尚未接入。不要在这里填写真实病历。</p></div></div>
    {showForm && <form className="panel form-panel" onSubmit={onSubmit}><div className="panel-heading"><div><h2>新增病历文字</h2><p>仅添加课堂模拟内容。</p></div></div><div className="form-grid"><label className="field"><span>记录日期</span><input type="date" required value={form.record_date} onChange={(event) => setForm((current) => ({ ...current, record_date: event.target.value }))} /></label><label className="field"><span>记录类型</span><select value={form.record_type} onChange={(event) => setForm((current) => ({ ...current, record_type: event.target.value }))}><option>建档记录</option><option>随访记录</option><option>检查记录</option><option>其他</option></select></label><label className="field field-wide"><span>病历文字</span><textarea rows="6" maxLength="5000" required placeholder="输入模拟病历或复诊时要说明的情况" value={form.record_text} onChange={(event) => setForm((current) => ({ ...current, record_text: event.target.value }))} /></label></div><div className="form-actions"><span>保存后会在当前长辈的病历列表中显示。</span><button className="button button-primary" type="submit" disabled={saving}>{saving ? '正在保存…' : '保存病历'}</button></div></form>}
    <section className="record-list">{records.length ? records.map((record) => <article className="panel record-card" key={record.record_id}><div className="record-icon">▤</div><div className="record-body"><div className="record-title-row"><div><span className="record-type">{record.record_type || '病历记录'}</span><h2>{record.source_label || '病历文字'}</h2></div><time>{dateLabel(record.record_date)}</time></div><details><summary>查看记录内容 <span>⌄</span></summary><p className="record-text">{record.record_text}</p></details></div></article>) : <section className="panel"><InlineEmpty text="还没有病历资料。可以新增一份模拟文字记录。" /></section>}</section>
  </>
}

function SummaryPage({ patient, checkins, records, summary, setSummary }) {
  const [range, setRange] = useState(7)
  const draft = useMemo(() => buildSummary(patient, checkins, range, records), [patient, checkins, range, records])
  useEffect(() => setSummary(draft), [draft, setSummary])
  const copyText = async () => {
    try { await navigator.clipboard.writeText(summary); window.alert('小结已复制。') }
    catch { window.alert('浏览器未允许复制，请选中小结文字手动复制。') }
  }
  return <>
    <PageHeading eyebrow="复诊准备" title="复诊小结" description="先汇总已记录的信息，再由本人或家属核对、修改后使用。" action={<button className="button button-primary no-print" onClick={() => window.print()}>打印 / 保存 PDF</button>} />
    <div className="summary-banner"><span className="summary-banner-icon">✧</span><div><strong>这是一份可修改的草稿</strong><p>它只整理已有记录，不提供诊断、用药或治疗建议。</p></div></div>
    <div className="summary-toolbar no-print"><label>统计范围 <select value={range} onChange={(event) => setRange(Number(event.target.value))}><option value="7">最近 7 天</option><option value="30">最近 30 天</option></select></label><span>{patient.display_name} · {patient.patient_id}</span></div>
    <section className="panel summary-panel"><div className="summary-paper-head"><div className="paper-logo">S</div><div><strong>复诊准备小结</strong><span>SyCare 模拟资料 · 请核对后使用</span></div><span className="paper-date">整理日期 {dateLabel(localDate())}</span></div><textarea aria-label="可编辑的复诊小结" value={summary} onChange={(event) => setSummary(event.target.value)} rows="17" /><div className="form-actions no-print"><span>文字可编辑，打印前请核对日期、读数和来源。</span><button className="button button-outline" onClick={copyText}>复制小结</button></div></section>
    <section className="source-list"><h2>本次草稿引用的资料</h2><div className="source-pills">{checkins.slice(0, range).map((row) => <span key={row.checkin_id}>{dateLabel(row.record_date)} · 每日记录</span>)}{records.slice(0, 3).map((row) => <span key={row.record_id}>{dateLabel(row.record_date)} · {row.record_type || '病历'}</span>)}</div></section>
  </>
}

function AskPage({ patient, question, setQuestion, onSubmit, answer }) {
  return <>
    <PageHeading eyebrow="资料问答" title="问一问" description={`围绕 ${patient.display_name} 的模拟记录提问，回答会附上使用的资料日期。`} />
    <div className="ask-layout"><section className="panel ask-panel"><div className="ask-intro"><div className="ask-sparkle">✳</div><div><h2>你好，我是 SyCare</h2><p>我可以帮你找到已记录的日期和内容；不知道的会说明，不会替医生作决定。</p></div></div><div className="suggestion-row"><span>可以试试</span>{['最近睡眠怎么样？', '最近记录了哪些血压？', '病历里写了什么？'].map((item) => <button key={item} className="suggestion" onClick={() => setQuestion(item)}>{item}</button>)}</div><form className="ask-form" onSubmit={onSubmit}><label className="sr-only" htmlFor="question-input">输入问题</label><textarea id="question-input" rows="3" maxLength="500" placeholder="例如：最近一周睡眠情况如何？" value={question} onChange={(event) => setQuestion(event.target.value)} /><div className="ask-form-bottom"><span>仅查询当前选中长辈的记录</span><button className="button button-primary" type="submit" disabled={!question.trim()}>查看回答 <span>→</span></button></div></form>{answer && <article className="answer-card"><div className="answer-heading"><span className="answer-avatar">S</span><div><strong>SyCare 整理结果</strong><span>根据已保存的模拟资料</span></div></div><p>{answer.text}</p>{answer.sources?.length > 0 && <div className="answer-sources"><strong>资料来源</strong>{answer.sources.map((source) => <span key={source}>{source}</span>)}</div>}</article>}</section><aside className="ask-side"><section className="panel"><span className="side-icon">⌕</span><h2>回答范围</h2><p>回答只引用当前选中长辈的记录。若记录里没有答案，我会告诉你缺少什么。</p></section><section className="panel caution-panel"><span className="caution-icon">!</span><h2>健康问题请咨询医生</h2><p>我不会诊断疾病、建议调药或判断是否需要治疗。紧急情况请联系当地急救服务或医生。</p></section></aside></div>
  </>
}

function MoodBadge({ value }) {
  if (!value || value === '跳过') return <span className="muted">未填写</span>
  return <span className={`mood-badge ${value === '不太好' ? 'mood-low' : value === '很好' ? 'mood-good' : ''}`}>{value}</span>
}

function CaptureBadge({ value }) {
  const labels = { recorded: ['已记录', 'capture-recorded'], not_recorded: ['未记录', 'capture-missing'], device_error: ['设备错误', 'capture-error'] }
  const [label, cls] = labels[value] || ['未知', '']
  return <span className={`capture-badge ${cls}`}>{label}</span>
}

function buildSummary(patient, checkins, days, records = []) {
  if (!patient) return ''
  const cutoff = new Date()
  cutoff.setHours(0, 0, 0, 0)
  cutoff.setDate(cutoff.getDate() - (days - 1))
  const periodRows = checkins.filter((row) => new Date(`${row.record_date}T00:00:00`) >= cutoff)
  const bpRows = periodRows.filter((row) => row.capture_status === 'recorded' && row.systolic_mmhg != null && row.diastolic_mmhg != null)
  const sleepRows = periodRows.filter((row) => row.sleep_hours != null)
  const avgSys = average(bpRows.map((row) => row.systolic_mmhg))
  const avgDia = average(bpRows.map((row) => row.diastolic_mmhg))
  const avgSleep = average(sleepRows.map((row) => row.sleep_hours))
  const wantsTalk = periodRows.filter((row) => row.wants_to_talk === '愿意')
  const recentRecords = records.slice(0, 3)
  return [
    `姓名：${patient.display_name}（模拟资料，编号 ${patient.patient_id}）`,
    `年龄：${patient.age_years ? `${patient.age_years} 岁` : '未记录'}　性别：${patient.gender || '未记录'}`,
    `整理范围：最近 ${days} 天（${periodRows.length ? dateLabel(periodRows.at(-1)?.record_date) : '暂无记录'} 至 ${periodRows.length ? dateLabel(periodRows[0]?.record_date) : '暂无记录'}）`,
    '',
    '一、日常记录',
    `• 血压：${bpRows.length ? `有 ${bpRows.length} 天完整读数，收缩压均值约 ${avgSys.toFixed(1)} mmHg，舒张压均值约 ${avgDia.toFixed(1)} mmHg。` : '此范围内没有完整血压读数。'}`,
    `• 睡眠：${sleepRows.length ? `${sleepRows.length} 天填写了睡眠，平均约 ${avgSleep.toFixed(1)} 小时。` : '此范围内没有睡眠时长记录。'}`,
    `• 交流意愿：${wantsTalk.length ? `${wantsTalk.length} 天记录为“愿意交流”。这只是意愿记录，不代表已经通知他人。` : '此范围内没有“愿意交流”的记录。'}`,
    '',
    '二、既往情况与过敏',
    `• 既往情况：${patient.history_summary || '未记录。'}`,
    `• 过敏情况：${patient.allergy_status || '未记录。'}`,
    '',
    '三、病历资料',
    recentRecords.length ? recentRecords.map((record) => `• ${dateLabel(record.record_date)} ${record.record_type || '病历'}：${record.record_text.replace(/\s+/g, ' ').slice(0, 150)}${record.record_text.length > 150 ? '…' : ''}`).join('\n') : '• 暂无病历文字资料。',
    '',
    '请本人或家属核对以上内容；未记录的信息保持未知。此草稿用于复诊沟通，不是诊断或治疗建议。',
  ].join('\n')
}

function answerQuestion(question, patient, checkins, records) {
  const normalized = question.toLowerCase()
  if (/调药|加药|减药|药量|剂量|吃几片|能不能吃药|诊断|是不是.*病|治疗方案|处方/.test(question)) {
    return { text: '我不能根据这些模拟记录判断疾病，也不能建议加减药或治疗。请把药盒、医生处方和最近记录带给医生或药师核对。', sources: [] }
  }
  const recent = checkins.slice(0, 30)
  if (/血压|收缩压|舒张压/.test(question)) {
    const rows = recent.filter((row) => row.capture_status === 'recorded' && row.systolic_mmhg != null && row.diastolic_mmhg != null)
    if (!rows.length) return { text: '当前资料里没有完整的血压读数。设备错误或未记录的项目不会被当成 0。', sources: [] }
    const sys = average(rows.map((row) => row.systolic_mmhg))
    const dia = average(rows.map((row) => row.diastolic_mmhg))
    const latest = rows[0]
    return { text: `最近 30 条日常记录里，有 ${rows.length} 天记录了完整血压。最新一条是 ${dateLabel(latest.record_date)}：${latest.systolic_mmhg}/${latest.diastolic_mmhg} mmHg；这批记录的平均值约为 ${sys.toFixed(1)}/${dia.toFixed(1)} mmHg。这里只整理记录，不判断是否正常。`, sources: rows.slice(0, 5).map((row) => dateLabel(row.record_date)) }
  }
  if (/睡眠|睡觉|睡了多久|休息/.test(question)) {
    const rows = recent.filter((row) => row.sleep_hours != null)
    if (!rows.length) return { text: '当前资料里没有睡眠时长记录。', sources: [] }
    const mean = average(rows.map((row) => row.sleep_hours))
    return { text: `最近 30 条日常记录中，有 ${rows.length} 天填写了睡眠时长，平均约 ${mean.toFixed(1)} 小时。这个结果只汇总本人填写的数据，不代表睡眠评估。`, sources: rows.slice(0, 5).map((row) => dateLabel(row.record_date)) }
  }
  if (/病历|既往|过敏|医院|检查/.test(question)) {
    if (!records.length && !patient.history_summary && !patient.allergy_status) return { text: '当前档案还没有病历、既往情况或过敏资料。', sources: [] }
    const source = records.slice(0, 3).map((row) => `${dateLabel(row.record_date)} ${row.record_type || '病历'}`)
    const text = [patient.history_summary && `档案摘要：${patient.history_summary}`, patient.allergy_status && `过敏情况：${patient.allergy_status}`, ...records.slice(0, 2).map((row) => `${dateLabel(row.record_date)}：${row.record_text.replace(/\s+/g, ' ').slice(0, 180)}${row.record_text.length > 180 ? '…' : ''}`)].filter(Boolean).join('；')
    return { text: `${text} 请以原始资料和医生核对为准。`, sources: source }
  }
  if (/心情|交流|聊天|关怀|想说话/.test(normalized)) {
    const willing = recent.filter((row) => row.wants_to_talk === '愿意')
    const mood = recent.find((row) => row.mood_response && row.mood_response !== '跳过')
    return { text: `${willing.length ? `最近 30 条记录中有 ${willing.length} 天填写“愿意交流”。` : '最近 30 条记录中没有填写“愿意交流”的日期。'}${mood ? ` 最近填写的心情是 ${mood.mood_response}（${dateLabel(mood.record_date)}）。` : ''} 交流意愿只表示记录中的选择，不会自动通知家人。`, sources: [...willing.slice(0, 4).map((row) => dateLabel(row.record_date)), ...(mood ? [dateLabel(mood.record_date)] : [])] }
  }
  return { text: '我目前可以查找血压、睡眠、心情、交流意愿、既往情况和病历文字。你也可以换一种更具体的问法。', sources: [] }
}

export default App
