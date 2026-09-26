/* ============================================================
   main.js · 装配入口
   ============================================================ */

import { store, init, clearSession, setPatient } from './state.js';
import {
  render, navigate, registerScreens, registerActions, getAction,
  openFontSheet, closeSheet, currentPath,
} from './router.js';
import { homeScreen, HOME_ACTIONS } from './screens/home.js';
import { checkinScreen, CHECKIN_ACTIONS } from './screens/checkin.js';
import { logsScreen, LOGS_ACTIONS } from './screens/logs.js';
import { moodScreen, MOOD_ACTIONS } from './screens/mood.js';
import { recordsScreen, RECORDS_ACTIONS, handleFileInput } from './screens/records.js';
import { summaryScreen, SUMMARY_ACTIONS } from './screens/summary.js';
import { askScreen, ASK_ACTIONS } from './screens/ask.js';
import { settingsScreen, SETTINGS_ACTIONS } from './screens/settings.js';

/* ---------------- 注册视图 ---------------- */

registerScreens({
  '/': homeScreen,
  '/checkin': checkinScreen,
  '/logs': logsScreen,
  '/mood': moodScreen,
  '/records': recordsScreen,
  '/summary': summaryScreen,
  '/ask': askScreen,
  '/settings': settingsScreen,
});

/* ---------------- 注册动作 ---------------- */

registerActions({
  ...HOME_ACTIONS,
  ...CHECKIN_ACTIONS,
  ...LOGS_ACTIONS,
  ...MOOD_ACTIONS,
  ...RECORDS_ACTIONS,
  ...SUMMARY_ACTIONS,
  ...ASK_ACTIONS,
  ...SETTINGS_ACTIONS,

  /* 全局 */
  'font-size': () => openFontSheet(),
  'set-font': (el) => {
    store.font = el.dataset.value;
    document.documentElement.setAttribute('data-font', store.font);
    closeSheet();
  },
  'nav': (el) => navigate(el.dataset.nav),
  'close-sheet': () => closeSheet(),
  'confirm-clear-session': () => { clearSession(); closeSheet(); render(); },
});

/* ---------------- 事件分发 ---------------- */

const app = document.getElementById('app');

app.addEventListener('click', (e) => {
  const el = e.target.closest('[data-action]');
  if (!el) return;
  const fn = getAction(el.dataset.action);
  if (!fn) return;
  e.preventDefault();
  fn(el, e);
});

/* 表单值写入 store.forms，不触发重渲染（避免输入框失焦） */
function bindFormValue(e) {
  const el = e.target;
  if (!el.name) return;
  const form = el.closest('[data-form]');
  if (!form) return;
  const key = form.dataset.form;
  store.forms[key] = store.forms[key] || {};
  if (el.type === 'radio' && !el.checked) return;
  store.forms[key][el.name] = el.value;
}
app.addEventListener('input', bindFormValue);
app.addEventListener('change', bindFormValue);

window.addEventListener('hashchange', () => { closeSheet(); render(); });

app.addEventListener('keydown', (e) => {
  if (e.key !== 'Enter') return;
  const el = e.target.closest('[data-enter]');
  if (!el) return;
  e.preventDefault();
  const fn = getAction(el.dataset.enter);
  if (fn) fn(el, e);
});

/* 文件选择：整页渲染后会重建 DOM，因此用事件委托挂在容器上 */
app.addEventListener('change', (e) => {
  if (e.target.id === 'file-input') handleFileInput(e.target);
});

/* ---------------- 课堂控制台 ---------------- */

window.SyCare = {
  store,
  navigate,
  setPatient,
  get screen() { return currentPath(); },
  /** 演示开关：
   *   SyCare.demo.fail.save = true      保存失败
   *   SyCare.demo.fail.upload = true    上传失败
   *   SyCare.demo.fail.ask = true       问答超时
   *   SyCare.demo.delayStatus = 'load'  启动加载很慢
   */
  get demo() { return store.ui.demo; },
  font: (v) => { store.font = v; document.documentElement.setAttribute('data-font', v); render(); },
  reload: () => location.reload(),
};

/* ---------------- 启动 ---------------- */

(async function boot() {
  document.documentElement.setAttribute('data-font', store.font);
  render();
  await init();
  render();
})();
