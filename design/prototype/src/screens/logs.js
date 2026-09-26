/* ============================================================
   screens/logs.js · P3 健康记录
   缺失必须可见；心情不画曲线；隐私与代填标注必须出现。
   见 design/03_逐页规格.md P3
   ============================================================ */

import { store, currentPatient } from '../state.js';
import {
  checkinsOf, stats, bpDisplay, sleepDisplay, shortDateWithWeek, shortDate,
  isProxySubjective,
} from '../data.js';
import { metricChart, dayRow, recorderBadge } from '../domain.js';
import {
  shell, esc, btn, btnRow, alert, emptyState, segmented, sheet,
} from '../ui.js';
import { openSheet, closeSheet, render } from '../router.js';

const METRICS = [
  { value: 'bp', label: '血压' },
  { value: 'pulse', label: '脉搏' },
  { value: 'sleep', label: '睡眠' },
];

const METRIC_LABEL = { bp: '血压', pulse: '脉搏', sleep: '睡眠' };

export function logsScreen() {
  const p = currentPatient();
  const rows = checkinsOf(store.data, p.patient_id);
  const metric = store.ui.logsMetric;

  /* 一天都没有 */
  if (!rows.length) {
    return shell({
      title: '健康记录',
      body: emptyState({
        icon: '📋',
        title: '还没有记录',
        desc: '记一条血压，就能在这里回看了。',
        action: btn({ label: '现在就记一条', action: 'nav', attrs: 'data-nav="#/checkin"' }),
      }),
    });
  }

  const st = stats(rows, metric);
  const values = st.values;

  /* 该指标完全没有数据：不画空图表 */
  const chartArea = values.length === 0
    ? alert({
      tone: 'neutral',
      title: `这 ${rows.length} 天都没有${METRIC_LABEL[metric]}记录`,
      text: '没有数据就不会画图，也不会把它当成 0。',
      action: btn({ label: '现在就记一条', action: 'nav', attrs: 'data-nav="#/checkin"' }),
    })
    : `
      ${statLineBlock(st, metric)}
      ${metricChart(rows, metric)}`;

  /* 隐私与代填提示 */
  const notices = [];
  if (p.sharing_preference === '不分享') {
    notices.push(alert({
      tone: 'info',
      title: '本人设置了不分享',
      text: '记录不会自动发给家人。',
      icon: 'ℹ',
    }));
  }
  const proxyCount = rows.filter(isProxySubjective).length;
  if (proxyCount > 0) {
    notices.push(alert({
      tone: 'neutral',
      title: `有 ${proxyCount} 天的心情是家属填写的`,
      text: '这些内容可能不是本人说的，页面已单独标注。',
      icon: '○',
    }));
  }

  const reversed = [...rows].reverse();

  return shell({
    title: '健康记录',
    body: `
    <div class="stack">
      ${notices.join('')}

      ${segmented({ name: '看哪一项', options: METRICS, value: metric })}

      <div class="card">
        <h2 class="section-title">近 ${rows.length} 天${METRIC_LABEL[metric]}</h2>
        ${chartArea}
      </div>

      <div>
        <h2 class="section-title">每天记录</h2>
        <ul class="day-list">
          ${reversed.map((r) => dayRow(r, { action: 'open-day' })).join('')}
        </ul>
      </div>
    </div>`,
  });
}

/* ---------------- 统计行 ---------------- */

function statLineBlock(st, metric) {
  if (st.missing === 0) {
    return `<p class="stat-line"><span class="stat-line__item">近 ${st.total} 天都记好了</span></p>`;
  }
  const device = st.deviceError > 0
    ? `<span class="stat-line__item muted">（其中 ${st.deviceError} 天是设备错误）</span>` : '';
  return `
  <p class="stat-line">
    <span class="stat-line__item"><span class="muted">已记录</span>
      <span class="stat-line__num">${st.recorded}</span><span class="muted">天</span></span>
    <span class="stat-line__item muted">·</span>
    <span class="stat-line__item"><span class="muted">未记录</span>
      <span class="stat-line__num">${st.missing}</span><span class="muted">天</span></span>
    ${device}
  </p>`;
}

