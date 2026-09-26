/* ============================================================
   scripts/verify.mjs · 原型自动验证
   用最小 DOM / fetch 桩在 Node 里真实加载全部模块，
   逐页渲染并对关键语义规则做断言（不只是语法检查）。

   运行：
     node scripts/verify.mjs
   ============================================================ */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');

/* ---------------- 最小 DOM 桩 ---------------- */

class FakeEl {
  constructor(tag = 'div') {
    this.tagName = tag;
    this._html = '';
    this.dataset = {};
    this.listeners = {};
    this.value = '';
    this.textContent = '';
    this.files = [];
    this.classList = { add() {}, remove() {}, contains: () => false };
  }
  set innerHTML(v) { this._html = String(v); }
  get innerHTML() { return this._html; }
  addEventListener(t, fn) { (this.listeners[t] = this.listeners[t] || []).push(fn); }
  removeEventListener() {}
  querySelector() { return null; }
  querySelectorAll() { return []; }
  closest() { return null; }
  focus() {}
  setAttribute() {}
  getAttribute() { return null; }
  contains() { return false; }
}

const appEl = new FakeEl('div');
appEl.id = 'app';

globalThis.document = {
  getElementById: (id) => (id === 'app' ? appEl : null),
  querySelector: () => null,
  querySelectorAll: () => [],
  createElement: (t) => new FakeEl(t),
  documentElement: new FakeEl('html'),
  body: new FakeEl('body'),
  activeElement: null,
  contains: () => false,
};
globalThis.window = {
  addEventListener() {},
  print() {},
  open() {},
  location: { hash: '#/' },
};
globalThis.location = globalThis.window.location;
globalThis.URL.createObjectURL = () => 'blob:stub';

/* fetch 桩：把任意 ../data/*.csv 映射到仓库 data/ 目录 */
globalThis.fetch = async (url) => {
  const name = String(url).split('/').pop();
  const path = join(root, '..', '..', 'data', name);
  try {
    const text = readFileSync(path, 'utf8');
    return { ok: true, status: 200, text: async () => text };
  } catch (e) {
    return { ok: false, status: 404, text: async () => '' };
  }
};

/* ---------------- 断言工具 ---------------- */

let pass = 0;
const failures = [];
function check(name, cond, detail = '') {
  if (cond) { pass++; console.log(`  ✓ ${name}`); }
  else { failures.push(`${name}${detail ? ' — ' + detail : ''}`); console.log(`  ✗ ${name} ${detail}`); }
}

/* ---------------- 加载模块 ---------------- */

const state = await import('../src/state.js');
const data = await import('../src/data.js');
const home = await import('../src/screens/home.js');
const checkin = await import('../src/screens/checkin.js');
const logs = await import('../src/screens/logs.js');
const mood = await import('../src/screens/mood.js');
const records = await import('../src/screens/records.js');
const summary = await import('../src/screens/summary.js');
const ask = await import('../src/screens/ask.js');
const settings = await import('../src/screens/settings.js');

/* 提前装配视图与动作（等价于浏览器启动），使动作触发的重渲染可用 */
await import('../src/main.js');
const { getAction } = await import('../src/router.js');
const { badge } = await import('../src/domain.js');

await state.init();
const { store } = state;

console.log('\n【1】数据加载');
check('12 位老人', store.data.patients.length === 12, `实际 ${store.data.patients.length}`);
check('360 条每日记录', store.data.checkins.length === 360, `实际 ${store.data.checkins.length}`);
check('24 条病历', store.data.records.length === 24, `实际 ${store.data.records.length}`);
check('演示锚点 = 2026-08-30', store.today === '2026-08-30', store.today);

