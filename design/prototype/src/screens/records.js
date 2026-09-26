/* ============================================================
   screens/records.js · P5 存病历
   上传的文件存内存；未确认的文字不进问答；无原件时说明清楚。
   见 design/03_逐页规格.md P5
   ============================================================ */

import { store, currentPatient, addUploadedFile, removeUploadedFile, uploadedOf, wait } from '../state.js';
import { recordsOf, longDate } from '../data.js';
import {
  shell, esc, btn, alert, emptyState, field, selectField, sheet, formatSize,
} from '../ui.js';
import { openSheet, closeSheet, render, patch } from '../router.js';

const MAX_SIZE = 10 * 1024 * 1024;
const OK_TYPES = ['.pdf', '.jpg', '.jpeg', '.png'];

/* 演示用 PDF（data/测试数据/） */
const DEMO_PDF = {
  'SYN-001': 'SYN-001_模拟病历.pdf',
  'SYN-003': 'SYN-003_模拟病历.pdf',
  'SYN-006': 'SYN-006_模拟病历.pdf',
};
const PDF_BASE = '../../data/测试数据';

const TEXT_STATUS = {
  confirmed_demo: { kind: 'confirmed', label: '已确认' },
  unconfirmed: { kind: 'unconfirmed', label: '未确认' },
  unreadable: { kind: 'unreadable', label: '没认出来' },
};

const local = { uploadError: '', progress: 0, uploading: false, viewingText: null };

/* ---------------- 页面 ---------------- */

export function recordsScreen() {
  const p = currentPatient();
  const csvRecords = recordsOf(store.data, p.patient_id);
  const uploads = uploadedOf(p.patient_id);
  const demoName = DEMO_PDF[p.patient_id];

  const total = csvRecords.length + uploads.length;

  return shell({
    title: '存病历',
    body: `
    <div class="stack">
      ${alert({
        tone: 'warn',
        title: '演示版：文件只存在这次打开的页面里',
        text: '刷新后会丢掉。请勿上传真实病历。',
        icon: 'ℹ',
      })}

      <div class="dropzone">
        <p class="dropzone__icon" aria-hidden="true">📁</p>
        <p class="dropzone__title">拍照片或选一份 PDF</p>
        <p class="dropzone__hint">PDF、JPG、PNG，单个不超过 10 MB</p>
        <label class="btn btn--primary" for="file-input" style="cursor:pointer">选择文件</label>
        <input type="file" id="file-input" class="sr-only" accept=".pdf,.jpg,.jpeg,.png">
        ${local.uploadError ? `<p class="inline-error" role="alert">
          <span aria-hidden="true">⚠</span> ${esc(local.uploadError)}</p>` : ''}
      </div>

      ${total === 0 ? emptyState({
        icon: '📄',
        title: '还没有存病历',
        desc: '把病历拍下来存进去，以后随时能找。',
        action: demoName
          ? btn({ label: '加载演示 PDF', action: 'open-demo-pdf', attrs: `data-name="${esc(demoName)}"` })
          : '',
      }) : `
        <div>
          <h2 class="section-title">已有病历（${csvRecords.length} 份）</h2>
          ${csvRecords.length === 0
            ? '<p class="muted">这份模拟资料里没有病历。</p>'
            : `<ul class="file-list">
                ${csvRecords.map((r) => fileCardCsv(r, demoName)).join('')}
              </ul>`}
        </div>

        <div>
          <h2 class="section-title">我上传的（${uploads.length} 份）</h2>
          ${uploads.length === 0
            ? '<p class="muted">还没有上传过文件。</p>'
            : `<ul class="file-list">${uploads.map(fileCardUpload).join('')}</ul>`}
        </div>`}
    </div>`,
  });
}

/* ---------------- 文件卡 ---------------- */

