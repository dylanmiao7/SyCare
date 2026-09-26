/* ============================================================
   domain.js · 业务组件
   ClinicalBadge 是全站唯一徽标实现，MissingValue 是唯一允许渲染「—」的组件。
   见 design/04_组件契约与文案库.md §1.2
   ============================================================ */

import { bpDisplay, sleepDisplay, moodDisplay, talkDisplay, shortDate, shortDateWithWeek } from './data.js';
import { esc } from './ui.js';

/* ---------------- ClinicalBadge ---------------- */

const BADGE_TEXT = {
  not_recorded: { icon: '○', label: '未记录' },
  device_error: { icon: '⚠', label: '设备错误' },
  skipped:      { icon: '○', label: '这次没回答' },
  self:         { icon: '',  label: '本人记录' },
  family:       { icon: '',  label: '家属代录' },
  confirmed:    { icon: '✓', label: '已确认' },
  unconfirmed:  { icon: '⚠', label: '未确认' },
  unreadable:   { icon: '⚠', label: '没认出来' },
  proxy:        { icon: '',  label: '家属填写' },
};

export function badge(kind) {
  const spec = BADGE_TEXT[kind];
  if (!spec) return '';
  const icon = spec.icon ? `<span aria-hidden="true">${spec.icon}</span>` : '';
  /* 数据里的 kind 用下划线（device_error），CSS 类名用连字符（badge--device-error） */
  const cls = String(kind).replace(/_/g, '-');
  return `<span class="badge badge--${cls}">${icon}${esc(spec.label)}</span>`;
}

/* 记录人徽标（本人记录 / 家属代录） */
export const recorderBadge = (row) =>
  badge(row.recorded_by_type === 'family' ? 'family' : 'self');

/* ---------------- MissingValue ---------------- */

/** 血压/脉搏：记录到数值或三态缺失 */
export function bpValue(row, { showBadge = true, showPulse = true } = {}) {
  const d = bpDisplay(row);
  if (!d.hasValue) {
    return `<span class="missing">
      <span class="missing__dash" aria-hidden="true">—</span>
      <span class="sr-only">没有记录</span>
      ${showBadge ? badge(d.kind) : ''}
    </span>`;
  }
  const pulse = showPulse
    ? ` · 脉搏 <span class="strong">${esc(d.pulse)}</span> <span class="unit">次/分</span>`
    : '';
  return `高压 <span class="strong">${esc(d.text.split(' / ')[0])}</span> <span class="unit">mmHg</span>
    · 低压 <span class="strong">${esc(d.text.split(' / ')[1])}</span> <span class="unit">mmHg</span>${pulse}`;
}

/** 睡眠：与 capture_status 独立 */
export function sleepValue(row, { showBadge = true } = {}) {
  const d = sleepDisplay(row);
  if (!d.hasValue) {
    return `<span class="missing">
      <span class="missing__dash" aria-hidden="true">—</span>
      <span class="sr-only">没有记录</span>
      ${showBadge ? badge('not_recorded') : ''}
    </span>`;
  }
  return `<span class="strong">${esc(d.text)}</span> <span class="unit">小时</span>`;
}

/** 心情：跳过显示「这次没回答」 */
export function moodValue(value, { showBadge = false } = {}) {
  const d = moodDisplay(value);
  if (d.skipped) {
    return `<span class="muted">${esc(d.text)}</span>${showBadge ? ' ' + badge('skipped') : ''}`;
  }
  return `<span class="strong">${esc(d.text)}</span>`;
}

/** 交流意愿 */
export function talkValue(value, { showBadge = false } = {}) {
  const d = talkDisplay(value);
  if (d.skipped) {
    return `<span class="muted">${esc(d.text)}</span>${showBadge ? ' ' + badge('skipped') : ''}`;
  }
  return `<span class="strong">${esc(d.text)}</span>`;
}

/* ---------------- StatLine ---------------- */

/**
 * 统计句：必须同时说清「有几天」和「缺几天」。
 * 见 design/03_逐页规格.md P3
 */
