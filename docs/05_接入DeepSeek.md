# 接入 DeepSeek：小安的"问一问"

## 怎么工作

```
老人在对话里提问
  → 网页先用规则把关：急症、危机、加减药、记录数据、拍病历，都在网页里直接处理
  → 剩下的问题发给 Supabase 上的 ask 函数
      → ask 函数读取这位模拟老人最近 14 天记录和 5 份病历
      → 连同"小安的回答规则"一起发给 DeepSeek
  → DeepSeek 的回答显示给老人
  → 如果 ask 函数没部署、超时或出错，自动改用原来的规则式回答
```

- 函数代码：[supabase/functions/ask/index.ts](../supabase/functions/ask/index.ts)
- 小安的回答规则（系统提示词）在这个文件最上面的 `SYSTEM_PROMPT`，上课时让学生改这一段
- 网页调用：[web/src/lib/ai.js](../web/src/lib/ai.js)

## 密钥放在哪里

DeepSeek 密钥**只能**存成 Supabase 的服务器密钥（Secret），名字叫 `DEEPSEEK_API_KEY`。

不要写进 `web/.env.local`，不要写进任何代码文件，也不要提交到 GitHub。网页里以 `VITE_` 开头的变量都会被打包进公开网站，任何人都能看到。

## 部署（二选一）

### 方法一：在 Supabase 网页后台操作

1. 打开 Supabase 项目 → **Edge Functions** → **Deploy a new function** → **Via Editor**
2. 函数名填 `ask`，把 `supabase/functions/ask/index.ts` 的全部内容粘贴进去，点 **Deploy**
3. 进入 `ask` 函数的设置，关闭 **Verify JWT**（网页用的是 Publishable key，不是登录令牌）
4. 打开 **Edge Functions → Secrets**，新增一条：名字 `DEEPSEEK_API_KEY`，值填 DeepSeek 密钥

### 方法二：在终端用命令行

需要先装好 Node.js。在仓库根目录依次运行：

```bash
npx supabase login
```

```bash
npx supabase link --project-ref cmpakpwccncusnmlzysg
```

```bash
npx supabase secrets set DEEPSEEK_API_KEY=这里换成你的密钥
```

```bash
npx supabase functions deploy ask --no-verify-jwt
```

## 部署后怎么检查

打开网站 → 点小安 → 问一个规则答不了的问题，比如"低压是什么意思？"。

- 回答是自然的口语，说明 DeepSeek 接上了
- 回答是"这个问题我现在还答不上来……"，说明还在用规则兜底。打开浏览器开发者工具的控制台，会看到"小安暂时连不上 AI"和原因

再按[第 03 课教案](03_下一课教案_复诊小结_血压提示_AI问答.md)里的 10 个测试问题逐个试一遍。

## 注意

- **费用**：ask 函数关闭了 JWT 验证，知道地址的人都能调用。函数只接受 `SYN-` 开头的模拟老人、问题不超过 300 字、回答不超过 400 个 token，但仍建议在 DeepSeek 后台只充少量余额。
- **密钥泄露**：密钥如果出现在聊天记录、截图或代码里，建议到 DeepSeek 后台作废并重新生成。
- **只用模拟资料**：记录会发送给 DeepSeek，所以不能放真实老人的健康信息。
