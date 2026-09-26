/* ============================================================
   screens/ask.js · P7 问一问
   四类回答：能回答 / 不知道 / 要问医生 / 超时出错。
   必须带日期与天数、必须标缺失、不知道就说不知道。
   见 design/03_逐页规格.md P7
   ============================================================ */

import { store, currentPatient, addMessage, messagesOf, clearMessages, wait } from '../state.js';
import {
  checkinsOf, recordsOf, stats, tally, shortDate, longDate, bpDisplay,
} from '../data.js';
import { shell, esc, btn, btnRow, alert, round0, sheet } from '../ui.js';
import { openSheet, closeSheet, render } from '../router.js';

const SUGGESTIONS = ['最近血压怎样', '睡得怎么样', '病历里写了什么', '我吃的什么药'];

const DISCLAIMER_DATA = '这只是根据您的记录整理，不是医生诊断。';
const DISCLAIMER_MED = '我不会猜药名，也不会建议剂量。';

/* ---------------- 规则匹配 ---------------- */

const has = (q, ...words) => words.some((w) => q.includes(w));

function classify(q) {
  if (has(q, '加一片', '加药', '减药', '停药', '能不能吃', '剂量', '多吃', '少吃', '换药', '吃什么药能'))
    return 'medication';
  if (has(q, '什么药', '吃的药', '用药', '药名', '药品'))
    return 'medication_info';
  if (has(q, '病历', '记录里写', '建档', '随访'))
    return 'records';
  if (has(q, '血压', '高压', '低压', '血压计'))
    return 'bp';
  if (has(q, '睡', '睡眠'))
    return 'sleep';
  if (has(q, '心情', '情绪', '开心', '难过', '聊聊', '聊天', '闷'))
    return 'mood';
  return 'unknown';
}

/* ---------------- 四类回答 ---------------- */

function answerBp(p, rows) {
  const st = stats(rows, 'bp');
  if (st.recorded === 0) {
    return {
      kind: 'unknown',
      text: `近 ${rows.length} 天里没有记过血压，所以我答不上来。可以记一条，或者翻翻病历。`,
      sources: [],
    };
  }
  const diaVals = rows.filter((r) => r.capture_status === 'recorded' && r.diastolic_mmhg !== null)
    .map((r) => r.diastolic_mmhg);
  const diaAvg = diaVals.reduce((a, b) => a + b, 0) / diaVals.length;
  const high = st.values.filter((v) => v >= 140).length;
  const past = (d) => d < store.today;
  const errDates = st.deviceErrorDates.filter(past);

  const lines = [];
  lines.push(`近 ${rows.length} 天里有 ${st.recorded} 天记了血压，平均高压 ${round0(st.avg)}、低压 ${round0(diaAvg)}。`);
  lines.push(`高压最高 ${round0(st.max)}，最低 ${round0(st.min)}${high ? `，其中 ${high} 天高压到 140 或以上` : ''}。`);
  if (errDates.length) lines.push(`${errDates.map(shortDate).join('、')} 血压计没测出来。`);
  if (st.missing > errDates.length) lines.push(`另有 ${st.missing - errDates.length} 天没有记录。`);

  return {
    kind: 'answer',
    text: lines.join(''),
    sources: [{
      label: `每日记录 ${st.recorded} 条（${shortDate(rows[0].record_date)} 至 ${shortDate(rows[rows.length - 1].record_date)}）`,
      nav: '#/logs',
    }],
    disclaimer: DISCLAIMER_DATA,
  };
}

function answerSleep(p, rows) {
  const st = stats(rows, 'sleep');
  if (st.recorded === 0) {
    return {
      kind: 'unknown',
      text: `近 ${rows.length} 天里没有记过睡眠，所以我答不上来。可以记一条睡眠时长。`,
      sources: [],
    };
  }
  const low = st.values.filter((v) => v < 6).length;
  const lines = [];
  lines.push(`近 ${rows.length} 天里有 ${st.recorded} 天记了睡眠，平均 ${Math.round(st.avg * 10) / 10} 小时。`);
  if (low) lines.push(`其中 ${low} 天少于 6 小时。`);
  if (st.missing) lines.push(`${st.missing} 天没有记录。`);

  return {
    kind: 'answer',
    text: lines.join(''),
    sources: [{
      label: `每日记录 ${st.recorded} 条（${shortDate(rows[0].record_date)} 至 ${shortDate(rows[rows.length - 1].record_date)}）`,
      nav: '#/logs',
    }],
    disclaimer: DISCLAIMER_DATA,
  };
}

