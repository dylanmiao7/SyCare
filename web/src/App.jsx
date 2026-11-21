import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { isSupabaseConfigured, supabase } from './lib/supabase'
import { displayPatientName, localDate } from './lib/format'
import { ASSISTANT_NAME, openingLine } from './lib/assistant'
import {
  addReminderLog, getCaregivers, getContactLog, getDoctorQuestions, getItemConfig, getLastChatDate, getMedLog, getMedications, getReminderLog, getReminderSettings,
  getSmsOutbox, getSmsSettings, getVisitDate, medSlots, queueSms,
  saveCaregivers, saveContactLog, saveDoctorQuestions, saveItemConfig, saveLastChatDate, saveMedications, savePhoto, saveReminderSettings, saveSmsSettings,
  saveVisitDate, setMedTaken,
} from './lib/localStore'
import { dueReminders, inQuietHours, nextReminder } from './lib/reminders'
import { notificationStatus, onNotificationClick, registerServiceWorker, requestNotifications, showNotification } from './lib/notify'
import { markRecordVerified, saveMeasurement, savePhotoRecord, saveTextRecord, saveTodayCheckin } from './lib/records'
import { SYMPTOM_KEY, resolveItems } from './lib/items'
import ElderHome from './elder/ElderHome'
import ElderHistory from './elder/ElderHistory'
import ElderChat from './elder/ElderChat'
import FamilyMode from './family/FamilyMode'

