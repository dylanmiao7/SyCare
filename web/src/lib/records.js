import { supabase } from './supabase'
import { localDate } from './format'
import { PHOTO_SOURCE, UNVERIFIED, VERIFIED } from './recordLabels'

export { isPhotoRecord, isUnverified } from './recordLabels'

// 今天的每日记录：已有就合并更新，没有就新建。只写入这次提供的字段。
export async function saveTodayCheckin(patient, existing, fields) {
  const today = localDate()
  const hasPressure = fields.systolic_mmhg != null && fields.diastolic_mmhg != null
  const note = [existing?.self_report_note, fields.self_report_note].filter(Boolean).join('\n')

  if (existing) {
    const update = { ...fields, self_report_note: note || null }
    if (hasPressure) update.capture_status = 'recorded'
    const { error } = await supabase.from('daily_checkins').update(update).eq('checkin_id', existing.checkin_id)
    return error
  }

  const row = {
    checkin_id: `CHK-${crypto.randomUUID()}`,
    patient_id: patient.patient_id,
    record_date: today,
    systolic_mmhg: null,
    diastolic_mmhg: null,
    pulse_bpm: null,
    capture_status: hasPressure ? 'recorded' : 'not_recorded',
    recorded_by_type: 'self',
    sleep_hours: null,
    mood_response: null,
    wants_to_talk: null,
    is_synthetic: true,
    ...fields,
    self_report_note: note || null,
  }
  const { error } = await supabase.from('daily_checkins').insert(row)
  return error
}

// 血糖、体重等项目和"哪里不舒服"：每次一行，存进 measurements 表
export async function saveMeasurement(patient, { key, label, unit = null, value = null, text = null }) {
  const { error } = await supabase.from('measurements').insert({
    measurement_id: `MEA-${crypto.randomUUID()}`,
    patient_id: patient.patient_id,
    record_date: localDate(),
    item_key: key,
    item_label: label,
    value_num: value,
    value_text: text,
    unit,
    recorded_by_type: 'self',
    is_synthetic: true,
  })
  return error
}

export async function savePhotoRecord(patient, { recordType, recordDate }) {
  const row = {
    record_id: `REC-${crypto.randomUUID()}`,
    patient_id: patient.patient_id,
    record_date: recordDate,
    record_type: recordType,
    source_label: `${PHOTO_SOURCE}·${UNVERIFIED}`,
    record_text: `老人拍照上传的${recordType}照片。照片里的文字还没有识别和核对，请以原图为准。`,
    text_status: 'unverified_photo',
    file_path: null,
    is_synthetic: true,
  }
  let { error } = await supabase.from('medical_records').insert(row)
  // 如果数据库限制了 text_status 的取值，退回已有的取值；是否核对仍以 source_label 为准
  if (error?.code === '23514') {
    ;({ error } = await supabase.from('medical_records').insert({ ...row, text_status: 'confirmed_demo' }))
  }
  return { error, recordId: row.record_id }
}

export async function markRecordVerified(record) {
  const { error } = await supabase
    .from('medical_records')
    .update({ source_label: `${PHOTO_SOURCE}·${VERIFIED}` })
    .eq('record_id', record.record_id)
  return error
}

export async function saveTextRecord(patient, { recordDate, recordType, recordText }) {
  const { error } = await supabase.from('medical_records').insert({
    record_id: `REC-${crypto.randomUUID()}`,
    patient_id: patient.patient_id,
    record_date: recordDate,
    record_type: recordType,
    source_label: '家属手动录入',
    record_text: recordText,
    text_status: 'confirmed_demo',
    file_path: null,
    is_synthetic: true,
  })
  return error
}

// 把照片缩小后再保存，避免占满浏览器空间
export function compressImage(file, maxSize = 900) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = () => reject(reader.error)
    reader.onload = () => {
      const image = new Image()
      image.onerror = () => reject(new Error('无法读取这张图片'))
      image.onload = () => {
        const scale = Math.min(1, maxSize / Math.max(image.width, image.height))
        const canvas = document.createElement('canvas')
        canvas.width = Math.round(image.width * scale)
        canvas.height = Math.round(image.height * scale)
        canvas.getContext('2d').drawImage(image, 0, 0, canvas.width, canvas.height)
        resolve(canvas.toDataURL('image/jpeg', 0.75))
      }
      image.src = reader.result
    }
    reader.readAsDataURL(file)
  })
}
