import { supabase } from './supabase'

// 调用服务器上的 ask 函数（里面再调用 DeepSeek）。失败或超时返回 null，由规则式回答兜底。
export async function askAI({ patientId, question, slots }) {
  if (!supabase) return null
  const meds = slots.map((slot) => ({ name: slot.med.name, dose: slot.med.dose, time: slot.time, taken: slot.taken }))
  const timeout = new Promise((resolve) => setTimeout(() => resolve({ error: new Error('timeout') }), 30000))
  try {
    const { data, error } = await Promise.race([
      supabase.functions.invoke('ask', { body: { question, patient_id: patientId, meds } }),
      timeout,
    ])
    if (error || !data?.text) {
      console.warn('小安暂时连不上 AI，改用规则回答：', error?.message || data?.error)
      return null
    }
    return data.text
  } catch (error) {
    console.warn('小安暂时连不上 AI，改用规则回答：', error)
    return null
  }
}
