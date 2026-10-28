import { useCallback, useEffect, useMemo, useState } from 'react'
import { isSupabaseConfigured, supabase } from './lib/supabase'
import { displayPatientName, localDate } from './lib/format'
import { ASSISTANT_NAME, openingLine } from './lib/assistant'
import {
  getDoctorQuestions, getItemConfig, getMedLog, getMedications, getSmsOutbox, getSmsSettings, getVisitDate, medSlots, queueSms,
  saveDoctorQuestions, saveItemConfig, saveMedications, savePhoto, saveSmsSettings, saveVisitDate, setMedTaken,
} from './lib/localStore'
import { markRecordVerified, saveMeasurement, savePhotoRecord, saveTextRecord, saveTodayCheckin } from './lib/records'
import { SYMPTOM_KEY, resolveItems } from './lib/items'
import ElderHome from './elder/ElderHome'
import ElderHistory from './elder/ElderHistory'
import ElderChat from './elder/ElderChat'
import FamilyMode from './family/FamilyMode'

function App() {
  const [mode, setMode] = useState('elder')
  const [chatOpen, setChatOpen] = useState(false)
  const [elderPage, setElderPage] = useState('today')
  const [patients, setPatients] = useState([])
  const [patientId, setPatientId] = useState('')
  const [checkins, setCheckins] = useState([])
  const [records, setRecords] = useState([])
  const [measurements, setMeasurements] = useState([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  // 演示版保存在本机浏览器里的内容
  const [meds, setMeds] = useState([])
  const [itemConfig, setItemConfig] = useState([])
  const [medLog, setMedLog] = useState({})
  const [visitDate, setVisitDate] = useState('')
  const [questions, setQuestions] = useState([])
  const [sms, setSms] = useState({ notifyFamily: false })
  const [outbox, setOutbox] = useState([])

  const today = localDate()
  const patient = useMemo(() => patients.find((item) => item.patient_id === patientId) || null, [patients, patientId])
  const todayRow = useMemo(() => checkins.find((row) => row.record_date === today) || null, [checkins, today])
  const items = useMemo(() => resolveItems(itemConfig), [itemConfig])
  const slots = useMemo(() => medSlots(meds).map((slot) => ({ ...slot, taken: Boolean(medLog[slot.id]) })), [meds, medLog])

  const loadPatients = useCallback(async () => {
    if (!isSupabaseConfigured) {
      setError('还没有配置 Supabase 连接信息。请在 web/.env.local 中填写项目 URL 和 Publishable key。')
      setLoading(false)
      return
    }
    const { data, error: queryError } = await supabase.from('patients').select('*').order('patient_id')
    if (queryError) setError(`读取老人档案失败：${queryError.message}`)
    else setPatients(data || [])
    setPatientId((current) => current || data?.[0]?.patient_id || '')
    setLoading(false)
  }, [])

  const loadPatientData = useCallback(async (id) => {
    if (!id || !supabase) return
    const [checkinResult, recordResult, measurementResult] = await Promise.all([
      supabase.from('daily_checkins').select('*').eq('patient_id', id).order('record_date', { ascending: false }),
      supabase.from('medical_records').select('*').eq('patient_id', id).order('record_date', { ascending: false }),
      supabase.from('measurements').select('*').eq('patient_id', id)
        .order('record_date', { ascending: false }).order('created_at', { ascending: false }).limit(300),
    ])
    if (checkinResult.error || recordResult.error) {
      setError(`读取${checkinResult.error ? '健康记录' : '病历'}失败：${(checkinResult.error || recordResult.error).message}`)
      return
    }
    setCheckins(checkinResult.data || [])
    setRecords(recordResult.data || [])
    // measurements 表还没建好时不影响其他功能
    if (measurementResult.error) console.warn('读取其他记录项目失败：', measurementResult.error.message)
    setMeasurements(measurementResult.data || [])
  }, [])

  useEffect(() => { loadPatients() }, [loadPatients])
  useEffect(() => { loadPatientData(patientId) }, [patientId, loadPatientData])

  useEffect(() => {
    if (!patient) return
    setMeds(getMedications(patient))
    setItemConfig(getItemConfig(patient))
    setMedLog(getMedLog(patient.patient_id, today))
    setVisitDate(getVisitDate(patient.patient_id))
    setQuestions(getDoctorQuestions(patient.patient_id))
    setSms(getSmsSettings(patient.patient_id))
    setOutbox(getSmsOutbox(patient.patient_id))
  }, [patient, today])

  const opening = useMemo(
    () => (patient ? openingLine({ patient, todayRow, slots, visitDate, questions, today, items, measurements }) : { bubble: '', text: '' }),
    [patient, todayRow, slots, visitDate, questions, today, items, measurements],
  )

  const clearAlerts = () => { setError(''); setNotice('') }

  function changePatient(id) {
    setPatientId(id)
    setChatOpen(false)
    setElderPage('today')
    clearAlerts()
  }

  function toggleMed(slotId, taken) {
    setMedLog({ ...setMedTaken(patient.patient_id, today, slotId, taken) })
  }

  // 对话里说"药吃过了"：给已经到点、还没打卡的药打卡；都没到点就给下一次打卡
  function markDueMedsTaken() {
    const now = new Date()
    const clock = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`
    const open = slots.filter((slot) => !slot.taken)
    const due = open.filter((slot) => slot.time <= clock)
    const targets = due.length ? due : open.slice(0, 1)
    let log = medLog
    targets.forEach((slot) => { log = setMedTaken(patient.patient_id, today, slot.id, true) })
    setMedLog({ ...log })
    return targets.map((slot) => `${slot.time} ${slot.med.name}`)
  }

  // 首页直接填写和跟小安说，都走这里保存。
  // 血压、睡眠、心情存每日记录；其他项目和"哪里不舒服"每次存一行
  async function saveEntry({ fields = {}, measures = [], symptoms = [] }) {
    setSaving(true)
    let saveError = null
    if (Object.keys(fields).length) saveError = await saveTodayCheckin(patient, todayRow, fields)
    for (const { item, value, tag } of measures) {
      if (saveError) break
      saveError = await saveMeasurement(patient, { key: item.key, label: item.label, unit: item.unit, value, text: tag || null })
    }
    if (!saveError && symptoms.length) {
      saveError = await saveMeasurement(patient, { key: SYMPTOM_KEY, label: '哪里不舒服', text: symptoms.join('、') })
    }
    setSaving(false)
    await loadPatientData(patient.patient_id)
    return saveError
  }

  async function setMood(value) {
    const saveError = await saveEntry({ fields: { mood_response: value } })
    if (saveError) setError(`心情没有保存成功：${saveError.message}`)
  }

  async function savePhotoUpload(photo) {
    const { error: saveError, recordId } = await savePhotoRecord(patient, { recordType: photo.type, recordDate: photo.date })
    if (saveError) return saveError
    if (!savePhoto(recordId, photo.dataUrl)) setNotice('病历已保存，但这台设备空间不够，原图没有存下来。')
    if (photo.type === '处方' && sms.notifyFamily) {
      queueSms(patient.patient_id, `${displayPatientName(patient.display_name)}上传了一张新处方，请帮忙确认用药清单。`)
      setOutbox(getSmsOutbox(patient.patient_id))
    }
    await loadPatientData(patient.patient_id)
    return null
  }

  function addDoctorQuestion(text) {
    const next = [...questions, { id: crypto.randomUUID(), text, date: today }]
    saveDoctorQuestions(patient.patient_id, next)
    setQuestions(next)
  }

  function changeQuestions(next) {
    saveDoctorQuestions(patient.patient_id, next)
    setQuestions(next)
  }

  async function verifyRecord(record) {
    setSaving(true)
    const saveError = await markRecordVerified(record)
    setSaving(false)
    if (saveError) { setError(`没有标记成功：${saveError.message}`); return }
    setNotice('已标为已核对。')
    await loadPatientData(patient.patient_id)
  }

  async function addTextRecord(form) {
    setSaving(true)
    const saveError = await saveTextRecord(patient, form)
    setSaving(false)
    if (saveError) { setError(`保存病历失败：${saveError.message}`); return false }
    setNotice('病历文字已保存。')
    await loadPatientData(patient.patient_id)
    return true
  }

  function changeMeds(next) {
    saveMedications(patient.patient_id, next)
    setMeds(next)
    setNotice('用药清单已更新，老人首页会同步显示。')
  }

  function changeItems(next) {
    saveItemConfig(patient.patient_id, next)
    setItemConfig(next)
    setNotice('记录项目已更新，老人首页会同步显示。')
  }

  function changeVisitDate(date) {
    saveVisitDate(patient.patient_id, date)
    setVisitDate(date)
  }

  function changeSms(next) {
    saveSmsSettings(patient.patient_id, next)
    setSms(next)
  }

  function queueDemoSms(text, skip) {
    if (skip) { setNotice(text); return }
    queueSms(patient.patient_id, text)
    setOutbox(getSmsOutbox(patient.patient_id))
  }

  if (loading) {
    return <div className="elder-status"><span className="spinner" /><p>正在打开，请稍候…</p></div>
  }

  if (!patient) {
    return (
      <div className="elder-status">
        <p>{error || '还没有长辈档案。'}</p>
        <button className="elder-primary" onClick={() => { setLoading(true); setError(''); loadPatients() }}>再试一次</button>
      </div>
    )
  }

  if (mode === 'family') {
    return (
      <FamilyMode
        patient={patient}
        patients={patients}
        patientId={patientId}
        onPatientChange={changePatient}
        checkins={checkins}
        records={records}
        saving={saving}
        error={error}
        notice={notice}
        clearAlerts={clearAlerts}
        onExit={() => { setMode('elder'); clearAlerts() }}
        onVerify={verifyRecord}
        onAddTextRecord={addTextRecord}
        meds={meds}
        slots={slots}
        items={items}
        itemConfig={itemConfig}
        onItemsChange={changeItems}
        measurements={measurements}
        onMedsChange={changeMeds}
        visitDate={visitDate}
        onVisitDateChange={changeVisitDate}
        questions={questions}
        onQuestionsChange={changeQuestions}
        sms={sms}
        onSmsChange={changeSms}
        outbox={outbox}
        onQueueSms={queueDemoSms}
      />
    )
  }

  return (
    <div className="elder-shell">
      {error && <div className="elder-alert" role="alert">{error}<button onClick={clearAlerts} aria-label="关闭提示">×</button></div>}
      {notice && <div className="elder-alert ok" role="status">{notice}<button onClick={clearAlerts} aria-label="关闭提示">×</button></div>}
      {elderPage === 'today' ? (
        <ElderHome
          patient={patient}
          todayRow={todayRow}
          slots={slots}
          items={items}
          measurements={measurements}
          opening={opening}
          saving={saving}
          onToggleMed={toggleMed}
          onSetMood={setMood}
          onSave={saveEntry}
          onOpenChat={() => setChatOpen(true)}
          onOpenFamily={() => { setMode('family'); setChatOpen(false) }}
        />
      ) : (
        <ElderHistory checkins={checkins} items={items} measurements={measurements} />
      )}
      <nav className="elder-tabs" aria-label="老人模式导航">
        <button className={elderPage === 'today' ? 'active' : ''} onClick={() => setElderPage('today')}><span aria-hidden="true">☀</span>今天</button>
        <button className={elderPage === 'history' ? 'active' : ''} onClick={() => setElderPage('history')}><span aria-hidden="true">▤</span>我的记录</button>
        <button onClick={() => setChatOpen(true)}><span aria-hidden="true">💬</span>问{ASSISTANT_NAME}</button>
      </nav>
      <footer className="demo-bar">
        <span>课堂演示 · 只用模拟资料</span>
        <label>
          切换长辈
          <select value={patientId} onChange={(event) => changePatient(event.target.value)}>
            {patients.map((item) => <option key={item.patient_id} value={item.patient_id}>{displayPatientName(item.display_name)}</option>)}
          </select>
        </label>
      </footer>
      {chatOpen && (
        <ElderChat
          key={patientId}
          patient={patient}
          context={{ patient, checkins, records, todayRow, slots, items, measurements }}
          opening={opening}
          smsEnabled={sms.notifyFamily}
          onClose={() => setChatOpen(false)}
          onSaveEntry={saveEntry}
          onMedsTaken={markDueMedsTaken}
          onSavePhoto={savePhotoUpload}
          onAddDoctorQuestion={addDoctorQuestion}
        />
      )}
    </div>
  )
}

export default App