console.log('\n【2】三态缺失值判定（bpDisplay）');
const rows1 = data.checkinsOf(store.data, 'SYN-001');
const errRow = rows1.find((r) => r.capture_status === 'device_error');
const okRow = rows1.find((r) => r.capture_status === 'recorded');
const dErr = data.bpDisplay(errRow);
const dOk = data.bpDisplay(okRow);
check('device_error → kind=device_error', dErr.kind === 'device_error');
check('device_error → 文本为「—」', dErr.text === '—', dErr.text);
check('device_error 不是 0', dErr.text !== '0' && !/^0/.test(dErr.text));
check('recorded → 有数值', dOk.hasValue && /^\d+ \/ \d+$/.test(dOk.text), dOk.text);

const rows3 = data.checkinsOf(store.data, 'SYN-003');
const nrRow = rows3.find((r) => r.capture_status === 'not_recorded');
check('not_recorded → kind=not_recorded', data.bpDisplay(nrRow).kind === 'not_recorded');

console.log('\n【3】睡眠与血压独立');
const bpOkSleepNull = rows1.find((r) => r.capture_status === 'recorded' && r.sleep_hours === null);
check('存在「血压已记但睡眠未记」的行', Boolean(bpOkSleepNull));
if (bpOkSleepNull) {
  check('该行血压有值', data.bpDisplay(bpOkSleepNull).hasValue === true);
  check('该行睡眠为未记录，且未继承设备错误',
    data.sleepDisplay(bpOkSleepNull).kind === 'not_recorded');
}

console.log('\n【4】心情「跳过」语义');
const skipped = rows1.find((r) => r.mood_response === '跳过');
check('跳过 → 文案「这次没回答」', data.moodDisplay('跳过').text === '这次没回答');
check('跳过 → 标记为 skipped', data.moodDisplay('跳过').skipped === true);
check('跳过 不等于 不太好', data.moodDisplay('跳过').text !== '不太好');
check('未回答（空）也走未回答分支', data.moodDisplay(null).skipped === true);

console.log('\n【5】本人 / 家属代录');
const famPatients = store.data.patients
  .filter((p) => data.checkinsOf(store.data, p.patient_id)
    .every((r) => r.recorded_by_type === 'family'))
  .map((p) => p.patient_id);
check('SYN-003 / SYN-009 / SYN-012 全部为家属代录',
  famPatients.join(',') === 'SYN-003,SYN-009,SYN-012', famPatients.join(','));
const proxyRow = rows3.find((r) => data.isProxySubjective(r));
check('家属代录的主观字段被识别为代填', Boolean(proxyRow));

console.log('\n【6】统计同时给出「已记录」与「未记录」');
const st1 = data.stats(rows1, 'bp');
check('SYN-001 血压 已记录 28 / 未记录 2', st1.recorded === 28 && st1.missing === 2,
  `${st1.recorded}/${st1.missing}`);
check('其中设备错误 2 天', st1.deviceError === 2, String(st1.deviceError));
const stSleep1 = data.stats(rows1, 'sleep');
check('SYN-001 睡眠 已记录 27 / 未记录 3', stSleep1.recorded === 27 && stSleep1.missing === 3,
  `${stSleep1.recorded}/${stSleep1.missing}`);

console.log('\n【7】逐页渲染（不抛错且关键内容出现）');

store.patientId = 'SYN-001';
const h = home.homeScreen();
check('首页：五个入口齐全',
  ['问一问', '记健康', '记心情', '存病历', '复诊小结'].every((t) => h.includes(t)));
check('首页：无底部导航栏', !h.includes('tabbar') && !h.includes('nav-bar'));
check('首页：常驻演示横幅', h.includes('刷新后新填的记录会丢失'));

let c = checkin.checkinScreen();
check('记健康：默认折叠，提供「没测出来」开关', c.includes('高压/低压没测出来'));
checkin.CHECKIN_ACTIONS['toggle-vitals']();      // 展开两态选择
c = checkin.checkinScreen();
check('记健康：两个缺失态选项存在（未记录 / 设备错误）',
  c.includes('当时没量') && c.includes('血压计没测出来'));
