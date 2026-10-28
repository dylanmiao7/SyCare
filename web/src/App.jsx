import { useCallback, useEffect, useMemo, useState } from 'react'
import { isSupabaseConfigured, supabase } from './lib/supabase'
import { displayPatientName, localDate } from './lib/format'
import { openingLine } from './lib/assistant'
import {
  getDoctorQuestions, getMedLog, getMedications, getSmsOutbox, getSmsSettings, getVisitDate, medSlots, queueSms,
  saveDoctorQuestions, saveMedications, savePhoto, saveSmsSettings, saveVisitDate, setMedTaken,
} from './lib/localStore'
import { markRecordVerified, savePhotoRecord, saveTextRecord, saveTodayCheckin } from './lib/records'
import ElderHome from './elder/ElderHome'
import ElderChat from './elder/ElderChat'
import FamilyMode from './family/FamilyMode'

function App() {
  const [mode, setMode] = useState('elder')
  const [chatOpen, setChatOpen] = useState(false)
  const [patients, setPatients] = useState([])
  const [patientId, setPatientId] = useState('')
  const [checkins, setCheckins] = useState([])
  const [records, setRecords] = useState([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  // 演示版保存在本机浏览器里的内容
  const [meds, setMeds] = useState([])
  const [medLog, setMedLog] = useState({})
  const [visitDate, setVisitDate] = useState('')
  const [questions, setQuestions] = useState([])
  const [sms, setSms] = useState({ notifyFamily: false })
  const [outbox, setOutbox] = useState([])

  const today = localDate()
  const patient = useMemo(() => patients.find((item) => item.patient_id === patientId) || null, [patients, patientId])
  const todayRow = useMemo(() => checkins.find((row) => row.record_date === today) || null, [checkins, today])
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
    const [checkinResult, recordResult] = await Promise.all([
      supabase.from('daily_checkins').select('*').eq('patient_id', id).order('record_date', { ascending: false }),
      supabase.from('medical_records').select('*').eq('patient_id', id).order('record_date', { ascending: false }),
    ])
    if (checkinResult.error || recordResult.error) {
      setError(`读取${checkinResult.error ? '健康记录' : '病历'}失败：${(checkinResult.error || recordResult.error).message}`)
      return
    }
    setCheckins(checkinResult.data || [])
    setRecords(recordResult.data || [])
  }, [])

  useEffect(() => { loadPatients() }, [loadPatients])
  useEffect(() => { loadPatientData(patientId) }, [patientId, loadPatientData])

  useEffect(() => {
    if (!patient) return
    setMeds(getMedications(patient))
    setMedLog(getMedLog(patient.patient_id, today))
    setVisitDate(getVisitDate(patient.patient_id))
    setQuestions(getDoctorQuestions(patient.patient_id))
    setSms(getSmsSettings(patient.patient_id))
    setOutbox(getSmsOutbox(patient.patient_id))
  }, [patient, today])

  const opening = useMemo(
    () => (patient ? openingLine({ patient, todayRow, slots, visitDate, questions, today }) : { bubble: '', text: '' }),
    [patient, todayRow, slots, visitDate, questions, today],
  )

  const clearAlerts = () => { setError(''); setNotice('') }

  function changePatient(id) {
    setPatientId(id)
    setChatOpen(false)
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

  async function saveCheckin(fields) {
    setSaving(true)
    const saveError = await saveTodayCheckin(patient, todayRow, fields)
    setSaving(false)
    if (!saveError) await loadPatientData(patient.patient_id)
    return saveError
  }

  async function setMood(value) {
    const saveError = await saveCheckin({ mood_response: value })
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
      <ElderHome
        patient={patient}
        todayRow={todayRow}
        slots={slots}
        opening={opening}
        saving={saving}
        onToggleMed={toggleMed}
        onSetMood={setMood}
        onOpenChat={() => setChatOpen(true)}
        onOpenFamily={() => { setMode('family'); setChatOpen(false) }}
      />
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
          context={{ patient, checkins, records, todayRow, slots }}
          opening={opening}
          smsEnabled={sms.notifyFamily}
          onClose={() => setChatOpen(false)}
          onSaveCheckin={saveCheckin}
          onMedsTaken={markDueMedsTaken}
          onSavePhoto={savePhotoUpload}
          onAddDoctorQuestion={addDoctorQuestion}
        />
      )}
    </div>
  )
}

export default App
