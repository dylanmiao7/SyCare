/* ============================================================
   screens/mood.js · P4 记心情
   「不回答」是等价选项；跳过不产生任何负面反馈；不自动通知家属。
   见 design/03_逐页规格.md P4
   ============================================================ */

import { store, currentPatient, patchMood, wait } from '../state.js';
import { findCheckin, shortDate } from '../data.js';
import { shell, esc, btn, btnRow, alert, field, textareaField, choiceGrid, sheet } from '../ui.js';
import { openSheet, closeSheet, render } from '../router.js';

export function defaultMoodForm() {
  return {
    record_date: store.today,
    mood_response: '',      // '' | 很好 | 一般 | 不太好 | 跳过
    wants_to_talk: '',      // '' | 愿意 | 暂时不需要 | 跳过
    note: '',
  };
}

const form = () => (store.forms.mood = store.forms.mood || defaultMoodForm());

const local = { error: '', saving: false };

const MOOD_OPTIONS = [
  { value: '很好', label: '很好', emoji: '😊' },
  { value: '一般', label: '一般', emoji: '😐' },
  { value: '不太好', label: '不太好', emoji: '😟' },
  { value: '跳过', label: '不回答', emoji: '⃠' },
];

const TALK_OPTIONS = [
  { value: '愿意', label: '愿意' },
  { value: '暂时不需要', label: '暂时不需要' },
  { value: '跳过', label: '不回答' },
];

export function moodScreen() {
  const p = currentPatient();
  const f = form();
  const suc = store.ui.successMood;

  const bothSkipped = f.mood_response === '跳过' && f.wants_to_talk === '跳过';
  const anythingPicked = f.mood_response !== '' || f.wants_to_talk !== '';

  return shell({
    title: '记心情',
    body: `
    <div class="stack">
      ${suc ? alert({
        tone: 'ok',
        title: '记好了',
        text: suc.message,
        action: `<div class="btn-row btn-row--inline" style="margin-top:12px">
          ${btn({ label: '看看记录', action: 'nav', variant: 'secondary', size: 'sm', attrs: 'data-nav="#/logs"' })}
          ${btn({ label: '再记一次', action: 'reset-mood-form', variant: 'quiet', size: 'sm' })}
        </div>`,
      }) : ''}

      <form data-form="mood" novalidate>
        ${field({
          id: 'record_date', label: '日期', type: 'date',
          value: f.record_date, min: '2020-01-01', max: store.today,
          error: local.error,
        })}

        ${choiceGrid({
          name: 'mood_response', legend: '今天心情怎么样？',
          options: MOOD_OPTIONS, value: f.mood_response, columns: 4,
        })}

        ${choiceGrid({
          name: 'wants_to_talk', legend: '今天想找人聊聊吗？',
          options: TALK_OPTIONS, value: f.wants_to_talk, columns: 3,
        })}

        ${textareaField({
          id: 'note', label: '想说的话（可以不说）', value: f.note, rows: 3,
          placeholder: '想写什么都可以',
        })}

        ${alert({
          tone: 'neutral',
          title: '这些问题都可以不回答',
          text: '跳过不会被当成心情不好，也不用解释。',
          icon: '○',
        })}

        <div class="field">
          ${btnRow([
            btn({
              label: local.saving ? '正在保存…' : (bothSkipped ? '就记这些' : '保存'),
              action: 'save-mood',
              attrs: local.saving ? 'aria-busy="true"' : '',
            }),
            btn({ label: '取消', action: 'cancel-mood', variant: 'secondary' }),
          ])}
        </div>
      </form>
    </div>`,
  });
}

/* ---------------- 保存 ---------------- */

async function save() {
  const f = form();
  if (!f.record_date) {
    local.error = '请选一下日期';
    render();
    return;
  }

  const anythingPicked = f.mood_response !== '' || f.wants_to_talk !== '' || f.note !== '';
  if (!anythingPicked) {
    openSheet(sheet({
      title: '还没选',
      body: '<p>心情和想不想聊聊，都可以选「不回答」。也可以写一句话。</p>',
      buttons: [
        btn({ label: '都选不回答', action: 'skip-all-mood' }),
        btn({ label: '回去选', action: 'close-sheet', variant: 'secondary' }),
      ],
    }));
    return;
  }

  local.saving = true;
  local.error = '';
  render();
  await wait(store.ui.demo.delayMs);

  if (store.ui.demo.fail.save) {
    local.saving = false;
    render();
    openSheet(sheet({
      title: '没保存上',
      body: '<p>可能是网络不好。刚才选的还在，再试一次。</p>',
      buttons: [
        btn({ label: '重试', action: 'save-mood' }),
        btn({ label: '先不存了', action: 'close-sheet', variant: 'secondary' }),
      ],
    }));
    return;
  }

  const existing = findCheckin(store.data, store.patientId, f.record_date);
  const isUpdate = Boolean(existing);

  patchMood(store.patientId, f.record_date, {
    mood_response: f.mood_response === '' ? '跳过' : f.mood_response,
    wants_to_talk: f.wants_to_talk === '' ? '跳过' : f.wants_to_talk,
    self_report_note: f.note || undefined,
  });

  const p = currentPatient();
  const messages = [];
  if (isUpdate) messages.push(`${shortDate(f.record_date)} 的心情更新好了。血压记录没变。`);
  if (f.wants_to_talk === '愿意') {
    messages.push(`已记下您想找人聊聊。需要的话可以联系${p.support_person}。这里不会自动发消息给任何人。`);
  }

  local.saving = false;
  store.forms.mood = { ...defaultMoodForm(), record_date: f.record_date };
  store.ui.successMood = { message: messages.join(' ') || '记好了' };
  store.ui.focusAfterRender = '#main';
  render();
}

/* ---------------- 动作 ---------------- */

export const MOOD_ACTIONS = {
  'choice': (el) => {
    /* 同一个目标可以选一次，也可以改选；再点一次则取消选择 */
    const { name, value } = el.dataset;
    const f = form();
    f[name] = f[name] === value ? '' : value;
    render();
  },

  'save-mood': () => { save(); },

  'skip-all-mood': () => {
    const f = form();
    f.mood_response = '跳过';
    f.wants_to_talk = '跳过';
    closeSheet();
    save();
  },

  'reset-mood-form': () => {
    store.forms.mood = defaultMoodForm();
    store.ui.successMood = null;
    local.error = '';
    render();
  },

  'cancel-mood': () => {
    const f = form();
    const dirty = f.mood_response || f.wants_to_talk || f.note;
    if (!dirty) {
      store.ui.successMood = null;
      store.forms.mood = null;
      render();
      return;
    }
    openSheet(sheet({
      title: '刚选的还没保存',
      body: '<p>确定离开吗？</p>',
      buttons: [
        btn({ label: '离开', action: 'really-cancel-mood', variant: 'danger' }),
        btn({ label: '留下继续', action: 'close-sheet', variant: 'secondary' }),
      ],
    }));
  },

  'really-cancel-mood': () => {
    store.forms.mood = null;
    store.ui.successMood = null;
    local.error = '';
    closeSheet();
    location.hash = '#/';
  },
};
