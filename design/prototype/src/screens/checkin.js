/* ============================================================
   screens/checkin.js · P2 记健康
   空白读数必须显式表达为「未记录」或「设备错误」，绝不当 0。
   见 design/03_逐页规格.md P2 与 05_数据模型与隐私规则.md §3.1
   ============================================================ */

import { store, currentPatient, upsertCheckin, wait } from '../state.js';
import { findCheckin, shortDate } from '../data.js';
import {
  shell, btn, btnRow, alert, field, textareaField, radioRow, sheet,
} from '../ui.js';
import { openSheet, closeSheet, render } from '../router.js';

/* ---------------- 表单默认值 ---------------- */

export function defaultCheckinForm() {
  return {
    record_date: store.today,
    systolic_mmhg: '',
    diastolic_mmhg: '',
    pulse_bpm: '',
    sleep_hours: '',
    recorded_by_type: 'self',
    vitals_state: 'recorded', // recorded | not_recorded | device_error
    note: '',
  };
}

const form = () => (store.forms.checkin = store.forms.checkin || defaultCheckinForm());

/* ---------------- 视图局部态 ---------------- */

const local = { errors: {}, showVitalsToggle: false, saving: false };

/* ---------------- 页面 ---------------- */

export function checkinScreen() {
  const p = currentPatient();
  const f = form();
  const suc = store.ui.successCheckin;

  const vitalsDisabled = f.vitals_state !== 'recorded';

  return shell({
    title: '记健康',
    body: `
    <div class="stack">
      ${suc ? alert({
        tone: 'ok',
        title: suc.message,
        text: `记录日期：${shortDate(suc.date)}`,
        action: `<div class="btn-row btn-row--inline" style="margin-top:12px">
          ${btn({ label: '看看记录', action: 'nav', variant: 'secondary', size: 'sm', attrs: 'data-nav="#/logs"' })}
          ${btn({ label: '再记一条', action: 'reset-checkin-form', variant: 'quiet', size: 'sm' })}
        </div>`,
      }) : ''}

      <form data-form="checkin" novalidate>
        ${field({
          id: 'record_date', label: '日期', type: 'date',
          value: f.record_date, min: '2020-01-01', max: store.today,
          error: local.errors.record_date,
        })}

        <div class="field">
          <p class="field__label">血压（高压 / 低压）</p>
          <div class="input-row">
            ${field({
              id: 'systolic_mmhg', label: '高压', unit: 'mmHg', inputmode: 'numeric',
              value: vitalsDisabled ? '' : f.systolic_mmhg,
              error: local.errors.systolic_mmhg,
              attrs: vitalsDisabled ? 'disabled' : '',
            })}
            <span class="input-row__sep" aria-hidden="true">/</span>
            ${field({
              id: 'diastolic_mmhg', label: '低压', unit: 'mmHg', inputmode: 'numeric',
              value: vitalsDisabled ? '' : f.diastolic_mmhg,
              error: local.errors.diastolic_mmhg,
              attrs: vitalsDisabled ? 'disabled' : '',
            })}
          </div>

          <button type="button" class="source-link" style="margin-top:12px"
                  data-action="toggle-vitals" aria-expanded="${local.showVitalsToggle}">
            ${local.showVitalsToggle ? '收起' : '高压/低压没测出来'}
          </button>

          ${local.showVitalsToggle ? `
            <div class="card card--flat" style="margin-top:12px;background:var(--c-neutral-bg);border:none">
              <fieldset style="border:none;padding:0;margin:0">
                <legend class="field__label">这次是什么情况？</legend>
                <label class="check">
                  <input type="radio" name="vitals_state" value="not_recorded"
                         data-action="vitals-state" ${f.vitals_state === 'not_recorded' ? 'checked' : ''}>
                  <span>当时没量</span>
                </label>
                <label class="check">
                  <input type="radio" name="vitals_state" value="device_error"
                         data-action="vitals-state" ${f.vitals_state === 'device_error' ? 'checked' : ''}>
                  <span>血压计没测出来</span>
                </label>
                <label class="check">
                  <input type="radio" name="vitals_state" value="recorded"
                         data-action="vitals-state" ${f.vitals_state === 'recorded' ? 'checked' : ''}>
                  <span>其实量了，我要填数字</span>
                </label>
              </fieldset>
            </div>` : ''}
        </div>

        ${field({
          id: 'pulse_bpm', label: '脉搏', unit: '次/分', inputmode: 'numeric',
          value: vitalsDisabled ? '' : f.pulse_bpm,
          error: local.errors.pulse_bpm,
          attrs: vitalsDisabled ? 'disabled' : '',
        })}

        ${field({
          id: 'sleep_hours', label: '睡了几个小时', hint: '可以填小数，比如 6.5',
          unit: '小时', inputmode: 'decimal',
          value: f.sleep_hours, error: local.errors.sleep_hours,
        })}

        ${radioRow({
          name: 'recorded_by_type',
          legend: '记录人',
          options: [{ value: 'self', label: '老人本人' }, { value: 'family', label: '家属代录' }],
          value: f.recorded_by_type,
        })}

        ${textareaField({
          id: 'note', label: '想说的话（可以不说）', value: f.note, rows: 3,
          placeholder: '比如：今天头有点晕',
        })}

        <div class="field">
          ${btnRow([
            btn({
              label: local.saving ? '正在保存…' : '保存记录',
              action: 'save-checkin',
              attrs: local.saving ? 'aria-busy="true"' : '',
            }),
            btn({ label: '取消', action: 'cancel-checkin', variant: 'secondary' }),
          ])}
        </div>
      </form>
    </div>`,
  });
}

