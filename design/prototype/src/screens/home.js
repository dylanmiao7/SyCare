/* ============================================================
   screens/home.js · P1 首页
   ============================================================ */

import { store, currentPatient, setPatient, init } from '../state.js';
import { findCheckin } from '../data.js';
import { shell, esc, btn, alert } from '../ui.js';
import { openSheet, closeSheet, render } from '../router.js';

const hourOf = (iso) => 8; // 演示固定早上，避免与 2026-08-30 数据矛盾

function greeting() {
  const h = hourOf(store.today);
  if (h < 11) return '早上好';
  if (h < 18) return '下午好';
  return '晚上好';
}

/* ---------------- 今日状态条 ---------------- */

function todayStatus(patientId) {
  const row = findCheckin(store.data, patientId, store.today);
  if (!row) {
    return {
      cls: '',
      icon: '○',
      title: '今天还没记',
      desc: '记一条血压，大约 30 秒',
    };
  }
  if (row.capture_status === 'recorded') {
    return {
      cls: ' status-bar--done',
      icon: '✓',
      title: '今天已经记过了',
      desc: `高压 ${row.systolic_mmhg} · 低压 ${row.diastolic_mmhg}`,
    };
  }
  if (row.capture_status === 'device_error') {
    return {
      cls: ' status-bar--warn',
      icon: '⚠',
      title: '今天的血压没测出来',
      desc: '可以再量一次，或检查血压计',
    };
  }
  return {
    cls: '',
    icon: '○',
    title: '今天的血压没记',
    desc: '当时没量，可以现在补一条',
  };
}

/* ---------------- 五个入口 ---------------- */

const ENTRIES = [
  { icon: '💬', title: '问一问',   desc: '健康问题、病历内容都能问', href: '#/ask' },
  { icon: '❤️', title: '记健康',   desc: '血压、脉搏、睡眠',         href: '#/checkin' },
  { icon: '😊', title: '记心情',   desc: '今天怎么样，可以跳过',     href: '#/mood' },
  { icon: '📁', title: '存病历',   desc: '拍照片或存 PDF',          href: '#/records' },
  { icon: '📄', title: '复诊小结', desc: '看医生前准备一张纸',       href: '#/summary' },
];

/* ---------------- 首页 ---------------- */

export function homeScreen() {
  const p = currentPatient();
  if (!p) {
    return shell({
      title: 'SyCare 健康小助手', showBack: false,
      body: alert({
        tone: 'warn',
        title: '还没有老人资料',
        text: '这是一个演示版本，先加载模拟资料吧。',
        action: btn({ label: '加载模拟资料', action: 'reload-data' }),
      }),
    });
  }

  const st = todayStatus(p.patient_id);

  return shell({
    title: 'SyCare 健康小助手',
    showBack: false,
    body: `
    <div class="stack">
      <div>
        <p class="hero">${greeting()}，${esc(p.display_name)}</p>
        <p class="muted">${esc(p.age_years)}岁 · ${esc(p.living_arrangement)} · 支持对象：${esc(p.support_person)}</p>
        <p style="margin-top:8px">
          <button type="button" class="source-link" data-action="switch-patient">
            换一位演示老人（当前 ${esc(p.patient_id)}）
          </button>
        </p>
      </div>

      <button type="button" class="status-bar${st.cls}" data-action="nav" data-nav="#/checkin">
        <span class="status-bar__icon" aria-hidden="true">${st.icon}</span>
        <span>
          <span class="status-bar__title">${esc(st.title)}</span><br>
          <span class="status-bar__desc">${esc(st.desc)}</span>
        </span>
      </button>

      <div>
        <h2 class="section-title">您要做什么？</h2>
        <ul class="entry-list">
          ${ENTRIES.map((e) => `
            <li>
              <button type="button" class="entry-card" data-action="nav" data-nav="${e.href}">
                <span class="entry-card__icon" aria-hidden="true">${e.icon}</span>
                <span class="entry-card__text">
                  <span class="entry-card__title">${esc(e.title)}</span><br>
                  <span class="entry-card__desc">${esc(e.desc)}</span>
                </span>
                <span class="entry-card__chev" aria-hidden="true">›</span>
              </button>
            </li>`).join('')}
        </ul>
      </div>
    </div>`,
  });
}

/* ---------------- 动作 ---------------- */

export const HOME_ACTIONS = {
  'reload-data': async () => {
    store.status = 'loading';
    render();
    await init();
    render();
  },

  'switch-patient': () => {
    openSheet({
      title: '换一位演示老人',
      body: `
        <p class="muted">课堂上建议先看 SYN-001、SYN-003、SYN-006。</p>
        <ul class="file-list" style="margin-top:16px">
          ${store.data.patients.map((p) => {
            const hint = {
              'SYN-001': '血压趋势、本人记录',
              'SYN-003': '睡眠变少、愿意交流、家属代录',
              'SYN-006': '享受独处、不分享',
            }[p.patient_id] || `${p.age_years}岁 · ${p.living_arrangement}`;
            return `<li>
              <button type="button" class="day-row" data-action="pick-patient" data-value="${esc(p.patient_id)}">
                <span class="day-row__head">
                  <span class="day-row__date">${esc(p.display_name)}（${esc(p.patient_id)}）</span>
                  ${p.patient_id === store.patientId ? '<span class="badge badge--confirmed">当前</span>' : ''}
                </span>
                <span class="muted">${esc(hint)}</span>
              </button>
            </li>`;
          }).join('')}
        </ul>`,
      buttons: [btn({ label: '关闭', action: 'close-sheet', variant: 'secondary' })],
      bottom: true,
    });
  },

  'pick-patient': (el) => {
    setPatient(el.dataset.value);
    closeSheet();
    location.hash = '#/';
    render();
  },
};