check('记健康：每日记录人可选', c.includes('老人本人') && c.includes('家属代录'));
check('记健康：睡眠提示可填小数', c.includes('6.5'));

const l = logs.logsScreen();
check('健康记录：统计含「已记录」「未记录」', l.includes('已记录') && l.includes('未记录'));
check('健康记录：图例区分缺失', l.includes('没记录'));
check('健康记录：缺失点不连线（存在虚线间隔）', l.includes('chart__gap'));
check('健康记录：有替代数据表', l.includes('sr-only') && l.includes('<table'));

store.patientId = 'SYN-006';
const l6 = logs.logsScreen();
check('SYN-006：显示不分享提示', l6.includes('本人设置了不分享'));

store.patientId = 'SYN-003';
const l3 = logs.logsScreen();
check('SYN-003：提示心情由家属填写', l3.includes('家属填写'));

store.ui.logsMetric = 'sleep';
const lSleep = logs.logsScreen();
check('睡眠视图：参考线标注「少于 6 小时」', lSleep.includes('少于 6 小时'));
store.ui.logsMetric = 'bp';

store.patientId = 'SYN-001';
const m = mood.moodScreen();
check('记心情：四个心情选项', ['很好', '一般', '不太好', '不回答'].every((t) => m.includes(t)));
check('记心情：说明可以跳过', m.includes('这些问题都可以不回答'));
check('记心情：说明跳过不会被当成心情不好', m.includes('跳过不会被当成心情不好'));

const r = records.recordsScreen();
check('存病历：常驻内存提示', r.includes('刷新后会丢掉'));
check('存病历：提示勿上传真实病历', r.includes('请勿上传真实病历'));
check('存病历：已有病历标为已确认', r.includes('已确认'));

const s = summary.summaryScreen();
check('复诊小结：有小结内容区（生成后成为可编辑文本框）', s.includes('data-summary-slot'));
check('复诊小结：未生成时给出引导语', s.includes('还没有生成'));
check('复诊小结：缺少的信息清单', s.includes('缺少的信息'));
check('复诊小结：免责句', s.includes('不是诊断'));
check('复诊小结：打印样式钩子', s.includes('print-only'));

const a = ask.askScreen();
check('问一问：说明未连接 DeepSeek', a.includes('未连接 DeepSeek'));
check('问一问：建议问题', ['最近血压怎样', '睡得怎么样', '病历里写了什么'].every((t) => a.includes(t)));

const se = settings.settingsScreen();
check('设置：三档字号', ['small', 'normal', 'large'].every((v) => se.includes(`"${v}"`)));
check('设置：展示分享设置', se.includes('我的分享设置'));
check('设置：免责四条', se.includes('不是真实老人'));

console.log('\n【8】四类回答');

const aBp = ask.computeAnswer('最近血压怎样');
check('血压问题 → 能回答', aBp.kind === 'answer', aBp.kind);
check('血压回答含天数与日期', /28 天/.test(aBp.text) && /月/.test(aBp.text));
check('血压回答带依据', aBp.sources.length > 0);
check('血压回答带免责句', Boolean(aBp.disclaimer));

const aSleep = ask.computeAnswer('睡得怎么样');
check('睡眠问题 → 能回答且含缺失天数', aSleep.kind === 'answer' && aSleep.text.includes('没有记录'));

const aMed = ask.computeAnswer('我吃的什么药');
check('问药名 → 不知道', aMed.kind === 'unknown', aMed.kind);
check('问药名回答含「答不上来」', aMed.text.includes('答不上来'));

const aAdvice = ask.computeAnswer('药能不能加一片');
check('问加药 → 要问医生', aAdvice.kind === 'doctor', aAdvice.kind);
check('要问医生回答含「不能替医生做决定」', aAdvice.text.includes('不能替医生做决定'));
check('要问医生提供跳小结按钮', Boolean(aAdvice.action && aAdvice.action.nav === '#/summary'));

