/* ============================================================
   screens/summary.js · P6 复诊小结
   只从已有记录整理事实，不做诊断；必须标出缺少的信息；可编辑可打印。
   见 design/03_逐页规格.md P6
   ============================================================ */

import { store, currentPatient, saveSummaryDraft, summaryDraftOf } from '../state.js';
import {
  checkinsOf, recordsOf, stats, tally, scanMissing, shortDate, longDate,
} from '../data.js';
import { shell, esc, btn, btnRow, alert, field, textareaField, round1, round0, sheet } from '../ui.js';
import { openSheet, closeSheet, render } from '../router.js';

/* ---------------- 草稿生成 ---------------- */

export function generateSummary(patient, rows, records, from, to) {
  const bp = stats(rows, 'bp');
  const sleep = stats(rows, 'sleep');
  const mood = tally(rows, 'mood_response');
  const talk = tally(rows, 'wants_to_talk');
  const missing = scanMissing(rows, patient);
  const past = (d) => d < store.today;
  const errDates = bp.deviceErrorDates.filter(past);

  const L = [];
  L.push('【复诊小结草稿】');
  L.push(`姓名：${patient.display_name}　年龄：${patient.age_years}岁`);
  L.push(`时间范围：${longDate(from)} — ${longDate(to)}`);
  L.push('');

  /* 一、血压 */
  L.push('一、血压');
  if (bp.recorded === 0) {
    L.push('这段时间没有血压记录。');
  } else {
    L.push(`共记录 ${bp.recorded} 天。高压平均 ${round0(bp.avg)}，范围 ${round0(bp.min)}—${round0(bp.max)}。`);
    const diaVals = rows
      .filter((r) => r.capture_status === 'recorded' && r.diastolic_mmhg !== null)
      .map((r) => r.diastolic_mmhg);
    const diaAvg = diaVals.length ? diaVals.reduce((a, b) => a + b, 0) / diaVals.length : null;
    L.push(`低压平均 ${round0(diaAvg)}。`);
    const high = bp.values.filter((v) => v >= 140).length;
    if (high) L.push(`其中 ${high} 天高压到 140 或以上。`);
    if (errDates.length) {
      L.push(`有 ${errDates.length} 天设备没测出来（${errDates.map(shortDate).join('、')}）。`);
    }
    if (bp.missing > errDates.length) {
      L.push(`另有 ${bp.missing - errDates.length} 天没有记录血压。`);
    }
  }
  L.push('');

  /* 二、睡眠 */
  L.push('二、睡眠');
  if (sleep.recorded === 0) {
    L.push('这段时间没有睡眠记录。');
  } else {
    L.push(`共记录 ${sleep.recorded} 天。平均 ${round1(sleep.avg)} 小时，最少 ${round1(sleep.min)} 小时，最多 ${round1(sleep.max)} 小时。`);
    const low = sleep.values.filter((v) => v < 6).length;
    if (low) L.push(`其中 ${low} 天少于 6 小时。`);
    if (sleep.missing) L.push(`有 ${sleep.missing} 天没有记录睡眠。`);
  }
  L.push('');

  /* 三、心情与交流意愿（只计数，不做定性） */
  L.push('三、心情与交流意愿');
  const moodParts = [];
  if (mood['很好']) moodParts.push(`${mood['很好']} 天很好`);
  if (mood['一般']) moodParts.push(`${mood['一般']} 天一般`);
  if (mood['不太好']) moodParts.push(`${mood['不太好']} 天不太好`);
  if (mood['跳过']) moodParts.push(`${mood['跳过']} 天没有回答`);
  L.push(`心情：${moodParts.length ? moodParts.join('，') : '这段时间没有记录'}。`);
  if (talk['愿意']) L.push(`有 ${talk['愿意']} 天表示愿意找人聊聊。`);

  const proxyRows = rows.filter((r) => r.recorded_by_type === 'family');
  if (proxyRows.length === rows.length && rows.length) {
    L.push('说明：这段时间的记录由家属代录，心情与交流意愿可能不是本人说的。');
  } else if (proxyRows.length) {
    L.push(`说明：其中 ${proxyRows.length} 天由家属代录。`);
  }
  L.push('');

  /* 四、病历摘要 */
  L.push('四、病历摘要');
  if (!records.length) {
    L.push('这段时间没有病历记录。');
  } else {
    records.forEach((r) => {
      const firstLines = r.record_text.split('\n').filter((x) => x.trim()).slice(1, 4).join(' ');
      L.push(`${longDate(r.record_date)}${r.record_type}：${firstLines}`);
    });
  }
  L.push('');

  /* 五、缺少的信息 */
  L.push('五、缺少的信息');
  if (!missing.length) {
    L.push('没有发现明显的缺项。');
  } else {
    missing.forEach((m) => L.push(`· ${m.text}`));
  }
  L.push('');

  /* 六、想问医生的问题（本人手填） */
  L.push('六、想问医生的问题（自己填）');
  L.push('');
  L.push('');
  L.push('—— 本小结由已有记录自动整理，不是诊断。');

  return L.join('\n');
}

