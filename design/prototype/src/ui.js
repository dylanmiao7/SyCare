/* ============================================================
   ui.js · 基础组件（ui/ 层，不依赖 domain/）
   见 design/04_组件契约与文案库.md §1.1
   ============================================================ */

/* ---------------- 转义 ---------------- */

export function esc(v) {
  if (v === null || v === undefined) return '';
  return String(v)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

/* ---------------- AppShell ---------------- */

export function shell({ title, showBack = true, body, backTarget = '#/' }) {
  return `
  <a class="skip-link" href="#main">跳到主要内容</a>
  <header class="appbar">
    <div class="appbar__inner">
      ${showBack ? `<button type="button" class="appbar__back" data-nav="${esc(backTarget)}">
        <span aria-hidden="true">←</span> 返回首页</button>` : ''}
      <h1 class="appbar__title">${esc(title)}</h1>
      <button type="button" class="appbar__font" data-action="font-size"
              aria-label="文字大小">A</button>
    </div>
  </header>
  <main id="main" tabindex="-1">
    ${body}
  </main>
  <div class="demo-banner" role="note">
    模拟演示数据 · 未连接真实后端，刷新后新填的记录会丢失
  </div>`;
}

/* ---------------- BigButton ---------------- */

export function btn({
  label, action = '', variant = 'primary', size = '', attrs = '', type = 'button',
}) {
  const cls = `btn btn--${variant}${size ? ' btn--' + size : ''}`;
  const data = action ? ` data-action="${esc(action)}"` : '';
  return `<button type="${type}" class="${cls}"${data}${attrs ? ' ' + attrs : ''}>${esc(label)}</button>`;
}

export function btnRow(buttons, inline = false) {
  return `<div class="btn-row${inline ? ' btn-row--inline' : ''}">${buttons.join('')}</div>`;
}

/* ---------------- Alert ---------------- */

const ALERT_ICON = { ok: '✓', warn: '⚠', danger: '⚠', info: 'ℹ', neutral: '○' };

export function alert({
  tone = 'info', title = '', text = '', action = '', icon, live = false,
}) {
  const ic = icon !== undefined ? icon : ALERT_ICON[tone];
  const role = tone === 'danger' ? ' role="alert"' : (live ? ' role="status"' : '');
  return `
  <div class="alert alert--${tone}"${role}>
    ${ic ? `<span class="alert__icon" aria-hidden="true">${ic}</span>` : ''}
    <div class="alert__body">
      ${title ? `<p class="alert__title">${esc(title)}</p>` : ''}
      ${text ? `<p class="alert__text">${esc(text)}</p>` : ''}
      ${action}
    </div>
  </div>`;
}

export const alertWithButton = (opts, buttonHtml) =>
  alert({ ...opts, action: buttonHtml });

/* ---------------- TextField / NumberField / DateField ---------------- */

export function field({
  id, label, hint = '', value = '', type = 'text', unit = '', inputmode = '',
  error = '', placeholder = '', min = '', max = '', step = '', attrs = '',
}) {
  const describedBy = [hint ? `${id}-hint` : '', error ? `${id}-err` : ''].filter(Boolean).join(' ');
  return `
  <div class="field">
    <label class="field__label" for="${esc(id)}">${esc(label)}${
      unit ? ` <span class="unit">（${esc(unit)}）</span>` : ''}</label>
    ${hint ? `<p class="field__hint" id="${esc(id)}-hint">${esc(hint)}</p>` : ''}
    <input class="input${error ? ' input--error' : ''}" id="${esc(id)}" name="${esc(id)}"
           type="${esc(type)}" value="${esc(value)}" placeholder="${esc(placeholder)}"
           ${inputmode ? `inputmode="${esc(inputmode)}"` : ''}
           ${min !== '' ? `min="${esc(min)}"` : ''}
           ${max !== '' ? `max="${esc(max)}"` : ''}
           ${step !== '' ? `step="${esc(step)}"` : ''}
           ${describedBy ? `aria-describedby="${esc(describedBy)}"` : ''}
           ${error ? 'aria-invalid="true"' : ''} ${attrs}>
    ${error ? `<p class="inline-error" id="${esc(id)}-err">
      <span aria-hidden="true">⚠</span> ${esc(error)}</p>` : ''}
  </div>`;
}

export function textareaField({
  id, label, hint = '', value = '', error = '', rows = 5, placeholder = '', attrs = '',
}) {
  const describedBy = [hint ? `${id}-hint` : '', error ? `${id}-err` : ''].filter(Boolean).join(' ');
  return `
  <div class="field">
    <label class="field__label" for="${esc(id)}">${esc(label)}</label>
    ${hint ? `<p class="field__hint" id="${esc(id)}-hint">${esc(hint)}</p>` : ''}
    <textarea class="textarea${error ? ' textarea--error' : ''}" id="${esc(id)}" name="${esc(id)}"
              rows="${rows}" placeholder="${esc(placeholder)}"
              ${describedBy ? `aria-describedby="${esc(describedBy)}"` : ''}
              ${error ? 'aria-invalid="true"' : ''} ${attrs}>${esc(value)}</textarea>
    ${error ? `<p class="inline-error" id="${esc(id)}-err">
      <span aria-hidden="true">⚠</span> ${esc(error)}</p>` : ''}
  </div>`;
}

export function selectField({ id, label, options, value, attrs = '' }) {
  return `
  <div class="field">
    <label class="field__label" for="${esc(id)}">${esc(label)}</label>
    <select class="select" id="${esc(id)}" name="${esc(id)}" ${attrs}>
      ${options.map((o) => `<option value="${esc(o.value)}"${
        o.value === value ? ' selected' : ''}>${esc(o.label)}</option>`).join('')}
    </select>
  </div>`;
}

/* ---------------- 单选行（记录人） ---------------- */

export function radioRow({ name, legend, options, value }) {
  return `
  <fieldset class="field" style="border:none;padding:0;margin:0">
    <legend class="field__label">${esc(legend)}</legend>
    ${options.map((o) => `
      <label class="check">
        <input type="radio" name="${esc(name)}" value="${esc(o.value)}"
               ${o.value === value ? 'checked' : ''}>
        <span>${esc(o.label)}</span>
      </label>`).join('')}
  </fieldset>`;
}

/* ---------------- SegmentedControl ---------------- */

export function segmented({ name, options, value, action = 'segment' }) {
  return `
  <div class="segmented" role="radiogroup" aria-label="${esc(name)}">
    ${options.map((o) => `
      <button type="button" class="segmented__btn" role="radio"
              aria-checked="${o.value === value ? 'true' : 'false'}"
              data-action="${esc(action)}" data-value="${esc(o.value)}">${esc(o.label)}</button>`).join('')}
  </div>`;
}

/* ---------------- ChoiceGrid（心情 / 交流意愿） ---------------- */

export function choiceGrid({ name, legend, options, value, columns = 3, action = 'choice' }) {
  return `
  <fieldset class="field" style="border:none;padding:0;margin:0">
    <legend class="field__label">${esc(legend)}</legend>
    <div class="choice-grid choice-grid--${columns}" role="radiogroup" aria-label="${esc(legend)}">
      ${options.map((o) => `
        <button type="button" class="choice" role="radio"
                aria-checked="${o.value === value ? 'true' : 'false'}"
                data-action="${esc(action)}" data-name="${esc(name)}" data-value="${esc(o.value)}">
          ${o.emoji ? `<span class="choice__emoji" aria-hidden="true">${o.emoji}</span>` : ''}
          <span class="choice__label">${esc(o.label)}</span>
        </button>`).join('')}
    </div>
  </fieldset>`;
}

/* ---------------- EmptyState / Loading ---------------- */

export function emptyState({ icon = '○', title, desc = '', action = '' }) {
  return `
  <div class="empty">
    <p class="empty__icon" aria-hidden="true">${icon}</p>
    <p class="empty__title">${esc(title)}</p>
    ${desc ? `<p class="empty__desc">${esc(desc)}</p>` : ''}
    ${action}
  </div>`;
}

export function loading(label = '正在读取…') {
  return `<div class="loading" role="status">
    <span class="spinner" aria-hidden="true"></span><span>${esc(label)}</span></div>`;
}

/* ---------------- ConfirmDialog / Sheet ---------------- */

export function sheet({ title, body, buttons, bottom = false, labelledBy = 'sheet-title' }) {
  return `
  <div class="overlay${bottom ? ' overlay--bottom' : ''}" data-overlay>
    <div class="sheet" role="dialog" aria-modal="true" aria-labelledby="${esc(labelledBy)}"
         tabindex="-1" data-sheet>
      <h2 class="sheet__title" id="${esc(labelledBy)}">${esc(title)}</h2>
      <div class="sheet__body">${body}</div>
      <div class="sheet__actions">${buttons.join('')}</div>
    </div>
  </div>`;
}

/* ---------------- 数字格式化 ---------------- */

export const round1 = (n) => (n === null || n === undefined ? '—' : Math.round(n * 10) / 10);
export const round0 = (n) => (n === null || n === undefined ? '—' : Math.round(n));

export const formatSize = (bytes) => {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
};
