import { useEffect, useRef, useState } from 'react'
import AssistantAvatar from './AssistantAvatar'
import { ASSISTANT_NAME, SAFETY_TEXT, describeFields, interpret, safetyAfterSave } from '../lib/assistant'
import { hasBloodPressure, localDate, monthDay } from '../lib/format'
import { compressImage } from '../lib/records'
import { askAI } from '../lib/ai'
import { getAutoSpeak, saveAutoSpeak } from '../lib/localStore'

const PHOTO_TYPES = ['门诊病历', '处方', '检查报告']

const speechRecognition = () => window.SpeechRecognition || window.webkitSpeechRecognition || null

const VOICE_ERRORS = {
  'no-speech': '我没听到声音，请再点一下，靠近手机说。',
  'audio-capture': '手机的麦克风好像用不了，您可以打字告诉我。',
  'not-allowed': '麦克风还没有打开。请在浏览器设置里允许使用麦克风，或者打字告诉我。',
  'service-not-allowed': '这个浏览器不能用语音，您可以打字告诉我。',
  network: '语音暂时连不上，您可以打字告诉我。',
}

function speak(text) {
  if (!window.speechSynthesis) return
  window.speechSynthesis.cancel()
  const utterance = new SpeechSynthesisUtterance(text)
  utterance.lang = 'zh-CN'
  utterance.rate = 0.9
  window.speechSynthesis.speak(utterance)
}

let messageId = 0
const aiMessage = (text, extra = {}) => ({ id: ++messageId, from: 'ai', text, ...extra })
const myMessage = (text, extra = {}) => ({ id: ++messageId, from: 'me', text, ...extra })