function fileCardCsv(r, demoName) {
  const st = TEXT_STATUS[r.text_status] || TEXT_STATUS.confirmed_demo;
  return `
  <li class="file-card">
    <div class="file-card__head">
      <span class="file-card__icon" aria-hidden="true">📄</span>
      <div class="file-card__meta">
        <p class="file-card__name">${esc(r.record_type)} · ${esc(longDate(r.record_date))}</p>
        <p class="file-card__sub">来源：${esc(r.source_label)}</p>
        <p style="margin-top:8px">
          <span class="badge badge--${st.kind}"><span aria-hidden="true">✓</span>${esc(st.label)}</span>
        </p>
      </div>
    </div>
    <div class="file-card__actions">
      ${btn({ label: '查看文字', action: 'view-record-text', variant: 'secondary', size: 'sm',
        attrs: `data-id="${esc(r.record_id)}"` })}
      ${demoName
        ? btn({ label: '打开原件', action: 'open-demo-pdf', variant: 'secondary', size: 'sm',
            attrs: `data-name="${esc(demoName)}"` })
        : btn({ label: '打开原件', action: 'no-original', variant: 'quiet', size: 'sm' })}
    </div>
  </li>`;
}

function fileCardUpload(f) {
  const st = TEXT_STATUS[f.text_status] || TEXT_STATUS.unconfirmed;
  return `
  <li class="file-card">
    <div class="file-card__head">
      <span class="file-card__icon" aria-hidden="true">📄</span>
      <div class="file-card__meta">
        <p class="file-card__name">${esc(f.file_name)}</p>
        <p class="file-card__sub">${esc(longDate(f.record_date))} · ${esc(f.record_type)} · ${esc(formatSize(f.size))}</p>
        <p style="margin-top:8px">
          <span class="badge badge--${st.kind}"><span aria-hidden="true">⚠</span>${esc(st.label)}</span>
        </p>
        ${f.text_status === 'unconfirmed' ? `<p class="field__hint" style="margin-top:8px">
          图片里的文字还没人核对过，暂时不会当成事实回答。</p>` : ''}
      </div>
    </div>
    <div class="file-card__actions">
      ${btn({ label: '打开', action: 'open-upload', variant: 'secondary', size: 'sm',
        attrs: `data-id="${esc(f.id)}"` })}
      ${btn({ label: '删除', action: 'ask-delete-upload', variant: 'quiet', size: 'sm',
        attrs: `data-id="${esc(f.id)}"` })}
    </div>
  </li>`;
}

/* ---------------- 选文件 ---------------- */

export function handleFileInput(input) {
  onPickFile(input);
}

function onPickFile(input) {
  const file = input.files && input.files[0];
  if (!file) return;

  const ext = '.' + file.name.split('.').pop().toLowerCase();
  if (!OK_TYPES.includes(ext)) {
    local.uploadError = '这个文件类型打不开，请选 PDF 或照片';
    input.value = '';
    render();
    return;
  }
  if (file.size > MAX_SIZE) {
    local.uploadError = `文件太大了（${formatSize(file.size)}），请选 10 MB 以内的`;
    input.value = '';
    render();
    return;
  }

  local.uploadError = '';
  store.forms.upload = {
    file_name: file.name,
    size: file.size,
    mime: file.type,
    record_date: store.today,
    record_type: '随访记录',
    __file: file,
  };

  openSheet(sheet({
    title: '确认这份病历',
    body: `
      <p class="muted">${esc(file.name)} · ${esc(formatSize(file.size))}</p>
      <div style="margin-top:16px">
        ${field({
          id: 'upload_date', label: '记录日期', type: 'date',
          value: store.today, min: '2000-01-01', max: store.today,
          attrs: 'data-upload-field="record_date"',
        })}
        ${selectField({
          id: 'upload_type', label: '这是哪一类',
          options: [
            { value: '建档记录', label: '建档记录' },
            { value: '随访记录', label: '随访记录' },
            { value: '其他', label: '其他' },
          ],
          value: '随访记录',
          attrs: 'data-upload-field="record_type"',
        })}
      </div>
      <p class="field__hint" style="margin-top:16px">
        上传后状态是「未确认」，核对过才会被问答引用。
      </p>`,
    buttons: [
      btn({ label: '上传', action: 'do-upload' }),
      btn({ label: '重选', action: 'close-sheet', variant: 'secondary' }),
    ],
  }));
}