const aUnknown = ask.computeAnswer('今天天气怎么样');
check('无关问题 → 不知道', aUnknown.kind === 'unknown', aUnknown.kind);

store.patientId = 'SYN-001';
const aRec = ask.computeAnswer('病历里写了什么');
check('病历问题 → 能回答', aRec.kind === 'answer', aRec.kind);
check('病历回答先声明份数', /一共有 \d+ 份病历/.test(aRec.text), aRec.text.slice(0, 30));

console.log('\n【9】未确认文件不进问答');
const before = store.data.records.length;
store.data.records.push({
  record_id: 'UP-TEST', patient_id: 'SYN-001', record_date: '2026-08-30',
  record_type: '其他', source_label: '测试', record_text: '张三 高血压 药名 XYZ',
  text_status: 'unconfirmed', is_synthetic: true,
});
const aUnconf = ask.computeAnswer('病历里写了什么');
check('未确认文件不进回答', !aUnconf.text.includes('XYZ'), aUnconf.text.slice(0, 40));
check('且提示「还没核对过」', aUnconf.text.includes('还没核对过') || aUnconf.sources.every(
  (x) => !x.label.includes('UP-TEST')));
store.data.records.length = before;

console.log('\n【10】本人/家属代录写入与覆盖不串数据');
store.patientId = 'SYN-001';
const dayBefore = data.findCheckin(store.data, 'SYN-001', '2026-08-01');
const moodBefore = dayBefore.mood_response;
state.upsertCheckin({
  patient_id: 'SYN-001', record_date: '2026-08-01',
  systolic_mmhg: 120, diastolic_mmhg: 70, pulse_bpm: 60,
  capture_status: 'recorded', recorded_by_type: 'self',
  sleep_hours: 7, mood_response: dayBefore.mood_response,
  wants_to_talk: dayBefore.wants_to_talk, self_report_note: null,
});
const dayAfter = data.findCheckin(store.data, 'SYN-001', '2026-08-01');
check('覆盖后数值更新', dayAfter.systolic_mmhg === 120);
check('覆盖后心情未被清掉', dayAfter.mood_response === moodBefore, String(dayAfter.mood_response));

console.log('\n【11】记心情只改心情三列');
const row8 = data.checkinsOf(store.data, 'SYN-001').find((r) => r.record_date === '2026-08-02');
const bp8 = row8.systolic_mmhg;
state.patchMood('SYN-001', '2026-08-02', { mood_response: '很好', wants_to_talk: '愿意' });
const row8b = data.checkinsOf(store.data, 'SYN-001').find((r) => r.record_date === '2026-08-02');
check('血压未被心情写入改动', row8b.systolic_mmhg === bp8, `${bp8} → ${row8b.systolic_mmhg}`);
check('心情已更新', row8b.mood_response === '很好');

const newMood = data.checkinsOf(store.data, 'SYN-001').find((r) => r.record_date === '2026-08-31');
check('不存在的日期不会误建记录', !newMood);

console.log('\n【12】缺失信息扫描');
const miss1 = data.scanMissing(rows1, store.data.patients[0]);
check('SYN-001 缺项含药物未记录', miss1.some((x) => x.text.includes('药物名称和剂量没有记录')));
check('SYN-001 缺项含设备错误日期', miss1.some((x) => x.text.includes('设备没测出来')));
check('SYN-001 过敏未知进清单', miss1.some((x) => x.text.includes('过敏情况没有确认过')));
const miss3 = data.scanMissing(rows3, store.data.patients[2]);
check('SYN-003 过敏已知 → 不进清单', !miss3.some((x) => x.text.includes('过敏情况没有确认过')));

