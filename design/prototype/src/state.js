/* ============================================================
   state.js · 仅内存状态（刷新即重置）
   写入路径见 design/05_数据模型与隐私规则.md §5.2
   ============================================================ */

import { loadAll, TODAY, findCheckin } from './data.js';

export const store = {
  status: 'loading',      // loading | ready | error
  error: null,
  data: { patients: [], checkins: [], records: [] },
  patientId: 'SYN-001',
  today: TODAY,
  font: 'normal',         // small | normal | large

  /* 仅内存的写入区 */
  uploadedFiles: [],      // { id, patient_id, file_name, size, mime, record_date, record_type, text_status, object_url }
  summaryDrafts: [],      // { patient_id, range_start, range_end, text, edited, generated_at, sources }
  chatMessages: [],       // { id, patient_id, role, text, answer_kind, sources, at }

  /* 表单与界面态 */
  forms: {
    checkin: null,        // 记健康表单草稿
    mood: null,           // 记心情表单草稿
    upload: null,         // 上传确认草稿
    summary: null,        // 小结草稿（可编辑文本）
  },
  ui: {
    logsMetric: 'bp',     // bp | pulse | sleep
    successCheckin: null, // 保存成功后的提示
    successMood: null,
    toast: null,
    chatBusy: false,
    chatElapsed: 0,
    settingsFontPreview: false,
    demo: { delayStatus: null, fail: { save: false, upload: false, ask: false, load: false }, delayMs: 500 },
  },
};

/* ---------------- 加载 ---------------- */

export async function init() {
  store.status = 'loading';
  try {
    if (store.ui.demo.delayStatus === 'load') {
      await wait(1000);
      throw new Error('演示：模拟加载失败');
    }
    if (store.ui.demo.fail.load) {
      await wait(store.ui.demo.delayMs);
      throw new Error('演示：模拟加载失败');
    }
    store.data = await loadAll();
    store.status = 'ready';
  } catch (err) {
    store.status = 'error';
    store.error = err && err.message ? err.message : '未知错误';
  }
}

export const wait = (ms) => new Promise((res) => setTimeout(res, ms));

/* ---------------- 查询 ---------------- */

export const currentPatient = () =>
  store.data.patients.find((p) => p.patient_id === store.patientId) || null;

export const setPatient = (id) => { store.patientId = id; };

/* ---------------- 写入：记健康 ---------------- */

export function upsertCheckin(input) {
  const existing = findCheckin(store.data, input.patient_id, input.record_date);
  if (existing) {
    Object.assign(existing, input);
    return { row: existing, overwritten: true };
  }
  const row = {
    checkin_id: `DAY-NEW-${store.data.checkins.length + 1}`,
    ...input,
    is_synthetic: true,
  };
  store.data.checkins.push(row);
  return { row, overwritten: false };
}

/* ---------------- 写入：记心情（只改心情三列） ---------------- */

export function patchMood(patientId, recordDate, patch) {
  const existing = findCheckin(store.data, patientId, recordDate);
  if (existing) {
    if (patch.mood_response !== undefined) existing.mood_response = patch.mood_response;
    if (patch.wants_to_talk !== undefined) existing.wants_to_talk = patch.wants_to_talk;
    if (patch.self_report_note !== undefined) existing.self_report_note = patch.self_report_note;
    return { row: existing, created: false };
  }
  // 该日尚无任何记录：新建一行，血压/脉搏按「未记录」处理（绝不当 0）
  const row = {
    checkin_id: `DAY-MOOD-${store.data.checkins.length + 1}`,
    patient_id: patientId,
    record_date: recordDate,
    systolic_mmhg: null,
    diastolic_mmhg: null,
    pulse_bpm: null,
    capture_status: 'not_recorded',
    recorded_by_type: 'self',
    sleep_hours: null,
    mood_response: patch.mood_response ?? '跳过',
    wants_to_talk: patch.wants_to_talk ?? '跳过',
    self_report_note: patch.self_report_note ?? null,
    is_synthetic: true,
  };
  store.data.checkins.push(row);
  return { row, created: true };
}

/* ---------------- 写入：上传文件 ---------------- */

export function addUploadedFile(file) {
  store.uploadedFiles.push(file);
}

export function removeUploadedFile(id) {
  const i = store.uploadedFiles.findIndex((f) => f.id === id);
  if (i >= 0) store.uploadedFiles.splice(i, 1);
}

export const uploadedOf = (patientId) =>
  store.uploadedFiles.filter((f) => f.patient_id === patientId);

/* ---------------- 写入：小结 ---------------- */

export function saveSummaryDraft(draft) {
  const i = store.summaryDrafts.findIndex((d) => d.patient_id === draft.patient_id);
  if (i >= 0) store.summaryDrafts[i] = draft; else store.summaryDrafts.push(draft);
}

export const summaryDraftOf = (patientId) =>
  store.summaryDrafts.find((d) => d.patient_id === patientId) || null;

/* ---------------- 写入：对话 ---------------- */

export function addMessage(msg) {
  store.chatMessages.push({ id: `MSG-${store.chatMessages.length + 1}`, ...msg });
}

export const messagesOf = (patientId) =>
  store.chatMessages.filter((m) => m.patient_id === patientId);

export function clearMessages(patientId) {
  store.chatMessages = store.chatMessages.filter((m) => m.patient_id !== patientId);
}

/* ---------------- 清空本次填的内容 ---------------- */

export function clearSession() {
  store.uploadedFiles = [];
  store.summaryDrafts = [];
  store.chatMessages = [];
  store.forms = { checkin: null, mood: null, upload: null, summary: null };
  store.ui.successCheckin = null;
  store.ui.successMood = null;
  store.ui.toast = null;
}