/* ---------------- 上传 ---------------- */

async function doUpload() {
  const f = store.forms.upload;
  if (!f || !f.__file) { closeSheet(); return; }

  local.uploading = true;
  local.progress = 0;
  render();

  /* 分步进度，演示用 */
  for (let i = 1; i <= 5; i++) {
    await wait(store.ui.demo.delayMs / 2);
    local.progress = i * 20;
    patch('[data-progress]', progressHtml());
    if (store.ui.demo.fail.upload && i === 4) {
      local.uploading = false;
      local.progress = 0;
      openSheet(sheet({
        title: '没上传上',
        body: '<p>文件还在，再试一次。</p>',
        buttons: [
          btn({ label: '重试', action: 'do-upload' }),
          btn({ label: '先不传了', action: 'close-sheet', variant: 'secondary' }),
        ],
      }));
      return;
    }
  }

  addUploadedFile({
    id: `UP-${Date.now()}`,
    patient_id: store.patientId,
    file_name: f.file_name,
    size: f.size,
    mime: f.mime,
    record_date: f.record_date || store.today,
    record_type: f.record_type || '随访记录',
    text_status: 'unconfirmed',
    object_url: URL.createObjectURL(f.__file),
  });

  local.uploading = false;
  local.progress = 0;
  store.forms.upload = null;
  closeSheet();
  render();
}

const progressHtml = () => `
  <div data-progress>
    <p class="text-lg">正在上传，请稍等 ${local.progress}%</p>
    <div class="progress" role="progressbar" aria-valuenow="${local.progress}"
         aria-valuemin="0" aria-valuemax="100">
      <div class="progress__bar" style="width:${local.progress}%"></div>
    </div>
  </div>`;

/* ---------------- 动作 ---------------- */

export const RECORDS_ACTIONS = {
  'do-upload': () => { doUpload(); },

  'view-record-text': (el) => {
    const rec = store.data.records.find((r) => r.record_id === el.dataset.id);
    if (!rec) return;
    openSheet(sheet({
      title: rec.record_type,
      body: `
        <p class="muted">${esc(longDate(rec.record_date))} · 来源：${esc(rec.source_label)}</p>
        <div class="file-card__text">${esc(rec.record_text)}</div>
        <p class="field__hint" style="margin-top:12px">
          这份文字已经核对过（已确认），可以被问答引用。
        </p>`,
      buttons: [btn({ label: '关闭', action: 'close-sheet', variant: 'secondary' })],
      bottom: true,
    }));
  },

  'open-demo-pdf': (el) => {
    const url = `${PDF_BASE}/${encodeURIComponent(el.dataset.name)}`;
    window.open(url, '_blank', 'noopener');
  },

  'no-original': () => {
    openSheet(sheet({
      title: '没有原件文件',
      body: '<p>这份是教学模拟文本，没有对应的 PDF 原件。可以看「查看文字」里的内容。</p>',
      buttons: [btn({ label: '知道了', action: 'close-sheet', variant: 'secondary' })],
    }));
  },

  'open-upload': (el) => {
    const f = uploadedOf(store.patientId).find((x) => x.id === el.dataset.id);
    if (f && f.object_url) window.open(f.object_url, '_blank', 'noopener');
  },

  'ask-delete-upload': (el) => {
    const id = el.dataset.id;
    openSheet(sheet({
      title: '确定不要这份了吗？',
      body: '<p>删掉以后，这次打开的页面里就找不回来了。</p>',
      buttons: [
        btn({ label: '不要了', action: 'delete-upload', variant: 'danger', attrs: `data-id="${esc(id)}"` }),
        btn({ label: '留下', action: 'close-sheet', variant: 'secondary' }),
      ],
    }));
  },

  'delete-upload': (el) => {
    removeUploadedFile(el.dataset.id);
    closeSheet();
    render();
  },
};