function answerRecords(p, rows, records) {
  const confirmed = records.filter((r) => r.text_status === 'confirmed_demo');
  const unconfirmed = records.filter((r) => r.text_status !== 'confirmed_demo');

  if (!confirmed.length) {
    if (unconfirmed.length) {
      return {
        kind: 'unknown',
        text: '这份文件里的文字还没核对过，我暂时不能拿它回答。',
        sources: [],
      };
    }
    return {
      kind: 'unknown',
      text: '您的资料里还没有病历记录。可以在「存病历」里拍下来存进去。',
      sources: [],
    };
  }

  const lines = [`一共有 ${confirmed.length} 份病历。`];
  confirmed.forEach((r) => {
    const summary = r.record_text
      .split('\n').map((x) => x.trim()).filter(Boolean)
      .slice(1, 3).join(' ');
    lines.push(`${longDate(r.record_date)}${r.record_type}：${summary}`);
  });
  if (unconfirmed.length) lines.push(`另有 ${unconfirmed.length} 份还没核对过，暂时不能用。`);

  return {
    kind: 'answer',
    text: lines.join('\n'),
    sources: [{
      label: `病历 ${confirmed.length} 条（${confirmed.map((r) => r.record_id).join('、')}）`,
      nav: '#/records',
    }],
    disclaimer: DISCLAIMER_DATA,
  };
}

function answerMood(p, rows) {
  const mood = tally(rows, 'mood_response');
  const talk = tally(rows, 'wants_to_talk');
  const parts = [];
  if (mood['很好']) parts.push(`${mood['很好']} 天很好`);
  if (mood['一般']) parts.push(`${mood['一般']} 天一般`);
  if (mood['不太好']) parts.push(`${mood['不太好']} 天不太好`);
  if (mood['跳过']) parts.push(`${mood['跳过']} 天没有回答`);
  if (!parts.length) {
    return { kind: 'unknown', text: '您的资料里还没有记过心情。', sources: [] };
  }

  const lines = [`近 ${rows.length} 天的心情记录：${parts.join('，')}。`];
  const proxy = rows.filter((r) => r.recorded_by_type === 'family').length;
  if (proxy === rows.length) {
    lines.push('这些记录是家属代录的，可能不是本人说的。');
  }
  if (talk['愿意']) {
    lines.push(`有 ${talk['愿意']} 天表示愿意找人聊聊。这只是记下的想法，不会自动通知家人。`);
  }

  return {
    kind: 'answer',
    text: lines.join(''),
    sources: [{ label: `每日记录 ${rows.length} 条（心情字段）`, nav: '#/logs' }],
    disclaimer: DISCLAIMER_DATA,
  };
}

function answerMedicationInfo(p, records) {
  const mentions = records.filter((r) => r.record_text.includes('药物名称和剂量没有提供'));
  return {
    kind: 'unknown',
    text: '您的资料里没有记药的名称和剂量，所以我答不上来。可以在复诊小结的「想问医生的问题」里记下来，下次问医生。',
    sources: mentions.length
      ? [{ label: `病历记录中提到「药物名称和剂量没有提供」（${mentions.map((r) => r.record_id).join('、')}）`, nav: '#/records' }]
      : [],
    disclaimer: DISCLAIMER_MED,
  };
}

function answerMedicationAdvice() {
  return {
    kind: 'doctor',
    text: '这个问题要问医生，我不能替医生做决定。建议把这个问题记在复诊小结里，看医生时直接问。',
    sources: [],
    disclaimer: DISCLAIMER_MED,
    action: { label: '记到复诊小结', nav: '#/summary' },
  };
}

/* ---------------- 求答 ---------------- */

export function computeAnswer(question) {
  const p = currentPatient();
  const rows = checkinsOf(store.data, p.patient_id);
  const records = recordsOf(store.data, p.patient_id);
  const kind = classify(question);

  switch (kind) {
    case 'medication': return answerMedicationAdvice();
    case 'medication_info': return answerMedicationInfo(p, records);
    case 'records': return answerRecords(p, rows, records);
    case 'bp': return answerBp(p, rows);
    case 'sleep': return answerSleep(p, rows);
    case 'mood': return answerMood(p, rows);
    default:
      return {
        kind: 'unknown',
        text: '您的资料里没有记这件事。可以在病历里找找，或者下次记一条。',
        sources: [],
      };
  }
}

/* ---------------- 页面 ---------------- */

export function askScreen() {
  const p = currentPatient();
  const msgs = messagesOf(p.patient_id);

  return shell({
    title: '问一问',
    body: `
    <div class="stack">
      ${alert({
        tone: 'info',
        icon: 'ℹ',
        title: '演示版：回答由本地规则模拟',
        text: '未连接 DeepSeek。它不会改您的记录，也不会给家属发消息。',
      })}

      ${msgs.length === 0 ? `
        <div>
          <h2 class="section-title">可以这样问：</h2>
          <div class="chips">
            ${SUGGESTIONS.map((q) => `<button type="button" class="chip"
              data-action="ask-suggest" data-q="${esc(q)}">${esc(q)}</button>`).join('')}
          </div>
          <p class="field__hint" style="margin-top:12px">还没有问过。上面几个问题可以直接点。</p>
        </div>` : `
        <ul class="chat-list">
          ${msgs.map(bubble).join('')}
        </ul>`}

      <div class="card no-print">
        <label class="field__label" for="ask_input">把您想问的写在这里</label>
        <div class="ask-bar">
          <input class="input" id="ask_input" type="text" placeholder="比如：最近血压怎样"
                 data-enter="do-ask">
          ${btn({
            label: store.ui.chatBusy ? '正在看…' : '问一问',
            action: 'do-ask',
            attrs: store.ui.chatBusy ? 'aria-busy="true" disabled' : '',
          })}
        </div>
        ${msgs.length ? `<div style="margin-top:12px">
          ${btn({ label: '清空对话', action: 'ask-clear-chat', variant: 'quiet', size: 'sm' })}
        </div>` : ''}
        ${store.ui.chatBusy ? `<p class="field__hint" role="status" style="margin-top:12px">
          正在看您的记录…${store.ui.chatElapsed > 8 ? ' 还在算，您可以继续等或者离开。' : ''}
        </p>` : ''}
      </div>
    </div>`,
  });
}

