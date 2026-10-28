// 演示版：用药清单、记录项目设置、打卡、复诊日期、想问医生的问题、病历照片和短信设置
// 只保存在这台设备的浏览器里。正式版需要放进数据库。

import { defaultItems } from './items'

const PREFIX = 'sycare:'

function read(key, fallback) {
  try {
    const raw = window.localStorage.getItem(PREFIX + key)
    return raw == null ? fallback : JSON.parse(raw)
  } catch {
    return fallback
  }
}

function write(key, value) {
  try {
    window.localStorage.setItem(PREFIX + key, JSON.stringify(value))
    return true
  } catch {
    return false
  }
}

// 用药清单 —— 只在家属模式里修改
export function getMedications(patient) {
  const saved = read(`meds:${patient.patient_id}`, null)
  if (saved) return saved
  // 有高血压的模拟老人，预设一种示例降压药，方便演示提醒和打卡
  if ((patient.history_summary || '').includes('高血压')) {
    return [{ id: 'demo-bp', name: '降压药（示例）', dose: '1片', times: ['08:00'] }]
  }
  return []
}

export function saveMedications(patientId, meds) {
  return write(`meds:${patientId}`, meds)
}

// 每天每个时间点一个打卡，例如 { 'demo-bp@08:00': '2026-10-27T08:12:00.000Z' }
export function getMedLog(patientId, date) {
  return read(`medlog:${patientId}:${date}`, {})
}

export function setMedTaken(patientId, date, slotId, taken) {
  const log = getMedLog(patientId, date)
  if (taken) log[slotId] = new Date().toISOString()
  else delete log[slotId]
  write(`medlog:${patientId}:${date}`, log)
  return log
}

export function medSlots(meds) {
  return meds
    .flatMap((med) => (med.times || []).map((time) => ({ id: `${med.id}@${time}`, time, med })))
    .sort((a, b) => a.time.localeCompare(b.time))
}

// 每天要记的项目 —— 只在家属模式里设置
export function getItemConfig(patient) {
  return read(`items:${patient.patient_id}`, null) ?? defaultItems(patient)
}

export function saveItemConfig(patientId, config) {
  return write(`items:${patientId}`, config)
}

export function getVisitDate(patientId) {
  return read(`visit:${patientId}`, '')
}

export function saveVisitDate(patientId, date) {
  return write(`visit:${patientId}`, date)
}

export function getDoctorQuestions(patientId) {
  return read(`questions:${patientId}`, [])
}

export function saveDoctorQuestions(patientId, questions) {
  return write(`questions:${patientId}`, questions)
}

export function getPhoto(recordId) {
  return read(`photo:${recordId}`, null)
}

export function savePhoto(recordId, dataUrl) {
  return write(`photo:${recordId}`, dataUrl)
}

// 通知家人默认关闭，必须老人同意后才开启
export function getSmsSettings(patientId) {
  return read(`sms:${patientId}`, { notifyFamily: false })
}

export function saveSmsSettings(patientId, settings) {
  return write(`sms:${patientId}`, settings)
}

export function getSmsOutbox(patientId) {
  return read(`outbox:${patientId}`, [])
}

export function queueSms(patientId, text) {
  const outbox = getSmsOutbox(patientId)
  outbox.unshift({ id: crypto.randomUUID(), text, at: new Date().toISOString() })
  write(`outbox:${patientId}`, outbox.slice(0, 20))
}

export const DEMO_PIN = '1234'