/* ---------------- 校验 ---------------- */

function validate(f) {
  const errors = {};
  const intBetween = (v, lo, hi, msg) => {
    if (v === '' || v === null || v === undefined) return null;
    if (!/^\d+$/.test(String(v).trim())) return msg;
    const n = Number(v);
    return n < lo || n > hi ? msg : null;
  };

  /* 日期 */
  if (!f.record_date) errors.record_date = '请选一下日期';
  else if (f.record_date > store.today) errors.record_date = '日期不能选以后的';

  /* 血压与脉搏：只在「量了要填数字」时校验 */
  if (f.vitals_state === 'recorded') {
    const sysErr = intBetween(f.systolic_mmhg, 50, 300, '高压请填 50 到 300 之间的数字');
    if (sysErr) errors.systolic_mmhg = sysErr;

    const diaErr = intBetween(f.diastolic_mmhg, 30, 200, '低压请填 30 到 200 之间的数字');
    if (diaErr) errors.diastolic_mmhg = diaErr;
    else if (!sysErr && f.systolic_mmhg !== '' && f.diastolic_mmhg !== '' &&
             Number(f.diastolic_mmhg) >= Number(f.systolic_mmhg)) {
      errors.diastolic_mmhg = '低压要比高压小';
    }

    const pulseErr = intBetween(f.pulse_bpm, 30, 220, '脉搏请填 30 到 220 之间的数字');
    if (pulseErr) errors.pulse_bpm = pulseErr;
  }

  /* 睡眠：与血压独立 */
  if (f.sleep_hours !== '') {
    if (!/^\d+(\.\d)?$/.test(String(f.sleep_hours).trim())) {
      errors.sleep_hours = '睡眠请填 0 到 24 小时';
    } else {
      const n = Number(f.sleep_hours);
      if (n < 0 || n > 24) errors.sleep_hours = '睡眠请填 0 到 24 小时';
    }
  }
  return errors;
}

const FIRST_FIELD = {
  record_date: '#record_date',
  systolic_mmhg: '#systolic_mmhg',
  diastolic_mmhg: '#diastolic_mmhg',
  pulse_bpm: '#pulse_bpm',
  sleep_hours: '#sleep_hours',
};

/* ---------------- 保存 ---------------- */

async function save() {
  const f = form();
  const errors = validate(f);
  local.errors = errors;

  if (Object.keys(errors).length) {
    store.ui.focusAfterRender = FIRST_FIELD[Object.keys(errors)[0]];
    render();
    return;
  }

  const vitalsBlank = f.vitals_state !== 'recorded' ||
    (f.systolic_mmhg === '' && f.diastolic_mmhg === '' && f.pulse_bpm === '');

  /* 三项读数全空且未显式声明状态 → 必须问清楚 */
  if (vitalsBlank && f.vitals_state === 'recorded') {
    openSheet(sheet({
      title: '血压和脉搏都空着',
      body: '<p>这一条只记睡眠吗？</p>',
      buttons: [
        btn({ label: '只记睡眠', action: 'confirm-blank-vitals' }),
        btn({ label: '回去填血压', action: 'close-sheet', variant: 'secondary' }),
      ],
    }));
    return;
  }

  /* 重复日期 */
  const existing = findCheckin(store.data, store.patientId, f.record_date);
  if (existing) {
    openSheet(sheet({
      title: `${shortDate(f.record_date)} 已经记过了`,
      body: '<p>要改成新的数字吗？</p>',
      buttons: [
        btn({ label: '覆盖', action: 'confirm-overwrite-checkin' }),
        btn({ label: '换个日期', action: 'close-sheet', variant: 'secondary' }),
      ],
    }));
    return;
  }

  await commit();
}