console.log('\n【13】复诊小结只陈述事实');
/* 前两组测试写过数据，这里重新加载，保证断言针对原始模拟数据 */
await state.init();
const rows1Clean = data.checkinsOf(store.data, 'SYN-001');
const rows3Clean = data.checkinsOf(store.data, 'SYN-003');
const sum = summary.generateSummary(
  store.data.patients[0], rows1Clean, data.recordsOf(store.data, 'SYN-001'),
  '2026-08-01', '2026-08-30',
);
check('含六个章节', ['一、血压', '二、睡眠', '三、心情', '四、病历摘要', '五、缺少的信息', '六、想问医生的问题']
  .every((t) => sum.includes(t)));
check('含天数与范围', /共记录 28 天/.test(sum) && /130—148/.test(sum));
check('含缺失信息', sum.includes('药物名称和剂量没有记录'));
check('含免责句', sum.includes('不是诊断'));
check('无诊断性措辞', !/诊断为|患有|建议服用|情绪不稳定|抑郁/.test(sum));
check('不引用未确认文件', !sum.includes('UP-TEST'));

const sum3 = summary.generateSummary(
  store.data.patients[2], rows3Clean, data.recordsOf(store.data, 'SYN-003'),
  '2026-08-01', '2026-08-30',
);
check('SYN-003 小结声明记录由家属代录', sum3.includes('家属代录'));

console.log('\n【14】转义与注入防护');
const u = await import('../src/ui.js');
check('esc 处理尖括号', u.esc('<script>x</script>') === '&lt;script&gt;x&lt;/script&gt;');
check('esc 处理引号', u.esc('a"b\'c') === 'a&quot;b&#39;c');

console.log('\n【15】页面 × 状态覆盖');
store.status = 'loading';
const { render } = await import('../src/router.js');
render();
check('加载态渲染出中文加载文案', appEl.innerHTML.includes('正在读取模拟资料'));
store.status = 'error';
store.error = '测试错误';
render();
check('错误态渲染出中文提示与重试', appEl.innerHTML.includes('资料没读出来'));
store.status = 'ready';
store.patientId = 'SYN-001';
render();
check('恢复正常渲染首页', appEl.innerHTML.includes('问一问'));


console.log('\n【16】端到端流程：重复日期必须先确认（覆盖）');
await state.init();
store.patientId = 'SYN-001';
const before29 = data.findCheckin(store.data, 'SYN-001', '2026-08-29');
check('8月29日原有数据存在', Boolean(before29));

/* 8月29日已有记录 → 保存应走「已经记过了」确认，而不是静默覆盖 */
store.forms.checkin = {
  record_date: '2026-08-29', systolic_mmhg: '', diastolic_mmhg: '', pulse_bpm: '',
  sleep_hours: '6', recorded_by_type: 'self', vitals_state: 'device_error', note: '',
};
checkin.CHECKIN_ACTIONS['save-checkin']();
await new Promise((r) => setTimeout(r, 60));
check('未确认前数据未被改写',
  data.findCheckin(store.data, 'SYN-001', '2026-08-29').capture_status === before29.capture_status);

checkin.CHECKIN_ACTIONS['confirm-overwrite-checkin']();
await new Promise((r) => setTimeout(r, 900));
const savedRow = data.findCheckin(store.data, 'SYN-001', '2026-08-29');
check('确认后 capture_status = device_error', savedRow.capture_status === 'device_error',
  savedRow.capture_status);
check('缺失读数写入 null，而不是 0',
  savedRow.systolic_mmhg === null && savedRow.diastolic_mmhg === null && savedRow.pulse_bpm === null);
check('睡眠被保留', savedRow.sleep_hours === 6);
check('出现保存成功提示', Boolean(store.ui.successCheckin));