export function statLine(st, metricLabel) {
  if (st.total > 0 && st.missing === 0) {
    return `<p class="stat-line"><span class="stat-line__item">
      近 ${st.total} 天都记好了</span></p>`;
  }
  const device = st.deviceError > 0
    ? ` <span class="muted">（${st.deviceError} 天是设备错误）</span>` : '';
  return `<p class="stat-line">
    <span class="stat-line__item">
      <span class="muted">已记录</span>
      <span class="stat-line__num">${st.recorded}</span>
      <span class="muted">天</span>
    </span>
    <span class="stat-line__item">
      <span class="muted">·</span>
    </span>
    <span class="stat-line__item">
      <span class="muted">未记录</span>
      <span class="stat-line__num">${st.missing}</span>
      <span class="muted">天</span>
    </span>
    ${device}
  </p>`;
}

/* ---------------- MetricChart（纯 SVG，无图表库） ---------------- */

const W = 720;
const PAD = { l: 56, r: 64, t: 28, b: 46 };
const H = 220;
const PLOT_W = W - PAD.l - PAD.r;
const PLOT_H = H - PAD.t - PAD.b;

/**
 * @param rows      按日期升序的 daily_checkins
 * @param metric    'bp' | 'pulse' | 'sleep'
 */
export function metricChart(rows, metric) {
  const n = rows.length;
  if (!n) return '';

  const x = (i) => PAD.l + (n === 1 ? PLOT_W / 2 : (i * PLOT_W) / (n - 1));

  /* ---- Y 轴范围与参考带 ---- */
  let yMin = 0, yMax = 100, band = null, threshold = null, axisTicks = [], unit = '';

  if (metric === 'bp') {
    yMin = 90; yMax = 180; unit = 'mmHg';
    band = { from: 140, to: yMax, label: '偏高范围' };
    axisTicks = [100, 140, 180];
  } else if (metric === 'pulse') {
    yMin = 40; yMax = 120; unit = '次/分';
    axisTicks = [60, 80, 100];
  } else {
    yMin = 0; yMax = 12; unit = '小时';
    threshold = { at: 6, label: '少于 6 小时' };
    axisTicks = [0, 6, 12];
  }

  const y = (v) => PAD.t + PLOT_H - ((v - yMin) / (yMax - yMin)) * PLOT_H;

  /* ---- 数据点 ---- */
  const points = rows.map((row, i) => {
    if (metric === 'bp') {
      const d = bpDisplay(row);
      return d.hasValue
        ? { i, x: x(i), y: y(row.systolic_mmhg), value: row.systolic_mmhg, ok: true,
            dia: y(row.diastolic_mmhg), diaValue: row.diastolic_mmhg,
            err: false, date: row.record_date, row }
        : { i, x: x(i), y: null, ok: false, err: row.capture_status === 'device_error',
            date: row.record_date, row };
    }
    if (metric === 'pulse') {
      const d = bpDisplay(row);
      return d.hasValue
        ? { i, x: x(i), y: y(row.pulse_bpm), value: row.pulse_bpm, ok: true, err: false,
            date: row.record_date, row }
        : { i, x: x(i), y: null, ok: false, err: row.capture_status === 'device_error',
            date: row.record_date, row };
    }
    const d = sleepDisplay(row);
    return d.hasValue
      ? { i, x: x(i), y: y(row.sleep_hours), value: row.sleep_hours, ok: true, err: false,
          date: row.record_date, row }
      : { i, x: x(i), y: null, ok: false, err: false, date: row.record_date, row };
  });

  /* ---- 折线：遇到缺失严格断开，绝不跨越（见 03 文档 P3） ---- */
  const runs = [];
  let run = [];
  points.forEach((p) => {
    if (p.ok) run.push(p);
    else { if (run.length) runs.push(run); run = []; }
  });
  if (run.length) runs.push(run);

  const cls = metric === 'bp' ? 'bp' : metric === 'pulse' ? 'pulse' : 'sleep';
  const lines = runs
    .filter((r) => r.length > 1)
    .map((r) => `<path class="chart__line chart__line--${cls}" d="${
      r.map((p, k) => `${k === 0 ? 'M' : 'L'} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(' ')
    }"/>`)
    .join('');

  /* ---- 缺失标记：虚线段 + 空心圆；设备错误额外加 ⚠ ---- */
  const gaps = points
    .filter((p) => !p.ok)
    .map((p) => `<line class="chart__gap" x1="${p.x}" y1="${PAD.t + 10}" x2="${p.x}" y2="${PAD.t + PLOT_H}"/>` +
      `<circle class="chart__missing" cx="${p.x}" cy="${PAD.t + PLOT_H}" r="5"/>` +
      (p.err ? `<text class="chart__err" x="${p.x}" y="${PAD.t + 4}" text-anchor="middle">⚠</text>` : ''))
    .join('');

  /* ---- 数据点 ---- */
  const dots = points.filter((p) => p.ok).map((p) => {
    if (metric === 'bp') {
      return `<circle class="chart__dot--bp" cx="${p.x.toFixed(1)}" cy="${p.y.toFixed(1)}" r="5.5"/>` +
             `<rect class="chart__dot--pulse" x="${(p.x - 4.5).toFixed(1)}" y="${(p.dia - 4.5).toFixed(1)}" width="9" height="9"/>`;
    }
    const c = metric === 'pulse' ? 'chart__dot--pulse' : 'chart__dot--bp';
    return `<circle class="${c}" cx="${p.x.toFixed(1)}" cy="${p.y.toFixed(1)}" r="5.5"/>`;
  }).join('');

  /* ---- 点击热区：每个数据点一个 ---- */
  /* 热区以数据点为中心，避免相邻日期的热区互相重叠（点错日期） */
  const HIT_R = 22;
  const hits = points.map((p) => {
    const cy = p.ok ? p.y : PAD.t + PLOT_H;
    const attrs = `class="chart__hit" data-action="chart-point" data-open="${esc(p.date)}"
      role="button" aria-label="看 ${esc(shortDateWithWeek(p.date))} 这一天的详情"`;
    return metric === 'bp' && p.ok
      ? `<circle cx="${p.x.toFixed(1)}" cy="${cy.toFixed(1)}" r="${HIT_R}" ${attrs}/>`
      : `<rect x="${(p.x - HIT_R / 2).toFixed(1)}" y="${(cy - HIT_R).toFixed(1)}"
          width="${HIT_R}" height="${HIT_R * 2}" rx="6" ${attrs}/>`;
  }).join('');

  /* ---- 参考带（填充 + 描边，见 02 文档修正） ---- */
  let bandSvg = '';
  if (band) {
    const yTop = y(band.to), yBot = y(band.from);
    bandSvg = `<rect class="chart__band" x="${PAD.l}" y="${yTop.toFixed(1)}"
        width="${PLOT_W}" height="${(yBot - yTop).toFixed(1)}"/>
      <text class="chart__band-label" x="${PAD.l + 8}" y="${(yTop + 20).toFixed(1)}">${esc(band.label)}</text>`;
  }
  if (threshold) {
    bandSvg += `<line class="chart__threshold" x1="${PAD.l}" y1="${y(threshold.at).toFixed(1)}"
        x2="${PAD.l + PLOT_W}" y2="${y(threshold.at).toFixed(1)}"/>
      <text class="chart__band-label" x="${PAD.l + 8}" y="${(y(threshold.at) - 6).toFixed(1)}">${esc(threshold.label)}</text>`;
  }

  /* ---- 坐标轴 ---- */
  const grid = axisTicks.map((t) =>
    `<line class="chart__grid" x1="${PAD.l}" y1="${y(t).toFixed(1)}" x2="${PAD.l + PLOT_W}" y2="${y(t).toFixed(1)}"/>
     <text class="chart__axis" x="${PAD.l - 10}" y="${(y(t) + 5).toFixed(1)}" text-anchor="end">${t}</text>`).join('');

  const step = Math.max(1, Math.round(n / 6));
  const xTicks = points.filter((_, i) => i % step === 0 || i === n - 1).map((p) =>
    `<text class="chart__axis" x="${p.x.toFixed(1)}" y="${H - 16}" text-anchor="middle">${esc(shortDate(p.date))}</text>`).join('');

  const axisTitle = `<text class="chart__axis" x="${PAD.l - 10}" y="${PAD.t - 10}" text-anchor="end">${esc(unit)}</text>`;

  /* ---- 概括文本 + 无障碍数据表 ---- */
  const st = rows.length;
  const okCount = points.filter((p) => p.ok).length;
  const summary = `近 ${st} 天${metric === 'bp' ? '血压' : metric === 'pulse' ? '脉搏' : '睡眠'}图，已记录 ${okCount} 天。`;

  const tableRows = rows.map((row) => {
    if (metric === 'bp') {
      const d = bpDisplay(row);
      return `<tr><td>${esc(row.record_date)}</td><td>${d.hasValue ? d.text : '没有记录'}</td></tr>`;
    }
    if (metric === 'pulse') {
      const d = bpDisplay(row);
      return `<tr><td>${esc(row.record_date)}</td><td>${d.hasValue ? row.pulse_bpm : '没有记录'}</td></tr>`;
    }
    const d = sleepDisplay(row);
    return `<tr><td>${esc(row.record_date)}</td><td>${d.hasValue ? d.text : '没有记录'}</td></tr>`;
  }).join('');

  return `
  <figure class="chart-wrap">
    <svg class="chart" viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMid meet"
         role="img" aria-label="${esc(summary)}">
      <title>${esc(summary)}</title>
      ${bandSvg}${grid}${axisTitle}${lines}${gaps}${dots}${xTicks}${hits}
    </svg>
    <table class="sr-only">
      <caption>${esc(summary)}</caption>
      <thead><tr><th>日期</th><th>数值</th></tr></thead>
      <tbody>${tableRows}</tbody>
    </table>
    <figcaption class="legend">
      ${metric === 'bp' ? `
        <span class="legend__item"><svg class="legend__swatch" viewBox="0 0 22 14"><circle cx="11" cy="7" r="5.5" fill="var(--c-chart-bp)"/></svg>高压</span>
        <span class="legend__item"><svg class="legend__swatch" viewBox="0 0 22 14"><rect x="6" y="2" width="10" height="10" fill="var(--c-chart-pulse)"/></svg>低压</span>
      ` : metric === 'pulse' ? `
        <span class="legend__item"><svg class="legend__swatch" viewBox="0 0 22 14"><rect x="6" y="2" width="10" height="10" fill="var(--c-chart-pulse)"/></svg>脉搏</span>
      ` : `
        <span class="legend__item"><svg class="legend__swatch" viewBox="0 0 22 14"><circle cx="11" cy="7" r="5.5" fill="var(--c-chart-sleep)"/></svg>睡眠</span>
      `}
      <span class="legend__item"><svg class="legend__swatch" viewBox="0 0 22 14"><line x1="2" y1="7" x2="20" y2="7" stroke="var(--c-chart-grid)" stroke-width="3" stroke-dasharray="3 5"/><circle cx="11" cy="7" r="5" fill="none" stroke="var(--c-ink-subtle)" stroke-width="2"/></svg>没记录</span>
      ${metric === 'bp' ? `<span class="legend__item"><svg class="legend__swatch" viewBox="0 0 22 14"><rect x="2" y="2" width="18" height="10" fill="var(--c-chart-band-fill)" stroke="var(--c-chart-band-stroke)"/></svg>偏高范围</span>` : ''}
      ${metric === 'sleep' ? `<span class="legend__item"><svg class="legend__swatch" viewBox="0 0 22 14"><line x1="2" y1="7" x2="20" y2="7" stroke="var(--c-chart-threshold)" stroke-width="2" stroke-dasharray="6 5"/></svg>少于 6 小时</span>` : ''}
    </figcaption>
    <p class="legend__caption">点一下某个点，可以看那一天记了什么。</p>
  </figure>`;
}