/* ---------------- 单日详情弹层 ---------------- */

function openDayDetail(date) {
  const p = currentPatient();
  const row = checkinsOf(store.data, p.patient_id).find((r) => r.record_date === date);
  if (!row) return;

  const bp = bpDisplay(row);
  const sl = sleepDisplay(row);
  const proxy = isProxySubjective(row);
  const askedToTalk = row.wants_to_talk === '愿意';

  const line = (label, value) => `
    <li><span class="info-list__key">${esc(label)}</span>
        <span class="info-list__val">${value}</span></li>`;

  openSheet(sheet({
    title: '这一条记了什么',
    body: `
      <p class="muted">${esc(shortDateWithWeek(date))}</p>
      <ul class="info-list" style="margin-top:12px">
        ${line('记录人', recorderBadge(row))}
        ${line('血压', bp.hasValue
          ? `高压 ${esc(bp.text.split(' / ')[0])} · 低压 ${esc(bp.text.split(' / ')[1])} <span class="unit">mmHg</span>`
          : `<span class="missing"><span class="missing__dash">—</span>${
              row.capture_status === 'device_error'
                ? '<span class="badge badge--device-error"><span aria-hidden="true">⚠</span>设备错误</span>'
                : '<span class="badge badge--not-recorded"><span aria-hidden="true">○</span>未记录</span>'}</span>`)}
        ${line('脉搏', bp.hasValue ? `${esc(bp.pulse)} <span class="unit">次/分</span>`
          : '<span class="missing"><span class="missing__dash">—</span></span>')}
        ${line('睡眠', sl.hasValue ? `${esc(sl.text)} <span class="unit">小时</span>`
          : '<span class="missing"><span class="missing__dash">—</span><span class="badge badge--not-recorded"><span aria-hidden="true">○</span>未记录</span></span>')}
        ${line('心情', row.mood_response === '跳过' || !row.mood_response
          ? '<span class="muted">这次没回答</span>'
          : esc(row.mood_response))}
        ${line('想找人聊聊', row.wants_to_talk === '跳过' || !row.wants_to_talk
          ? '<span class="muted">这次没回答</span>'
          : esc(row.wants_to_talk))}
      </ul>

      ${row.self_report_note ? `
        <div class="card card--flat" style="margin-top:16px;background:var(--c-neutral-bg);border:none">
          <p class="muted">本人留言</p>
          <p class="text-lg">${esc(row.self_report_note)}</p>
        </div>` : ''}

      ${row.recorded_by_type === 'family' ? alert({
        tone: 'info',
        title: '这一条是家人帮忙记的',
        text: proxy
          ? '心情这部分可能不是本人说的，请不要当成本人的意思。'
          : '想修改请联系家人。',
        icon: 'ℹ',
      }) : ''}

      ${askedToTalk ? `
        <div style="margin-top:16px">
          ${btn({ label: '可以联系谁', action: 'nav', variant: 'secondary',
            attrs: `data-nav="#/settings"` })}
          <p class="field__hint" style="margin-top:8px">
            这里只是记下您的想法，不会自动发消息给任何人。
          </p>
        </div>` : ''}

      <p class="field__hint" style="margin-top:16px">
        ${row.recorded_by_type === 'family'
          ? '这条是家人帮忙记的，想改请联系家人。'
          : '本人记录，可以重新保存覆盖这一天的数据。'}
      </p>`,
    buttons: [btn({ label: '关闭', action: 'close-sheet', variant: 'secondary' })],
    bottom: true,
  }));
}

/* ---------------- 动作 ---------------- */

export const LOGS_ACTIONS = {
  'segment': (el) => {
    store.ui.logsMetric = el.dataset.value;
    render();
  },
  'open-day': (el) => openDayDetail(el.dataset.open),
  /* 点图表上的数据点，打开同一天的详情 */
  'chart-point': (el) => openDayDetail(el.dataset.open),
};
