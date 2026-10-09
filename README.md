# SyCare 老年健康记录与问答助手

面向国内居家老人，中文界面。首版：问答入口＋健康记录、病历收纳、复诊准备小结、关怀记录。

## 从这里开始

1. [20小时开发流程与验收](docs/01_20小时开发流程.md)
2. [学生注册与本地协作手册](docs/02_学生注册与协作手册.md)
3. [中文模拟数据](data/README.md)

仓库：https://github.com/dylanmiao7/SyCare

## 本地运行前端

仓库的 `web/` 目录现在有一个可运行的 React + Vite 前端，连接 Supabase 中的模拟数据。

1. 安装 Node.js（建议使用当前 LTS 版本）。
2. 在终端进入 `web/` 目录，安装依赖：`npm install`。
3. 复制 `web/.env.example` 为 `web/.env.local`，填入 Supabase 项目 URL 和 Publishable key。Vite 变量名以 `VITE_` 开头；不要把 `service_role` key 放进浏览器端。
4. 在 `web/` 目录运行 `npm run dev`，打开终端显示的本地地址。

第一次上课可以把这件事解释成三步：React 负责画页面，Supabase 保存共享数据，前端用项目 URL 和公开的 Publishable key 请求数据。学生先打开总览、切换长辈、查看记录，再新增一条虚构记录并确认刷新后仍能看到。

## 当前首版包含

- 长辈档案与最近记录总览
- 血压、脉搏、睡眠、心情和交流意愿的每日记录
- 关怀时间线
- 病历文字查看与新增
- 可编辑、可打印的复诊准备小结
- 按已保存资料进行的规则式问答（不是 AI 医疗建议）

PDF 原件上传、登录与角色权限、DeepSeek 后端问答和通知尚未接入。当前数据库是课堂演示配置，表格开放匿名读写；只能使用模拟资料。它可以作为可运行的课堂演示版，不能直接用于真实长辈资料或作为安全的医疗产品上线。

## GitHub Pages

推送到 `main` 后，`.github/workflows/deploy-pages.yml` 会自动构建并发布 `web/`。首次启用时，请在 GitHub 仓库 Settings → Pages 中将 Build and deployment 的 Source 设为 GitHub Actions。成功后网址为 `https://dylanmiao7.github.io/SyCare/`。

## 模拟数据

data文件夹只有三张数据表：12位老人、360条合并健康与关怀的每日记录、24条病历；`data/测试数据/` 中有三份对应不同老人的上传测试PDF。三张表用patient_id关联。

正式建表与模拟数据导入已在 Supabase 完成；`data/` 素材不是生产数据库迁移。

真实健康数据试用另行确认部署。模拟人数不是实际服务人数，模拟数据不能证明医疗效果。
