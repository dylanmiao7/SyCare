/* ============================================================
   router.js · 视图注册、渲染与弹层
   screens/* 只从本文件取 render / openSheet / closeSheet / navigate，
   避免 main.js 与 screens 形成循环依赖。
   ============================================================ */

import { store } from './state.js';
import { shell, loading, emptyState, btn, sheet } from './ui.js';

const app = document.getElementById('app');

const screens = new Map();   // path -> () => html
const actions = new Map();   // action -> (el, event) => void
let overlayHtml = '';
let lastFocused = null;

export function registerScreens(map) {
  Object.entries(map).forEach(([path, fn]) => screens.set(path, fn));
}

export function registerActions(map) {
  Object.entries(map).forEach(([name, fn]) => actions.set(name, fn));
}

export function getAction(name) { return actions.get(name); }

/* ---------------- 路由 ---------------- */

export function currentPath() {
  const raw = location.hash.replace(/^#/, '');
  const path = raw.split('?')[0] || '/';
  return screens.has(path) ? path : '/';
}

export function navigate(path) {
  if (location.hash.replace(/^#/, '') === path) render();
  else location.hash = path;
}

/* ---------------- 渲染 ---------------- */

export function render() {
  if (store.status === 'loading') {
    app.innerHTML = shell({
      title: 'SyCare 健康小助手', showBack: false, body: loading('正在读取模拟资料…'),
    });
    return;
  }
  if (store.status === 'error') {
    app.innerHTML = shell({
      title: 'SyCare 健康小助手', showBack: false,
      body: emptyState({
        icon: '⚠',
        title: '资料没读出来',
        desc: store.error || '请检查网络后重试',
        action: btn({ label: '重新加载', action: 'reload-data' }),
      }),
    });
    return;
  }

  const screen = screens.get(currentPath());
  if (!screen) {
    /* 兜底：视图未注册时给出可读提示，而不是抛 TypeError */
    app.innerHTML = shell({
      title: 'SyCare 健康小助手', showBack: false,
      body: emptyState({
        icon: '⚠',
        title: '页面没找到',
        desc: '请回到首页重新进入。',
        action: btn({ label: '回到首页', action: 'nav', attrs: 'data-nav="#/"' }),
      }),
    });
    return;
  }
  app.innerHTML = screen() + overlayHtml;

  const focusSel = store.ui.focusAfterRender;
  if (focusSel) {
    store.ui.focusAfterRender = null;
    const el = document.querySelector(focusSel);
    if (el) el.focus();
  }
}

/** 局部替换，避免整页重建成输入框失焦 */
export function patch(selector, html) {
  const el = document.querySelector(selector);
  if (el) el.innerHTML = html;
}

/* ---------------- 弹层 ---------------- */

export function openSheet(html) {
  lastFocused = document.activeElement;
  overlayHtml = html;
  render();
  const sheetEl = document.querySelector('[data-sheet]');
  if (sheetEl) { sheetEl.focus(); trapFocus(sheetEl); }
}

export function closeSheet() {
  overlayHtml = '';
  render();
  if (lastFocused && document.contains(lastFocused)) lastFocused.focus();
}

function trapFocus(root) {
  const sel = 'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])';
  root.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') { closeSheet(); return; }
    if (e.key !== 'Tab') return;
    const items = [...root.querySelectorAll(sel)].filter((el) => !el.disabled);
    if (!items.length) return;
    const first = items[0], last = items[items.length - 1];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  });
}

/* 字号弹层（全局共用） */
export function openFontSheet() {
  openSheet(sheet({
    title: '文字大小',
    body: `
      <p class="muted">选一个看得清楚的。</p>
      <div class="choice-grid choice-grid--3" style="margin-top:16px" role="radiogroup" aria-label="文字大小">
        ${[['small', '小'], ['normal', '标准'], ['large', '大']].map(([v, l]) => `
          <button type="button" class="choice" role="radio" aria-checked="${store.font === v}"
                  data-action="set-font" data-value="${v}">
            <span class="choice__label">${l}</span>
          </button>`).join('')}
      </div>
      <p class="field__hint" style="margin-top:16px">这是「${
        store.font === 'small' ? '小' : store.font === 'large' ? '大' : '标准'}」字号的显示效果。</p>`,
    buttons: [btn({ label: '关闭', action: 'close-sheet', variant: 'secondary' })],
  }));
}