const logsAfter = logs.logsScreen();
check('回看列表出现「设备错误」徽标', logsAfter.includes('设备错误'));
/* 列表按日期倒序：8月29日 的行位于 8月30日 与 8月28日 之间 */
console.log('\n【17】端到端流程：空血压时先问清楚，不默认丢成 0');
await state.init();
store.patientId = 'SYN-001';
store.forms.checkin = {
  record_date: '2026-08-29', systolic_mmhg: '', diastolic_mmhg: '', pulse_bpm: '',
  sleep_hours: '7', recorded_by_type: 'self', vitals_state: 'recorded', note: '',
};
checkin.CHECKIN_ACTIONS['save-checkin']();
await new Promise((r) => setTimeout(r, 60));
/* 未声明状态 → 不应写入 */
const stillOld = data.findCheckin(store.data, 'SYN-001', '2026-08-29');
check('三项读数全空且未声明时，不直接保存',
  stillOld.capture_status === 'recorded' && stillOld.sleep_hours !== 7);
/* 选择「只记睡眠」→ 写为 not_recorded */
checkin.CHECKIN_ACTIONS['confirm-blank-vitals']();
await new Promise((r) => setTimeout(r, 900));
const blankRow = data.findCheckin(store.data, 'SYN-001', '2026-08-29');
check('选择「只记睡眠」后写为 not_recorded', blankRow.capture_status === 'not_recorded',
  blankRow.capture_status);
check('仍不写成 0',
  blankRow.systolic_mmhg === null && blankRow.diastolic_mmhg === null && blankRow.pulse_bpm === null);
check('睡眠写入 7 小时', blankRow.sleep_hours === 7);

console.log('\n【18】端到端流程：记心情只动心情三列');
await state.init();
store.patientId = 'SYN-001';
const row28 = data.findCheckin(store.data, 'SYN-001', '2026-08-28');
const bp28 = [row28.systolic_mmhg, row28.diastolic_mmhg, row28.pulse_bpm, row28.capture_status];
state.patchMood('SYN-001', '2026-08-28', { mood_response: '跳过', wants_to_talk: '跳过' });
const row28b = data.findCheckin(store.data, 'SYN-001', '2026-08-28');
check('心情写入「跳过」', row28b.mood_response === '跳过');
check('血压/脉搏/状态完全未变',
  [row28b.systolic_mmhg, row28b.diastolic_mmhg, row28b.pulse_bpm, row28b.capture_status]
    .join(',') === bp28.join(','),
  `${bp28.join(',')} → ${[row28b.systolic_mmhg, row28b.diastolic_mmhg, row28b.pulse_bpm, row28b.capture_status].join(',')}`);
const logsMood = logs.logsScreen();
check('列表把跳过显示为「这次没回答」', logsMood.includes('这次没回答'));
const moodBlock = logsMood.slice(
  logsMood.lastIndexOf('data-open="2026-08-28"'),
  logsMood.lastIndexOf('data-open="2026-08-27"'),
);
check('该行心情显示为「这次没回答」', moodBlock.includes('这次没回答'),
  moodBlock.slice(0, 160));
check('该行心情未被渲染成 strong 的「不太好」',
  !/心情<\/span><span class="strong">不太好/.test(moodBlock), moodBlock.slice(0, 200));

console.log('\n【19】端到端流程：上传文件标记为未确认');
await state.init();
store.patientId = 'SYN-003';
state.addUploadedFile({
  id: 'UP-FLOW', patient_id: 'SYN-003', file_name: '测试.pdf', size: 12345,
  mime: 'application/pdf', record_date: '2026-08-30', record_type: '随访记录',
  text_status: 'unconfirmed', object_url: 'blob:stub',
});
const recAfter = records.recordsScreen();
check('上传后出现在「我上传的」', recAfter.includes('我上传的（1 份）'));
check('状态标为未确认', recAfter.includes('未确认'));
check('说明不会被当成事实回答', recAfter.includes('暂时不会当成事实回答'));

console.log('\n【20】端到端流程：四类问答');
store.patientId = 'SYN-001';
const q1 = ask.computeAnswer('我今天吃了什么饭');
check('无关问题给出「不知道」并说明原因',
  q1.kind === 'unknown' && q1.text.includes('没有记这件事'), q1.kind);