/* ---------------- 记录行 ---------------- */

/** 单条每日记录（含缺失三态、记录人、代填标注） */
export function dayRow(row, { action = 'open-day' } = {}) {
  const isFamily = row.recorded_by_type === 'family';
  const proxy = isFamily && ((row.mood_response && row.mood_response !== '跳过') ||
                            (row.wants_to_talk && row.wants_to_talk !== '跳过'));

  return `
  <li>
    <button type="button" class="day-row" data-action="${esc(action)}" data-open="${esc(row.record_date)}"
            aria-label="${esc(shortDateWithWeek(row.record_date))} 的记录详情">
      <span class="day-row__head">
        <span class="day-row__date">${esc(shortDateWithWeek(row.record_date))}</span>
        <span>${recorderBadge(row)}</span>
      </span>
      <span class="day-row__metrics">
        <span class="day-row__metric">
          <span class="day-row__metric-label">血压</span>${bpValue(row)}
        </span>
        <span class="day-row__metric">
          <span class="day-row__metric-label">睡眠</span>${sleepValue(row)}
        </span>
        <span class="day-row__metric">
          <span class="day-row__metric-label">心情</span>${moodValue(row.mood_response)}
          ${proxy && row.mood_response !== '跳过' ? badge('proxy') : ''}
        </span>
      </span>
      ${row.self_report_note ? `<span class="day-row__note">本人留言：${esc(row.self_report_note)}</span>` : ''}
    </button>
  </li>`;
}