function App() {
  const [mode, setMode] = useState('elder')
  // 老人端三个页面：今天 / 问小安 / 我的记录。一天里问小安最频繁，所以默认打开它；切换页面时对话不丢
  const [elderPage, setElderPage] = useState('chat')
  // 这位老人的记录读完后才开始对话，小安的开场白才准确
  const [loadedPatientId, setLoadedPatientId] = useState('')
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
  const [caregivers, setCaregivers] = useState([])
  const [contactLog, setContactLog] = useState([])
  const [reminderSettings, setReminderSettings] = useState(null)
  const [reminderLog, setReminderLog] = useState([])
  const [reminder, setReminder] = useState(null)
  const [reminderBanner, setReminderBanner] = useState(null)
  const [notifyStatus, setNotifyStatus] = useState(notificationStatus)

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
      setLoadedPatientId(id)
      return
    }
    setCheckins(checkinResult.data || [])
    setRecords(recordResult.data || [])
    // measurements 表还没建好时不影响其他功能
    if (measurementResult.error) console.warn('读取其他记录项目失败：', measurementResult.error.message)
    setMeasurements(measurementResult.data || [])
    setLoadedPatientId(id)
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
    setCaregivers(getCaregivers(patient))
    setContactLog(getContactLog(patient.patient_id))
    setReminderSettings(getReminderSettings(patient.patient_id))
    setReminderLog(getReminderLog(patient.patient_id, today))
  }, [patient, today])

  // 已经允许过通知，就启动 service worker；点通知回到"问小安"
  useEffect(() => {
    if (notificationStatus() === 'granted') registerServiceWorker()
    return onNotificationClick(() => { setMode('elder'); setElderPage('chat'); setReminderBanner(null) })
  }, [])

  // 主动提醒：打开时、每分钟、切回网页时，按规则看看有没有该说的话
  const reminderCheck = useRef(() => {})
  reminderCheck.current = () => {
    if (!patient || !reminderSettings || loadedPatientId !== patientId || inQuietHours(reminderSettings)) return
    const due = dueReminders({ checkins, measurements, items, lastChatDate: getLastChatDate(patient.patient_id) })
    const next = nextReminder(due, reminderSettings, getReminderLog(patient.patient_id, today))
    if (!next) return
    setReminderLog(addReminderLog(patient.patient_id, today, { key: next.key, title: next.title, at: new Date().toISOString() }))
    setReminder({ ...next, id: Date.now() })
    // 网页在后台：弹系统通知。网页开着但不在"问小安"：页面上方显示一条，点了去听
    if (document.hidden) showNotification({ title: next.title, body: next.text, key: next.key })
    else if (elderPage !== 'chat') setReminderBanner(next)
  }

  useEffect(() => {
    const run = () => reminderCheck.current()
    // 切回网页时马上看一次；切走（包括关网页、刷新）时不看，免得提醒还没人看到就算发过了
    const onVisible = () => { if (!document.hidden) run() }
    run()
    const timer = setInterval(run, 60 * 1000)
    document.addEventListener('visibilitychange', onVisible)
    return () => { clearInterval(timer); document.removeEventListener('visibilitychange', onVisible) }
  }, [loadedPatientId, patientId, checkins, measurements, reminderSettings])

  async function enableNotifications() {
    const result = await requestNotifications()
    setNotifyStatus(result)
    return result
  }

  function testNotification() {
    showNotification({ title: '试一下', body: '提醒已经打开了。以后有需要的时候，小安会这样提醒您。', key: 'test' })
  }

  function changeReminderSettings(next) {
    saveReminderSettings(patient.patient_id, next)
    setReminderSettings(next)
  }

  function markChatted() {
    if (getLastChatDate(patient.patient_id) !== today) saveLastChatDate(patient.patient_id, today)
  }

  const opening = useMemo(
    () => (patient ? openingLine({ patient, todayRow, slots, visitDate, questions, today, items, measurements }) : { bubble: '', text: '' }),
    [patient, todayRow, slots, visitDate, questions, today, items, measurements],
  )

  const clearAlerts = () => { setError(''); setNotice('') }

  function changePatient(id) {
    setPatientId(id)
    setReminder(null)
    setReminderBanner(null)
    setElderPage('chat')
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
    setNotice('用药清单已更新，老人的"今天"页会同步显示。')
  }

  function changeItems(next) {
    saveItemConfig(patient.patient_id, next)
    setItemConfig(next)
    setNotice('记录项目已更新，老人的"今天"页会同步显示。')
  }

  function changeVisitDate(date) {
    saveVisitDate(patient.patient_id, date)
    setVisitDate(date)
  }

  function changeCaregivers(next) {
    saveCaregivers(patient.patient_id, next)
    setCaregivers(next)
  }

  function changeContactLog(next) {
    saveContactLog(patient.patient_id, next)
    setContactLog(next)
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
        caregivers={caregivers}
        onCaregiversChange={changeCaregivers}
        contactLog={contactLog}
        onContactLogChange={changeContactLog}
        reminderSettings={reminderSettings}
        onReminderSettingsChange={changeReminderSettings}
        reminderLog={reminderLog}
        reminderPreview={dueReminders({ checkins, measurements, items, lastChatDate: getLastChatDate(patient.patient_id) })}
        notifyStatus={notifyStatus}
        onEnableNotifications={enableNotifications}
        onTestNotification={testNotification}
      />
    )
  }

  return (
    <div className="elder-shell">
      {error && <div className="elder-alert" role="alert">{error}<button onClick={clearAlerts} aria-label="关闭提示">×</button></div>}
      {notice && <div className="elder-alert ok" role="status">{notice}<button onClick={clearAlerts} aria-label="关闭提示">×</button></div>}
      {reminderBanner && elderPage !== 'chat' && (
        <button className="reminder-banner" onClick={() => { setElderPage('chat'); setReminderBanner(null) }}>
          <strong>小安：{reminderBanner.title}</strong>
          <span>点这里听小安说 ›</span>
        </button>
      )}
      {elderPage === 'today' && (
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
          onOpenChat={() => setElderPage('chat')}
        />
      )}
      {elderPage === 'history' && (
        <ElderHistory
          checkins={checkins}
          items={items}
          measurements={measurements}
          notifyStatus={notifyStatus}
          onEnableNotifications={enableNotifications}
          onOpenFamily={() => setMode('family')}
        />
      )}
      {loadedPatientId === patientId && (
        <ElderChat
          key={patientId}
          hidden={elderPage !== 'chat'}
          patient={patient}
          context={{ patient, checkins, records, todayRow, slots, items, measurements }}
          opening={opening}
          reminder={reminder}
          onChatted={markChatted}
          smsEnabled={sms.notifyFamily}
          onSaveEntry={saveEntry}
          onMedsTaken={markDueMedsTaken}
          onSavePhoto={savePhotoUpload}
          onAddDoctorQuestion={addDoctorQuestion}
        />
      )}
      <nav className="elder-tabs" aria-label="老人模式导航">
        <button className={elderPage === 'today' ? 'active' : ''} onClick={() => setElderPage('today')}><span aria-hidden="true">☀</span>今天</button>
        <button className={elderPage === 'chat' ? 'active' : ''} onClick={() => { setElderPage('chat'); setReminderBanner(null) }}><span aria-hidden="true">💬</span>问{ASSISTANT_NAME}</button>
        <button className={elderPage === 'history' ? 'active' : ''} onClick={() => setElderPage('history')}><span aria-hidden="true">▤</span>我的记录</button>
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
    </div>
  )
}

export default App
