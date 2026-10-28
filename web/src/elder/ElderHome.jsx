import { useState } from 'react'
import AssistantAvatar from './AssistantAvatar'
import { ASSISTANT_NAME } from '../lib/assistant'
import { displayPatientName, greetingWord, hasBloodPressure, todayHeading } from '../lib/format'

const MOODS = [
  { value: '很好', face: '😊', label: '很好' },
  { value: '一般', face: '😐', label: '一般' },
  { value: '不太好', face: '😟', label: '不太好' },
]

export default function ElderHome({ patient, todayRow, slots, opening, saving, onToggleMed, onSetMood, onOpenChat, onOpenFamily }) {
  const [showProfile, setShowProfile] = useState(false)
  const name = displayPatientName(patient.display_name)

  return (
    <div className="elder-home">
      <header className="elder-header">
        <button className="elder-profile-button" onClick={() => setShowProfile(true)} aria-label="查看我的资料">
          <span className="elder-avatar">{patient.display_name?.slice(-1) || '长'}</span>
          <span className="elder-greeting">
            <strong>{greetingWord()}，{name}</strong>
            <small>{todayHeading()}</small>
          </span>
        </button>
        <button className="family-link" onClick={onOpenFamily}>家属模式</button>
      </header>

      <button className="assistant-card" onClick={onOpenChat} aria-label={`和${ASSISTANT_NAME}说话：${opening.bubble}`}>
        <span className="assistant-figure">
          <AssistantAvatar size={72} />
          <span className="assistant-name">{ASSISTANT_NAME}</span>
        </span>
        <span className="assistant-bubble">{opening.bubble}</span>
        <span className="assistant-cta">点我说话 ›</span>
      </button>

      <section className="elder-card">
        <h2>今天的药</h2>
        {slots.length ? (
          <div className="med-list">
            {slots.map((slot) => (
              <button
                key={slot.id}
                className={`med-button ${slot.taken ? 'taken' : ''}`}
                onClick={() => onToggleMed(slot.id, !slot.taken)}
                aria-pressed={slot.taken}
              >
                <span className="med-time">{slot.time}</span>
                <span className="med-name">{slot.med.name} <small>{slot.med.dose}</small></span>
                <span className="med-state">{slot.taken ? '✓ 已吃' : '点这里打卡'}</span>
              </button>
            ))}
          </div>
        ) : (
          <p className="elder-empty">家里人还没有设置用药清单。</p>
        )}
      </section>

      <section className="elder-card">
        <h2>今天的情况</h2>
        <div className="today-grid">
          <div className="today-item">
            <span>血压</span>
            <strong>{hasBloodPressure(todayRow) ? `${todayRow.systolic_mmhg} / ${todayRow.diastolic_mmhg}` : '还没记'}</strong>
          </div>
          <div className="today-item">
            <span>睡眠</span>
            <strong>{todayRow?.sleep_hours != null ? `${todayRow.sleep_hours} 小时` : '还没记'}</strong>
          </div>
        </div>
        <p className="mood-question">今天心情怎么样？</p>
        <div className="mood-row">
          {MOODS.map((mood) => (
            <button
              key={mood.value}
              className={`mood-button ${todayRow?.mood_response === mood.value ? 'selected' : ''}`}
              onClick={() => onSetMood(mood.value)}
              disabled={saving}
              aria-pressed={todayRow?.mood_response === mood.value}
            >
              <span aria-hidden="true">{mood.face}</span>
              {mood.label}
            </button>
          ))}
        </div>
        <button className="elder-secondary" onClick={onOpenChat}>记血压、睡眠，跟{ASSISTANT_NAME}说就行 →</button>
      </section>

      {showProfile && (
        <div className="sheet-backdrop" onClick={() => setShowProfile(false)}>
          <section className="profile-sheet" onClick={(event) => event.stopPropagation()} role="dialog" aria-label="我的资料">
            <h2>我的资料</h2>
            <dl>
              <div><dt>称呼</dt><dd>{name}</dd></div>
              <div><dt>年龄</dt><dd>{patient.age_years ? `${patient.age_years} 岁` : '未记录'}</dd></div>
              <div><dt>居住情况</dt><dd>{patient.living_arrangement || '未记录'}</dd></div>
              <div><dt>过敏情况</dt><dd>{patient.allergy_status || '未记录'}</dd></div>
              <div><dt>联系人</dt><dd>{patient.support_person || '未指定'}</dd></div>
              <div><dt>分享给家人</dt><dd>{patient.sharing_preference || '未记录'}</dd></div>
            </dl>
            <button className="elder-primary" onClick={() => setShowProfile(false)}>关上</button>
          </section>
        </div>
      )}
    </div>
  )
}