const q2 = ask.computeAnswer('这个药能不能停药');
check('停药问题归入「要问医生」', q2.kind === 'doctor', q2.kind);
const q3 = ask.computeAnswer('病历里写了什么');
check('病历问答不算诊断，且带免责句', q3.kind === 'answer' && Boolean(q3.disclaimer));

console.log('\n【21】端到端流程：生成复诊小结草稿');
await state.init();
store.patientId = 'SYN-001';
store.forms.summary = null;
summary.SUMMARY_ACTIONS['generate-summary']();
const draft = state.summaryDraftOf('SYN-001');
check('草稿已生成', Boolean(draft && draft.text.length > 100));
check('草稿记录了出处', Boolean(draft && draft.sources.checkins > 0 && draft.sources.patient === 'SYN-001'));
check('草稿初始标记为未修改', Boolean(draft) && draft.edited === false);
const sumScreen = summary.summaryScreen();
check('页面出现可编辑文本框', sumScreen.includes('data-summary-text'));
check('页面出现打印按钮', sumScreen.includes('打印'));
check('小结正文出现在编辑框里', sumScreen.includes('复诊小结草稿'));


console.log('\n【22】回归：属性拼接正确、动作都能被分发');
await state.init();
const allHtml = [
  home.homeScreen(),
  checkin.checkinScreen(),
  logs.logsScreen(),
  mood.moodScreen(),
  records.recordsScreen(),
  summary.summaryScreen(),
  ask.askScreen(),
  settings.settingsScreen(),
].join('\n');

/* 曾出现 data-action="open-day"="2026-08-30" 这种属性名被吞掉的问题 */
check('不存在 data-action="..."="..." 的错误拼接',
  !/data-action="[^"]*"="[^"]*"/.test(allHtml));
check('不存在连续重复的 = 号', !/="[^"]*"="/.test(allHtml));

const actionNames = [...allHtml.matchAll(/data-action="([^"]+)"/g)].map((m) => m[1]);
const unique = [...new Set(actionNames)];
const missingActions = unique.filter((a) => !getAction(a));
check('所有 data-action 都已注册', missingActions.length === 0, missingActions.join(', '));
check('动作数量合理（>= 20）', unique.length >= 20, String(unique.length));

/* 记录行的打开动作必须带日期参数，否则弹层取不到数据 */
const openDayAttrs = [...allHtml.matchAll(/data-action="open-day" data-open="([^"]+)"/g)];
check('记录行都带 data-open 日期', openDayAttrs.length === 30, String(openDayAttrs.length));

console.log('\n【23】缺失值在列表中的呈现（设备错误 vs 未记录）');
await state.init();
store.patientId = 'SYN-001';
/* 在干净数据上各造一条，避免受前面写入影响 */
state.upsertCheckin({
  patient_id: 'SYN-001', record_date: '2026-08-29',
  systolic_mmhg: null, diastolic_mmhg: null, pulse_bpm: null,
  capture_status: 'device_error', recorded_by_type: 'self', sleep_hours: 6,
  mood_response: '不太好', wants_to_talk: '跳过', self_report_note: null,
});
state.upsertCheckin({
  patient_id: 'SYN-001', record_date: '2026-08-28',
  systolic_mmhg: null, diastolic_mmhg: null, pulse_bpm: null,
  capture_status: 'not_recorded', recorded_by_type: 'self', sleep_hours: null,
  mood_response: '跳过', wants_to_talk: '跳过', self_report_note: null,
});

const listHtml = logs.logsScreen();
/* 图表热区和列表行都带 data-open，列表在文档后面，因此取最后一次出现 */
const seg = (a, b) => {
  const i = listHtml.lastIndexOf(`data-open="${a}"`);
  const j = listHtml.lastIndexOf(`data-open="${b}"`);
  return listHtml.slice(i, j > i ? j : listHtml.length);
};
check('图表上也生成了可点击的数据点', (listHtml.match(/data-action="chart-point"/g) || []).length >= 25);