/* ---------------- 页面 ---------------- */

export function summaryScreen() {
  const p = currentPatient();
  const all = checkinsOf(store.data, p.patient_id);
  const draft = summaryDraftOf(p.patient_id);

  const from = (store.forms.summary && store.forms.summary.__from) || (all.length ? all[0].record_date : store.today);
  const to = (store.forms.summary && store.forms.summary.__to) || store.today;
  const rows = all.filter((r) => r.record_date >= from && r.record_date <= to);
  const records = recordsOf(store.data, p.patient_id).filter((r) => r.record_date >= from && r.record_date <= to);

  const tooFew = rows.filter((r) => r.capture_status === 'recorded').length < 3;
  const missing = rows.length ? scanMissing(rows, p) : [];

  return shell({
    title: '复诊小结',
    body: `
    <div class="stack">
      <div class="card no-print">
        <h2 class="section-title">看医生的时间范围</h2>
        <div class="input-row">
          ${field({ id: 'summary_from', label: '从', type: 'date', value: from,
            min: '2000-01-01', max: store.today, attrs: 'data-range="from"' })}
          <span class="input-row__sep" aria-hidden="true">到</span>
          ${field({ id: 'summary_to', label: '到', type: 'date', value: to,
            min: '2000-01-01', max: store.today, attrs: 'data-range="to"' })}
        </div>
        <p class="field__hint" style="margin-top:12px">
          这段时间里有 ${rows.length} 天记录${records.length ? `、${records.length} 份病历` : ''}。
        </p>
      </div>

      ${alert({
        tone: 'info',
        icon: 'ℹ',
        title: '这是自动整理的草稿',
        text: '请自己看一遍、改一改，再打印。',
      })}

      ${tooFew ? alert({
        tone: 'warn',
        title: '记录还太少',
        text: '这段时间里量过的天数不到 3 天，小结可能看不出变化。',
        action: btn({ label: '去记健康', action: 'nav', variant: 'secondary', size: 'sm',
          attrs: 'data-nav="#/checkin"' }),
      }) : ''}

      ${missing.length ? `
        <div class="card no-print">
          <h2 class="section-title">缺少的信息（请医生注意）</h2>
          <ul class="missing-info">
            ${missing.map((m) => `<li>
              <span class="missing-info__bullets" aria-hidden="true">•</span>
              <span>${esc(m.text)}</span>
            </li>`).join('')}
          </ul>
        </div>` : ''}

      <div class="no-print">
        ${btnRow([
          btn({ label: draft ? '重新生成' : '生成草稿', action: draft ? 'ask-regenerate' : 'generate-summary' }),
          btn({ label: '打印', action: 'print-summary', variant: 'secondary' }),
          btn({ label: '清空重来', action: 'ask-clear-summary', variant: 'quiet' }),
        ], true)}
      </div>

      <div data-summary-slot>
        <h2 class="section-title no-print">小结内容（可以直接改）</h2>
        ${draft ? `
          ${draft.edited ? '<p class="no-print" style="margin-bottom:8px">' +
            '<span class="badge badge--confirmed">已修改</span></p>' : ''}
          <textarea class="textarea summary-edit" id="summary_text" data-summary-text
                    aria-label="小结内容">${esc(
                      (store.forms.summary && store.forms.summary.__text) || draft.text
                    )}</textarea>
          <p class="field__hint no-print" style="margin-top:8px">
            改完的内容只保存在这次打开的页面里。
          </p>` : `
          <div class="summary-body muted">还没有生成。点上面的「生成草稿」，会按您记过的资料整理出一份。</div>`}
      </div>

      ${draft ? `
        <details class="disclosure no-print">
          <summary>这份小结用了哪些记录</summary>
          <div>
            <ul class="source-list">
              <li>每日记录 ${rows.length} 条（daily_checkins，patient_id = ${esc(p.patient_id)}，
                ${esc(shortDate(from))} 至 ${esc(shortDate(to))}）
                ${rows.length ? `<button type="button" class="source-link" data-action="nav"
                  data-nav="#/logs">看看这些记录</button>` : ''}</li>
              <li>病历 ${records.length} 条（medical_records${records.length
                ? '：' + records.map((r) => esc(r.record_id)).join('、') : ''}）</li>
              <li>档案 1 条（patients：${esc(p.patient_id)}）</li>
            </ul>
            <p class="field__hint" style="margin-top:12px">
              生成时间：${esc(longDate(store.today))}　自动整理，未经医生审核
            </p>
          </div>
        </details>` : ''}

      <p class="print-only">
        本小结由已有记录自动整理，不是诊断 —— SyCare 模拟演示
      </p>
    </div>`,
  });
}

