/* ============================================================
   data.js · 读取 data/*.csv（唯一权威数据来源）
   规则见 design/05_数据模型与隐私规则.md
   ============================================================ */

/** 演示锚点：数据截止 2026-08-30（星期日）。见 05 文档 §7 */
export const TODAY = '2026-08-30';

const WEEKDAYS = ['星期日', '星期一', '星期二', '星期三', '星期四', '星期五', '星期六'];

/* ---------------- CSV 解析（支持引号、换行、BOM） ---------------- */

export function parseCsv(text) {
  if (text.charCodeAt(0) === 0xFEFF) text = text.slice(1);
  const rows = [];
  let row = [];
  let field = '';
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; }
        else inQuotes = false;
      } else field += ch;
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ',') {
      row.push(field); field = '';
    } else if (ch === '\r') {
      /* 忽略，交给 \n 处理 */
    } else if (ch === '\n') {
      row.push(field); field = '';
      rows.push(row); row = [];
    } else {
      field += ch;
    }
  }
  if (field !== '' || row.length) { row.push(field); rows.push(row); }

  if (!rows.length) return [];
  const header = rows[0].map((h) => h.trim());
  return rows.slice(1)
    .filter((r) => r.length > 1 || (r.length === 1 && r[0] !== ''))
    .map((r) => {
      const obj = {};
      header.forEach((h, i) => { obj[h] = r[i] === undefined ? '' : r[i]; });
      return obj;
    });
}

/* ---------------- 类型归一化 ---------------- */