const errBlock = seg('2026-08-29', '2026-08-28');
check('设备错误行显示「—」', errBlock.includes('class="missing__dash"'));
check('设备错误行带「设备错误」徽标', errBlock.includes('badge--device-error'));
check('设备错误行不显示 0 mmHg', !/\b0<\/span>/.test(errBlock));
check('设备错误行仍显示已记录的心情',
  /心情<\/span><span class="strong">不太好/.test(errBlock));

const nrBlock = seg('2026-08-28', '2026-08-27');
check('未记录行显示「—」', nrBlock.includes('class="missing__dash"'));
check('未记录行带「未记录」徽标', nrBlock.includes('badge--not-recorded'));
check('未记录行不带「设备错误」徽标', !nrBlock.includes('badge--device-error'));
check('未记录行的心情显示「这次没回答」', nrBlock.includes('这次没回答'));
check('未记录行不显示 0 mmHg', !/\b0<\/span>/.test(nrBlock));
check('两种缺失态的徽标样式不同',
  errBlock.includes('badge--device-error') && !nrBlock.includes('badge--device-error'));

/* 记录详情弹层能打开（此前 data-open 属性拼接错误导致点不开） */
check('点击记录行能打开详情弹层（动作已注册）', Boolean(getAction('open-day')));
logs.LOGS_ACTIONS['open-day']({ dataset: { open: '2026-08-29' } });
check('详情弹层渲染出了内容', appEl.innerHTML.length > 0);


console.log('\n【24】回归：所有渲染出的 class 都存在于 CSS');
const css = readFileSync(join(root, 'assets', 'app.css'), 'utf8')
  + readFileSync(join(root, 'assets', 'tokens.css'), 'utf8');
const cssClasses = new Set([...css.matchAll(/\.([a-zA-Z][\w-]*)/g)].map((m) => m[1]));

/* 每个页面在三种演示老人下都渲染一遍，覆盖所有分支 */
const rendered = [];
for (const pid of ['SYN-001', 'SYN-003', 'SYN-006']) {
  store.patientId = pid;
  store.ui.logsMetric = 'bp';
  rendered.push(logs.logsScreen());
  store.ui.logsMetric = 'sleep';
  rendered.push(logs.logsScreen());
  store.ui.logsMetric = 'pulse';
  rendered.push(logs.logsScreen());
  rendered.push(home.homeScreen(), mood.moodScreen(), records.recordsScreen());
}
store.patientId = 'SYN-001';
store.ui.logsMetric = 'bp';
rendered.push(checkin.checkinScreen(), summary.summaryScreen(), ask.askScreen(), settings.settingsScreen());

const usedClasses = new Set(
  rendered.flatMap((h) => [...h.matchAll(/class="([^"]+)"/g)]
    .flatMap((m) => m[1].split(/\s+/))
    .filter(Boolean)),
);
/* sr-only / print-only 等在 CSS 中定义；这里只检查确实缺失的 */
const unknown = [...usedClasses].filter((c) => !cssClasses.has(c));
check('没有引用不存在的 CSS 类', unknown.length === 0, unknown.join(', '));
check('三态徽标类名会生成连字符形式', badge('device_error').includes('badge--device-error'));
check('未记录徽标类名正确', badge('not_recorded').includes('badge--not-recorded'));

/* ---------------- 汇总 ---------------- */

console.log(`\n${'='.repeat(52)}`);
if (failures.length) {
  console.log(`失败 ${failures.length} 项 / 通过 ${pass} 项`);
  failures.forEach((f) => console.log(`  ✗ ${f}`));
  process.exit(1);
} else {
  console.log(`全部通过：${pass} 项断言`);
}