/* ---------------- 气泡 ---------------- */

const TONE_CLASS = {
  answer: 'bubble--assistant',
  unknown: 'bubble--unknown',
  doctor: 'bubble--doctor',
  error: 'bubble--error',
};

function bubble(m) {
  if (m.role === 'user') {
    return `<li class="bubble bubble--user" style="margin-left:auto;max-width:88%">
      <p class="bubble__body">${esc(m.text)}</p>
    </li>`;
  }
  const cls = TONE_CLASS[m.answer_kind] || 'bubble--assistant';
  const icon = m.answer_kind === 'doctor' ? '⚠ ' : m.answer_kind === 'unknown' ? '○ ' :
    m.answer_kind === 'error' ? '⚠ ' : '';
  return `
  <li class="bubble ${cls}">
    <p class="bubble__head"><span>SyCare</span><span>${esc(m.at || '')}</span></p>
    <p class="bubble__body">${icon}${esc(m.text)}</p>
    ${m.sources && m.sources.length ? `
      <div class="bubble__sources">
        <p class="bubble__sources-title">依据：</p>
        <ul>${m.sources.map((s) => `<li>${esc(s.label)}${
          s.nav ? ` <button type="button" class="source-link" data-action="nav"
            data-nav="${esc(s.nav)}">看看</button>` : ''}</li>`).join('')}</ul>
      </div>` : ''}
    ${m.disclaimer ? `<p class="bubble__disclaimer">⚠ ${esc(m.disclaimer)}</p>` : ''}
    ${m.action ? `<div style="margin-top:12px">${btn({
      label: m.action.label, action: 'nav', variant: 'secondary', size: 'sm',
      attrs: `data-nav="${esc(m.action.nav)}"` })}</div>` : ''}
  </li>`;
}

/* ---------------- 提问 ---------------- */

async function doAsk(questionRaw) {
  const input = document.getElementById('ask_input');
  const question = (questionRaw || (input ? input.value : '') || '').trim();
  if (!question) {
    if (input) input.focus();
    return;
  }

  const now = '14:20';
  addMessage({ patient_id: store.patientId, role: 'user', text: question, at: now });
  store.ui.chatBusy = true;
  store.ui.chatElapsed = 0;
  if (input) input.value = '';
  render();

  /* 分段等待，超过 8 秒给出提示 */
  const total = store.ui.demo.fail.ask ? 10000 : store.ui.demo.delayMs;
  let waited = 0;
  while (waited < total) {
    await wait(500);
    waited += 500;
    if (waited === 8500) {
      store.ui.chatElapsed = 9;
      patchAskBusy();
    }
  }

  store.ui.chatBusy = false;
  store.ui.chatElapsed = 0;

  if (store.ui.demo.fail.ask) {
    addMessage({
      patient_id: store.patientId, role: 'assistant',
      text: '刚才没答上来，可能是网络不好。', answer_kind: 'error', sources: [], at: now,
    });
    render();
    return;
  }

  const a = computeAnswer(question);
  addMessage({
    patient_id: store.patientId, role: 'assistant',
    text: a.text, answer_kind: a.kind, sources: a.sources,
    disclaimer: a.disclaimer, action: a.action, at: now,
  });
  render();
}

function patchAskBusy() {
  const el = document.querySelector('[role="status"]');
  if (el) el.textContent = '正在看您的记录… 还在算，您可以继续等或者离开。';
}

/* ---------------- 动作 ---------------- */

export const ASK_ACTIONS = {
  'do-ask': () => { doAsk(); },

  'ask-suggest': (el) => { doAsk(el.dataset.q); },

  'ask-clear-chat': () => {
    openSheet(sheet({
      title: '清空这次问过的？',
      body: '<p>清空后对话就没了。</p>',
      buttons: [
        btn({ label: '清空', action: 'do-clear-chat', variant: 'danger' }),
        btn({ label: '留下', action: 'close-sheet', variant: 'secondary' }),
      ],
    }));
  },

  'do-clear-chat': () => {
    clearMessages(store.patientId);
    closeSheet();
    render();
  },
};
