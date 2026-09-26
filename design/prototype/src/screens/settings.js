/* ============================================================
   screens/settings.js · P8 设置
   字号切换、身份与分享说明、演示免责、清空本次内容。
   ============================================================ */

import { store, currentPatient, clearSession } from '../state.js';
import { shell, esc, btn, btnRow, alert, sheet } from '../ui.js';
import { openSheet, closeSheet, render } from '../router.js';

const FONT_LABEL = { small: '小', normal: '标准', large: '大' };

export function settingsScreen() {
  const p = currentPatient();

  const allergyWarn = p.allergy_status === '未知';
  const noShare = p.sharing_preference === '不分享';

  const row = (k, v) => `
    <li><span class="info-list__key">${esc(k)}</span>
        <span class="info-list__val">${v}</span></li>`;

  return shell({
    title: '设置',
    body: `
    <div class="stack">
      <div class="card">
        <h2 class="section-title">文字大小</h2>
        <div class="choice-grid choice-grid--3" role="radiogroup" aria-label="文字大小">
          ${['small', 'normal', 'large'].map((v) => `
            <button type="button" class="choice" role="radio"
                    aria-checked="${store.font === v}"
                    data-action="set-font" data-value="${v}">
              <span class="choice__label">${FONT_LABEL[v]}</span>
            </button>`).join('')}
        </div>
        <p class="field__hint" style="margin-top:16px">
          这是「${FONT_LABEL[store.font]}」字号的显示效果。选完立即生效，不用刷新。
        </p>
      </div>

      <div class="card">
        <h2 class="section-title">这是我</h2>
        <ul class="info-list">
          ${row('姓名', esc(p.display_name))}
          ${row('年龄', `${esc(p.age_years)}岁`)}
          ${row('居住', esc(p.living_arrangement))}
          ${row('支持对象', esc(p.support_person))}
          ${row('过敏情况', allergyWarn
            ? `${esc(p.allergy_status)} <span class="badge badge--unconfirmed">
                 <span aria-hidden="true">⚠</span>还没确认过</span>`
            : esc(p.allergy_status))}
        </ul>
        ${allergyWarn ? `<p class="field__hint" style="margin-top:12px">
          复诊时记得告诉医生过敏情况还没确认过。</p>` : ''}
      </div>

      <div class="card">
        <h2 class="section-title">我的分享设置</h2>
        <ul class="info-list">
          ${row('当前设置', esc(p.sharing_preference))}
        </ul>
        ${noShare ? alert({
          tone: 'info', icon: 'ℹ',
          title: '按您的设置，记录不会自动发给家人',
        }) : alert({
          tone: 'neutral', icon: '○',
          title: '记录不会自动发给任何人',
          text: '只有您点了「保存」，记录才会留在这里。',
        })}
      </div>

      <div class="card">
        <h2 class="section-title">关于这个演示版</h2>
        <ul class="info-list">
          <li><span>${esc('全部是模拟数据，不是真实老人。')}</span></li>
          <li><span>${esc('还没有连接真实后端，刷新后新填的记录和上传的文件都会消失。')}</span></li>
          <li><span>${esc('不会自动通知家属、不会给用药建议。')}</span></li>
          <li><span>${esc('心情和病历未经临床审核。')}</span></li>
        </ul>
      </div>

      <div class="no-print">
        ${btnRow([
          btn({ label: '清空这次填的内容', action: 'ask-clear-session', variant: 'danger' }),
        ])}
      </div>

      <p class="muted" style="font-size:var(--fs-sm)">
        演示锚定日期：${esc(store.today)}。课堂控制台可改：在浏览器控制台输入
        <code>SyCare.demo</code>。
      </p>
    </div>`,
  });
}

export const SETTINGS_ACTIONS = {
  'ask-clear-session': () => {
    openSheet(sheet({
      title: '确定清空吗？',
      body: '<p>这次填的记录和上传的文件都会没。刷新页面也会清空。</p>',
      buttons: [
        btn({ label: '清空', action: 'confirm-clear-session', variant: 'danger' }),
        btn({ label: '不要', action: 'close-sheet', variant: 'secondary' }),
      ],
    }));
  },
};