const num = (v) => {
  if (v === undefined || v === null || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

const str = (v) => (v === undefined || v === null || v === '' ? null : String(v));

/* ---------------- 加载 ---------------- */

/**
 * data/ 的候选位置。原型既可能从仓库根启动，也可能从 design/prototype/ 启动，
 * 因此逐个尝试，用第一个能读到 patients.csv 的路径。
 */
const DATA_CANDIDATES = [
  '/data',                    // 从仓库根启动：http://127.0.0.1:PORT/design/prototype/
  '../../../data',            // 从 design/prototype/ 启动
  '../../data',
  'data',
];

let resolvedBase = null;

async function pickDataBase() {
  if (resolvedBase) return resolvedBase;
  for (const base of DATA_CANDIDATES) {
    try {
      const res = await fetch(`${base}/patients.csv`);
      if (res.ok) {
        const text = await res.text();
        if (text.includes('patient_id')) { resolvedBase = base; return base; }
      }
    } catch { /* 试下一个 */ }
  }
  throw new Error(
    location.protocol === 'file:'
      ? '这个原型需要通过本地服务打开，不能直接双击文件。'
      : '找不到 data 文件夹',
  );
}

export async function loadAll(basePath) {
  const base = basePath || await pickDataBase();
  const [patientsCsv, checkinsCsv, recordsCsv] = await Promise.all([
    fetch(`${base}/patients.csv`).then((r) => r.text()),
    fetch(`${base}/daily_checkins.csv`).then((r) => r.text()),
    fetch(`${base}/medical_records.csv`).then((r) => r.text()),
  ]);

  const patients = parseCsv(patientsCsv).map((r) => ({
    patient_id: r.patient_id,
    display_name: r.display_name,
    age_years: num(r.age_years),
    gender: r.gender,
    living_arrangement: r.living_arrangement,
    support_person: r.support_person,
    sharing_preference: r.sharing_preference,
    preferred_language: r.preferred_language,
    history_summary: r.history_summary,
    allergy_status: r.allergy_status,
    is_synthetic: r.is_synthetic === 'True',
  }));

  const checkins = parseCsv(checkinsCsv).map((r) => ({
    checkin_id: r.checkin_id,
    patient_id: r.patient_id,
    record_date: r.record_date,
    systolic_mmhg: num(r.systolic_mmhg),
    diastolic_mmhg: num(r.diastolic_mmhg),
    pulse_bpm: num(r.pulse_bpm),
    capture_status: r.capture_status,          // recorded | not_recorded | device_error
    recorded_by_type: r.recorded_by_type,      // self | family
    sleep_hours: num(r.sleep_hours),
    mood_response: str(r.mood_response),       // 很好 | 一般 | 不太好 | 跳过
    wants_to_talk: str(r.wants_to_talk),       // 愿意 | 暂时不需要 | 跳过
    self_report_note: str(r.self_report_note),
    is_synthetic: r.is_synthetic === 'True',
  }));

  const records = parseCsv(recordsCsv).map((r) => ({
    record_id: r.record_id,
    patient_id: r.patient_id,
    record_date: r.record_date,
    record_type: r.record_type,
    source_label: r.source_label,
    record_text: r.record_text,
    text_status: r.text_status,                // confirmed_demo | unconfirmed | unreadable
    is_synthetic: r.is_synthetic === 'True',
  }));

  return { patients, checkins, records };
}

/* ---------------- 查询辅助 ---------------- */

export const checkinsOf = (data, patientId) =>
  data.checkins
    .filter((c) => c.patient_id === patientId)
    .sort((a, b) => a.record_date.localeCompare(b.record_date));

export const recordsOf = (data, patientId) =>
  data.records
    .filter((r) => r.patient_id === patientId)
    .sort((a, b) => b.record_date.localeCompare(a.record_date));

export const findCheckin = (data, patientId, date) =>
  data.checkins.find((c) => c.patient_id === patientId && c.record_date === date) || null;

export const latestCheckin = (data, patientId) => {
  const list = checkinsOf(data, patientId);
  return list.length ? list[list.length - 1] : null;
};

/* ---------------- 日期辅助 ---------------- */

export function formatDate(iso) {
  const [y, m, d] = iso.split('-').map(Number);
  return { y, m, d, short: `${m}月${d}日`, ymd: `${y}年${m}月${d}日` };
}

export function weekdayOf(iso) {
  const [y, m, d] = iso.split('-').map(Number);
  return WEEKDAYS[new Date(Date.UTC(y, m - 1, d)).getUTCDay()];
}

export const shortDate = (iso) => formatDate(iso).short;
export const longDate = (iso) => formatDate(iso).ymd;
export const shortDateWithWeek = (iso) => `${shortDate(iso)} ${weekdayOf(iso)}`;

/* ---------------- 核心：缺失值判定（见 05 文档 §3.1） ---------------- */

/**
 * 血压/脉搏这一组读数的展示模型。
 * 空值永远不是 0；not_recorded 与 device_error 必须可区分。
 */
export function bpDisplay(row) {
  if (row.capture_status === 'recorded') {
    return {
      hasValue: true,
      text: `${row.systolic_mmhg} / ${row.diastolic_mmhg}`,
      pulse: `${row.pulse_bpm}`,
      kind: null,
    };
  }
  return { hasValue: false, text: '—', pulse: '—', kind: row.capture_status };
}

/** 睡眠展示：与 capture_status 完全独立 */
export function sleepDisplay(row) {
  if (row.sleep_hours === null || row.sleep_hours === undefined) {
    return { hasValue: false, text: '—', kind: 'not_recorded' };
  }
  return { hasValue: true, text: String(row.sleep_hours), kind: null };
}

/** 心情展示：跳过 ≠ 不太好 */
export function moodDisplay(value) {
  if (!value || value === '跳过') return { text: '这次没回答', skipped: true };
  return { text: value, skipped: false };
}

/** 交流意愿展示 */
export function talkDisplay(value) {
  if (!value || value === '跳过') return { text: '这次没回答', skipped: true };
  return { text: value, skipped: false };
}

/**
 * 家属代录的行若含主观字段（心情 / 交流意愿），
 * 无法确认是否本人表达 —— 见 05 文档 §4.3。
 */
export const isProxySubjective = (row) =>
  row.recorded_by_type === 'family' &&
  ((row.mood_response && row.mood_response !== '跳过') ||
   (row.wants_to_talk && row.wants_to_talk !== '跳过'));

/* ---------------- 统计 ---------------- */

export function stats(rows, metric) {
  let recorded = 0, missing = 0, deviceError = 0;
  const missingDates = [], deviceErrorDates = [];
  const values = [];

  rows.forEach((row) => {
    if (metric === 'bp' || metric === 'pulse') {
      if (row.capture_status === 'recorded') {
        recorded++;
        values.push(metric === 'bp' ? row.systolic_mmhg : row.pulse_bpm);
      } else {
        missing++;
        missingDates.push(row.record_date);
        if (row.capture_status === 'device_error') {
          deviceError++;
          deviceErrorDates.push(row.record_date);
        }
      }
    } else if (metric === 'sleep') {
      if (row.sleep_hours === null || row.sleep_hours === undefined) {
        missing++; missingDates.push(row.record_date);
      } else { recorded++; values.push(row.sleep_hours); }
    }
  });

  const sum = values.reduce((a, b) => a + b, 0);
  return {
    total: rows.length,
    recorded, missing, deviceError,
    missingDates, deviceErrorDates,
    values,
    avg: values.length ? sum / values.length : null,
    min: values.length ? Math.min(...values) : null,
    max: values.length ? Math.max(...values) : null,
  };
}

/** 心情 / 交流意愿计数（只计数，不做定性 —— 见 03 文档 P6） */
export function tally(rows, field) {
  const out = {};
  rows.forEach((r) => {
    const v = r[field] || '跳过';
    out[v] = (out[v] || 0) + 1;
  });
  return out;
}

/** 缺失信息扫描 —— 供复诊小结使用（见 03 文档 P6） */
export function scanMissing(rows, patient) {
  const items = [];
  const bp = stats(rows, 'bp');
  const sleep = stats(rows, 'sleep');

  if (bp.missingDates.length) {
    items.push({
      text: `${bp.missingDates.map(shortDate).join('、')} 的血压没有记录`,
      kind: 'not_recorded',
    });
  }
  const errDates = bp.deviceErrorDates;
  if (errDates.length) {
    items.push({
      text: `${errDates.map(shortDate).join('、')} 设备没测出来`,
      kind: 'device_error',
    });
  }
  if (sleep.missingDates.length) {
    items.push({
      text: `${sleep.missingDates.map(shortDate).join('、')} 的睡眠没有记录`,
      kind: 'not_recorded',
    });
  }
  const skippedMood = rows.filter((r) => !r.mood_response || r.mood_response === '跳过').length;
  if (skippedMood) items.push({ text: `有 ${skippedMood} 天没有回答心情`, kind: 'skipped' });

  items.push({ text: '药物名称和剂量没有记录', kind: 'missing_data' });

  if (patient.allergy_status === '未知') {
    items.push({ text: '过敏情况没有确认过', kind: 'missing_data' });
  }
  return items;
}