async function commit() {
  const f = form();
  local.saving = true;
  render();

  await wait(store.ui.demo.delayMs);

  if (store.ui.demo.fail.save) {
    local.saving = false;
    render();
    openSheet(sheet({
      title: '没保存上',
      body: `<p>可能是网络不好。刚才填的内容还在，再试一次。</p>`,
      buttons: [
        btn({ label: '重试', action: 'save-checkin' }),
        btn({ label: '先不存了', action: 'close-sheet', variant: 'secondary' }),
      ],
    }));
    return;
  }

  const vitalsRecorded = f.vitals_state === 'recorded' &&
    (f.systolic_mmhg !== '' || f.diastolic_mmhg !== '' || f.pulse_bpm !== '');

  const input = {
    patient_id: store.patientId,
    record_date: f.record_date,
    systolic_mmhg: vitalsRecorded && f.systolic_mmhg !== '' ? Number(f.systolic_mmhg) : null,
    diastolic_mmhg: vitalsRecorded && f.diastolic_mmhg !== '' ? Number(f.diastolic_mmhg) : null,
    pulse_bpm: vitalsRecorded && f.pulse_bpm !== '' ? Number(f.pulse_bpm) : null,
    capture_status: vitalsRecorded ? 'recorded' : f.vitals_state,
    recorded_by_type: f.recorded_by_type,
    sleep_hours: f.sleep_hours === '' ? null : Number(f.sleep_hours),
    /* 血压未记录时，心情列保持原样（可能来自「记心情」页） */
    mood_response: null,
    wants_to_talk: null,
    self_report_note: f.note || null,
  };

  const existing = findCheckin(store.data, store.patientId, f.record_date);
  if (existing) {
    /* 覆盖时保留已有的心情数据（心情在另一个页面维护） */
    input.mood_response = existing.mood_response;
    input.wants_to_talk = existing.wants_to_talk;
    if (!input.self_report_note) input.self_report_note = existing.self_report_note;
  }

  upsertCheckin(input);

  local.saving = false;
  local.errors = {};
  const savedDate = f.record_date;
  store.forms.checkin = { ...defaultCheckinForm(), record_date: savedDate };
  local.showVitalsToggle = false;

  store.ui.successCheckin = {
    date: savedDate,
    message: vitalsRecorded ? '记好了' : (f.vitals_state === 'device_error' ? '记好了，标为设备错误' : '记好了，标为未记录'),
  };
  store.ui.focusAfterRender = '#main';
  render();
}

/* ---------------- 动作 ---------------- */

export const CHECKIN_ACTIONS = {
  'toggle-vitals': () => {
    local.showVitalsToggle = !local.showVitalsToggle;
    if (!local.showVitalsToggle) form().vitals_state = 'recorded';
    render();
  },

  'vitals-state': (el) => {
    form().vitals_state = el.value;
    render();
  },

  'save-checkin': () => { save(); },

  'confirm-blank-vitals': () => {
    form().vitals_state = 'not_recorded';
    closeSheet();
    commit();
  },

  'confirm-overwrite-checkin': () => {
    closeSheet();
    commit();
  },

  'reset-checkin-form': () => {
    store.forms.checkin = defaultCheckinForm();
    store.ui.successCheckin = null;
    local.errors = {};
    local.showVitalsToggle = false;
    render();
  },

  'cancel-checkin': () => {
    const f = form();
    const dirty = f.systolic_mmhg || f.diastolic_mmhg || f.pulse_bpm ||
      f.sleep_hours || f.note || f.vitals_state !== 'recorded';
    if (!dirty) { store.ui.successCheckin = null; store.forms.checkin = null; render(); return; }
    openSheet(sheet({
      title: '刚填的还没保存',
      body: '<p>确定离开吗？</p>',
      buttons: [
        btn({ label: '离开', action: 'really-cancel-checkin', variant: 'danger' }),
        btn({ label: '留下继续填', action: 'close-sheet', variant: 'secondary' }),
      ],
    }));
  },

  'really-cancel-checkin': () => {
    store.forms.checkin = null;
    store.ui.successCheckin = null;
    local.errors = {};
    local.showVitalsToggle = false;
    closeSheet();
    location.hash = '#/';
  },
};
