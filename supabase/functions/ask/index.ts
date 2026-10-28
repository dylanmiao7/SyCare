// 小安的"问一问"：在服务器上调用 DeepSeek，密钥只放在这里，不进网页代码。
// 部署方法见 docs/05_接入DeepSeek.md。

import { createClient } from 'npm:@supabase/supabase-js@2'

// ===== 小安的回答规则（系统提示词）：上课时让学生改这一段 =====
const SYSTEM_PROMPT = `你是 SyCare 的记录助手"小安"，帮老人查看他们自己记下的健康信息。

回答规则：
1. 只根据下面提供的"老人的记录"回答，说明依据的是哪几天的记录。记录里没有的，就说"记录里没有"，不要编造。
2. 用简单、平和、口语化的中文，像护士跟老人说话一样。句子短，不用医学术语；必须用时，用一句话解释。
3. 不判断是什么病，不建议加药、减药、停药、换药或补吃。遇到这类问题，请老人带着记录去问医生或药师。
4. 如果老人提到胸痛、呼吸困难、说话不清、手脚无力等情况，请他马上拨打 120。
5. 如果老人流露出不想活了的念头，温和地回应，请他马上联系信任的人，并告诉他心理援助热线 12356。
6. "老人拍照上传、未核对"的病历，你看不到照片内容，只能说有这份资料，请老人以原件为准。
7. 你不能给家人发消息，也不能修改任何记录。
8. 回答不超过 4 句话，不要用 Markdown、列表符号或表情。
9. 只回答老人问到的事，不要主动提起和问题无关的读数、病历或照片。问题和健康数据无关时（比如想念家人、想聊天），先回应老人的心情，不要扯到血压等记录。`
// ===================================================================

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } })

type Med = { name: string; dose?: string; time: string; taken: boolean }

function buildContext(patient: Record<string, any>, checkins: Record<string, any>[], records: Record<string, any>[], meds: Med[]) {
  const lines = [
    `称呼：${String(patient.display_name || '').replace(/^模拟\s*/, '')}，${patient.age_years ?? '年龄未记录'} 岁`,
    `既往情况：${patient.history_summary || '未记录'}；过敏：${patient.allergy_status || '未记录'}`,
    '',
    '最近的每日记录（空白表示没有记录，不是 0）：',
    ...checkins.map((row) => {
      const bp = row.capture_status === 'recorded' && row.systolic_mmhg != null ? `血压 ${row.systolic_mmhg}/${row.diastolic_mmhg}` : '血压未测'
      return `${row.record_date}：${bp}；脉搏 ${row.pulse_bpm ?? '—'}；睡眠 ${row.sleep_hours ?? '—'} 小时；心情 ${row.mood_response ?? '—'}；想找人聊聊 ${row.wants_to_talk ?? '—'}${row.self_report_note ? `；原话"${String(row.self_report_note).slice(0, 80)}"` : ''}`
    }),
    '',
    '病历：',
    ...(records.length
      ? records.map((record) =>
          String(record.source_label || '').startsWith('老人拍照上传') && !String(record.source_label).includes('已核对')
            ? `${record.record_date} ${record.record_type}：老人拍照上传、未核对，看不到内容`
            : `${record.record_date} ${record.record_type || '病历'}：${String(record.record_text || '').replace(/【完全模拟病历】/g, '').replace(/\s+/g, ' ').slice(0, 300)}`,
        )
      : ['（没有病历）']),
    '',
    '今天的用药打卡（没有打卡不等于没吃药）：',
    ...(meds.length ? meds.map((med) => `${med.time} ${med.name} ${med.dose || ''}：${med.taken ? '已打卡' : '未打卡'}`) : ['（家属还没有设置用药清单）']),
  ]
  return lines.join('\n')
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  if (req.method !== 'POST') return json({ error: 'method not allowed' }, 405)

  const apiKey = Deno.env.get('DEEPSEEK_API_KEY')
  if (!apiKey) return json({ error: 'DEEPSEEK_API_KEY 还没有设置' }, 500)

  let body: { question?: string; patient_id?: string; meds?: Med[] }
  try {
    body = await req.json()
  } catch {
    return json({ error: 'bad request' }, 400)
  }
  const question = String(body.question || '').trim()
  const patientId = String(body.patient_id || '')
  // 只允许模拟老人，问题长度也有上限，避免被拿去随便调用
  if (!question || question.length > 300 || !/^SYN-\d{3}$/.test(patientId)) return json({ error: 'bad request' }, 400)
  const meds = Array.isArray(body.meds) ? body.meds.slice(0, 10) : []

  const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
  const [patientResult, checkinResult, recordResult] = await Promise.all([
    supabase.from('patients').select('*').eq('patient_id', patientId).single(),
    supabase.from('daily_checkins').select('*').eq('patient_id', patientId).order('record_date', { ascending: false }).limit(14),
    supabase.from('medical_records').select('*').eq('patient_id', patientId).order('record_date', { ascending: false }).limit(5),
  ])
  if (patientResult.error) return json({ error: '找不到这位老人' }, 404)

  const context = buildContext(patientResult.data, checkinResult.data || [], recordResult.data || [], meds)

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 25000)
  try {
    const response = await fetch('https://api.deepseek.com/chat/completions', {
      method: 'POST',
      signal: controller.signal,
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: 'deepseek-chat',
        temperature: 0.3,
        max_tokens: 400,
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: `今天是 ${new Date().toISOString().slice(0, 10)}。\n\n老人的记录：\n${context}\n\n老人的问题：${question}` },
        ],
      }),
    })
    if (!response.ok) return json({ error: `DeepSeek 返回 ${response.status}` }, 502)
    const data = await response.json()
    const text = data.choices?.[0]?.message?.content?.trim()
    if (!text) return json({ error: 'DeepSeek 没有返回内容' }, 502)
    return json({ text })
  } catch (error) {
    return json({ error: error instanceof Error && error.name === 'AbortError' ? 'DeepSeek 超时' : 'DeepSeek 调用失败' }, 504)
  } finally {
    clearTimeout(timer)
  }
})