export default function ElderChat({ hidden, patient, context, opening, smsEnabled, onSaveEntry, onMedsTaken, onSavePhoto, onAddDoctorQuestion }) {
  const [messages, setMessages] = useState(() => [aiMessage(opening.text)])
  const [input, setInput] = useState('')
  const [busy, setBusy] = useState(false)
  const [thinking, setThinking] = useState(false)
  const [listening, setListening] = useState(false)
  const [heard, setHeard] = useState('')
  const [typing, setTyping] = useState(() => !speechRecognition())
  const [autoSpeak, setAutoSpeak] = useState(getAutoSpeak)
  const [pendingRecord, setPendingRecord] = useState(null)
  const [photo, setPhoto] = useState(null)
  const fileInput = useRef(null)
  const listEnd = useRef(null)
  const recognition = useRef(null)
  const speechUnlocked = useRef(false)
  const lastSpoken = useRef(messages[0]?.id)
  const sendRef = useRef(null)

  useEffect(() => {
    listEnd.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })
  }, [messages])

  useEffect(() => () => {
    recognition.current?.abort()
    window.speechSynthesis?.cancel()
  }, [])

  // 新回答自动读出来。开场白不读：有些手机要老人点过一下才允许发声
  useEffect(() => {
    const last = messages.at(-1)
    if (!last || last.from !== 'ai' || last.id === lastSpoken.current) return
    lastSpoken.current = last.id
    if (autoSpeak && !hidden && last.text) speak(last.text)
  }, [messages, autoSpeak, hidden])

  // 切到别的页面就停下来，不在背后说话或听
  useEffect(() => {
    if (!hidden) return
    recognition.current?.abort()
    window.speechSynthesis?.cancel()
  }, [hidden])

  const add = (...items) => setMessages((current) => [...current, ...items])
  const closeRecordActions = () => setMessages((current) => current.map((message) => (message.actions?.some((action) => action.value === 'confirm-record') ? { ...message, done: true } : message)))
  const closeActions = (id) => setMessages((current) => current.map((message) => (message.id === id ? { ...message, done: true } : message)))

  function followUp(merged) {
    if (context.items.some((item) => item.kind === 'bp') && !hasBloodPressure(merged)) return '量了血压也可以告诉我。'
    if (!merged.mood_response) return '今天心情怎么样？'
    return '还有什么想说的，随时告诉我。'
  }

  function handleSend(text = input) {
    const value = text.trim()
    if (!value || busy || thinking) return
    setInput('')
    add(myMessage(value))

    // 语音确认：老人说"对"或"不对"，和点按钮一样。必须整句就是确认，"对，我胸口痛"不算
    if (pendingRecord) {
      if (/^(不对|不是|错了|重说|重新说)[的了呀啊吧，。！!,\s]*$/.test(value)) {
        closeRecordActions()
        setPendingRecord(null)
        add(aiMessage('好的，请再说一遍。'))
        return
      }
      if (/^((对|是|没错|保存|好的?|嗯|可以)[的了呀啊吧，。！!,\s]*)+$/.test(value)) {
        closeRecordActions()
        confirmRecord()
        return
      }
    }

    const action = interpret(value, context)

    switch (action.type) {
      case 'emergency':
      case 'crisis':
        add(aiMessage(action.text, { tone: 'urgent' }))
        break
      case 'refuse':
        add(aiMessage(action.text, { actions: [{ label: '记下来，复诊时问医生', value: 'save-question', payload: value }] }))
        break
      case 'missed_med':
        add(aiMessage(action.text, { tone: 'caution' }))
        break
      case 'meds_taken': {
        const marked = onMedsTaken()
        add(aiMessage(marked.length ? `好的，已经帮您在"今天"页打卡：${marked.join('、')}。` : '今天到点的药都已经打过卡了。'))
        break
      }
      case 'doctor_question':
        onAddDoctorQuestion(action.question)
        add(aiMessage(`记下了："${action.question}"。复诊的时候，家人在照护模式的"复诊病历"里能看到，可以一起带给医生。`))
        break
      case 'ask_doctor_question':
        setInput('我想问医生：')
        setTyping(true)
        add(aiMessage('好的，您想问医生什么？说"我想问医生"，后面接着说问题就行。'))
        break
      case 'photo':
        startPhoto()
        break
      case 'record': {
        const summary = describeFields(action.fields, action.measures, action.symptoms)
        setPendingRecord(action)
        if (action.check.implausible) {
          add(aiMessage(`${SAFETY_TEXT.implausible}我听到的是：${summary}。`, {
            tone: 'caution',
            actions: [{ label: '没错，保存', value: 'confirm-record' }, { label: '我重新说', value: 'redo-record' }],
          }))
        } else {
          add(aiMessage(`我记下了：${summary}。对吗？`, {
            actions: [{ label: '对，保存', value: 'confirm-record' }, { label: '不对，我重说', value: 'redo-record' }],
          }))
        }
        break
      }
      default:
        if (action.local) add(aiMessage(action.text, { sources: action.sources }))
        else answerWithAI(value, action)
    }
  }

  async function answerWithAI(question, fallback) {
    setThinking(true)
    const text = await askAI({ patientId: patient.patient_id, question, slots: context.slots })
    setThinking(false)
    add(text ? aiMessage(text) : aiMessage(fallback.text, { sources: fallback.sources }))
  }

  async function confirmRecord() {
    if (!pendingRecord) return
    setBusy(true)
    const error = await onSaveEntry(pendingRecord)
    setBusy(false)
    if (error) {
      add(aiMessage(`没有保存成功，请检查一下网络再试一次。（${error.message}）`, { tone: 'caution' }))
      return
    }
    const { fields, measures } = pendingRecord
    const merged = { ...context.todayRow, ...fields, capture_status: fields.systolic_mmhg != null ? 'recorded' : context.todayRow?.capture_status }
    setPendingRecord(null)
    const safety = safetyAfterSave(fields, measures)
    if (safety) add(aiMessage(`记好了。${safety.text}`, { tone: safety.tone }))
    else add(aiMessage(`记好了，谢谢您。${followUp(merged)}`))
  }

  function startPhoto() {
    add(aiMessage('好的，请把病历放平，光线亮一点，拍清楚整页。', { actions: [{ label: '📷 拍照或选照片', value: 'pick-photo' }] }))
  }

  async function handleFile(event) {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    try {
      const dataUrl = await compressImage(file)
      setPhoto({ dataUrl })
      add(myMessage('', { image: dataUrl }))
      add(aiMessage('照片收到了。这是哪一种？', { actions: PHOTO_TYPES.map((type) => ({ label: type, value: 'photo-type', payload: type })) }))
    } catch {
      add(aiMessage('这张照片打不开，请换一张再试。', { tone: 'caution' }))
    }
  }

  function askPhotoDate(type) {
    setPhoto((current) => ({ ...current, type }))
    add(myMessage(type))
    add(aiMessage('是哪天看的？', {
      actions: [
        { label: '今天', value: 'photo-date', payload: localDate() },
        { label: '昨天', value: 'photo-date', payload: localDate(-1) },
        { label: '选日期', value: 'photo-date-pick' },
      ],
    }))
  }

  function confirmPhotoDate(date) {
    if (!date) return
    setPhoto((current) => ({ ...current, date }))
    add(myMessage(monthDay(date)))
    add(aiMessage(`好的，这是${monthDay(date)}的${photo?.type}，对吗？`, {
      actions: [{ label: '对，存好', value: 'photo-save' }, { label: '不对，重新选', value: 'photo-redo' }],
    }))
  }

  async function savePhoto() {
    setBusy(true)
    const error = await onSavePhoto(photo)
    setBusy(false)
    if (error) {
      add(aiMessage(`没有存成功，请检查一下网络再试一次。（${error.message}）`, { tone: 'caution' }))
      return
    }
    const isPrescription = photo.type === '处方'
    setPhoto(null)
    add(aiMessage(
      `存好了，照片原样保存着。上面医生写的字我先不替您解读，复诊时护士会帮忙核对。${
        isPrescription
          ? `这张处方上的药如果和您现在吃的不一样，请先问医生或药师，不要自己改。${smsEnabled ? '我已经发短信请家人帮您确认用药清单。' : '也可以请家人帮您看看用药清单。'}`
          : ''
      }`,
    ))
  }

  function handleAction(message, action) {
    closeActions(message.id)
    switch (action.value) {
      case 'confirm-record':
        confirmRecord()
        break
      case 'redo-record':
        setPendingRecord(null)
        add(aiMessage('好的，请再说一遍。'))
        break
      case 'save-question':
        onAddDoctorQuestion(action.payload)
        add(aiMessage(`记下了："${action.payload}"。复诊时可以问医生。`))
        break
      case 'pick-photo':
        fileInput.current?.click()
        break
      case 'photo-type':
        askPhotoDate(action.payload)
        break
      case 'photo-date':
        confirmPhotoDate(action.payload)
        break
      case 'photo-date-pick':
        add(aiMessage('请选日期：', { datePicker: true }))
        break
      case 'photo-save':
        savePhoto()
        break
      case 'photo-redo':
        add(aiMessage('这是哪一种？', { actions: PHOTO_TYPES.map((type) => ({ label: type, value: 'photo-type', payload: type })) }))
        break
      default:
    }
  }

  // 第一次点按钮时先发一个空声音，之后手机才允许自动朗读
  function unlockSpeech() {
    if (speechUnlocked.current || !window.speechSynthesis) return
    speechUnlocked.current = true
    window.speechSynthesis.speak(new SpeechSynthesisUtterance(''))
  }

  sendRef.current = handleSend

  function toggleListening() {
    if (listening) {
      recognition.current?.stop()
      return
    }
    const Recognition = speechRecognition()
    if (!Recognition) return
    unlockSpeech()
    window.speechSynthesis?.cancel()

    let transcript = ''
    let failure = null
    const recognizer = new Recognition()
    recognizer.lang = 'zh-CN'
    recognizer.interimResults = true
    recognizer.onresult = (event) => {
      transcript = Array.from(event.results).map((result) => result[0].transcript).join('')
      setHeard(transcript)
    }
    recognizer.onerror = (event) => { failure = event.error }
    recognizer.onend = () => {
      setListening(false)
      setHeard('')
      if (failure === 'aborted') return
      if (transcript.trim()) { sendRef.current(transcript); return }
      if (failure && failure !== 'no-speech') setTyping(true)
      add(aiMessage(VOICE_ERRORS[failure] || '我没听清，请再点一下说。', { tone: 'caution' }))
    }
    recognition.current = recognizer
    setHeard('')
    setListening(true)
    recognizer.start()
  }

  function changeAutoSpeak() {
    const next = !autoSpeak
    setAutoSpeak(next)
    saveAutoSpeak(next)
    if (next) unlockSpeech()
    else window.speechSynthesis?.cancel()
  }

  return (
    <div className="chat-screen" hidden={hidden} aria-label={`和${ASSISTANT_NAME}说话`}>
      <header className="chat-header">
        <span className="chat-title"><AssistantAvatar size={36} />{ASSISTANT_NAME}</span>
        {window.speechSynthesis && (
          <button className="auto-speak" onClick={changeAutoSpeak} aria-pressed={autoSpeak}>{autoSpeak ? '🔊 朗读开' : '🔇 朗读关'}</button>
        )}
      </header>

      <div className="chat-messages">
        {messages.map((message) => (
          <div key={message.id} className={`chat-row ${message.from}`}>
            {message.from === 'ai' && <AssistantAvatar size={40} />}
            <div className={`chat-bubble ${message.tone || ''}`}>
              {message.image ? <img src={message.image} alt="拍下的病历" className="chat-image" /> : <p>{message.text}</p>}
              {message.sources?.length > 0 && <small className="chat-sources">依据：{message.sources.slice(0, 7).join('、')}的记录</small>}
              {message.datePicker && !message.done && (
                <input
                  type="date"
                  className="chat-date"
                  max={localDate()}
                  onChange={(event) => { closeActions(message.id); confirmPhotoDate(event.target.value) }}
                />
              )}
              {message.actions && !message.done && (
                <div className="chat-actions">
                  {message.actions.map((action) => (
                    <button key={action.label} onClick={() => handleAction(message, action)} disabled={busy}>{action.label}</button>
                  ))}
                </div>
              )}
              {message.from === 'ai' && window.speechSynthesis && <button className="speak-button" onClick={() => speak(message.text)}>🔊 再读一遍</button>}
            </div>
          </div>
        ))}
        {busy && <div className="chat-row ai"><AssistantAvatar size={40} /><div className="chat-bubble"><p>正在保存…</p></div></div>}
        {thinking && <div className="chat-row ai"><AssistantAvatar size={40} /><div className="chat-bubble"><p>小安正在想…</p></div></div>}
        <div ref={listEnd} />
      </div>

      <footer className="chat-input">
        <div className="chat-shortcuts">
          <button onClick={startPhoto}>📷 拍病历</button>
          <button onClick={() => { setInput('我想问医生：'); setTyping(true) }}>记下想问医生的</button>
          {(() => {
            const topic = context.items.find((item) => item.kind === 'bp' || !item.custom)?.label || '睡眠'
            return <button onClick={() => handleSend(`我最近${topic}怎么样？`)}>最近{topic}怎么样</button>
          })()}
        </div>
        {typing ? (
          <>
            <form className="chat-form" onSubmit={(event) => { event.preventDefault(); unlockSpeech(); handleSend() }}>
              <textarea
                rows="2"
                value={input}
                placeholder="在这里说说今天的情况"
                onChange={(event) => setInput(event.target.value)}
                onKeyDown={(event) => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); unlockSpeech(); handleSend() } }}
              />
              <button type="submit" className="send-button" disabled={!input.trim() || busy}>发送</button>
            </form>
            {speechRecognition() && <button className="input-switch" onClick={() => setTyping(false)}>🎤 改用说话</button>}
          </>
        ) : (
          <>
            {listening && <p className="voice-heard" aria-live="polite">{heard || '正在听，请说…'}</p>}
            <button className={`voice-button ${listening ? 'listening' : ''}`} onClick={toggleListening} disabled={busy || thinking}>
              {listening ? '■ 说完了，点这里' : thinking ? '小安正在想…' : '🎤 点一下，开始说话'}
            </button>
            <button className="input-switch" onClick={() => { recognition.current?.abort(); setTyping(true) }}>⌨ 改用打字</button>
          </>
        )}
        <input ref={fileInput} type="file" accept="image/*" capture="environment" hidden onChange={handleFile} />
      </footer>
    </div>
  )
}