/* ---------------- 动作 ---------------- */

export const SUMMARY_ACTIONS = {
  'generate-summary': () => {
    const p = currentPatient();
    const all = checkinsOf(store.data, p.patient_id);
    const f = store.forms.summary || {};
    const from = f.__from || (all.length ? all[0].record_date : store.today);
    const to = f.__to || store.today;
    const rows = all.filter((r) => r.record_date >= from && r.record_date <= to);
    const records = recordsOf(store.data, p.patient_id)
      .filter((r) => r.record_date >= from && r.record_date <= to);

    const text = generateSummary(p, rows, records, from, to);
    store.forms.summary = { ...f, __from: from, __to: to, __text: text };
    saveSummaryDraft({
      patient_id: p.patient_id,
      range_start: from, range_end: to,
      text, edited: false,
      generated_at: store.today,
      sources: {
        checkins: rows.length, checkinIds: rows.map((r) => r.checkin_id),
        records: records.length, recordIds: records.map((r) => r.record_id),
        patient: p.patient_id,
      },
    });
    render();
  },

  'ask-regenerate': () => {
    openSheet(sheet({
      title: '重新生成会覆盖您改过的内容',
      body: '<p>确定要重新生成吗？</p>',
      buttons: [
        btn({ label: '重新生成', action: 'generate-summary', variant: 'danger' }),
        btn({ label: '不要', action: 'close-sheet', variant: 'secondary' }),
      ],
    }));
  },

  'print-summary': () => {
    syncSummaryText();
    window.print();
  },

  'ask-clear-summary': () => {
    openSheet(sheet({
      title: '清空这份小结？',
      body: '<p>清空后要重新点「生成草稿」。</p>',
      buttons: [
        btn({ label: '清空', action: 'do-clear-summary', variant: 'danger' }),
        btn({ label: '留下', action: 'close-sheet', variant: 'secondary' }),
      ],
    }));
  },

  'do-clear-summary': () => {
    const p = currentPatient();
    const i = store.summaryDrafts.findIndex((d) => d.patient_id === p.patient_id);
    if (i >= 0) store.summaryDrafts.splice(i, 1);
    store.forms.summary = null;
    closeSheet();
    render();
  },
};

/* 编辑内容回收（输入时不重渲染，离开或打印前取回） */
export function syncSummaryText() {
  const el = document.querySelector('[data-summary-text]');
  if (!el) return;
  const p = currentPatient();
  const draft = summaryDraftOf(p.patient_id);
  if (!draft) return;
  const edited = el.value !== draft.text;
  draft.text = el.value;
  if (edited) draft.edited = true;
  if (store.forms.summary) store.forms.summary.__text = el.value;
}
