# SyCare 老年健康记录与问答助手

面向国内居家老人，中文界面。首版：问答入口＋健康记录、病历收纳、复诊准备小结、关怀记录。

## 从这里开始

1. [20小时开发流程与验收](docs/01_20小时开发流程.md)
2. [学生注册与本地协作手册](docs/02_学生注册与协作手册.md)
3. [中文模拟数据](data/demo_cn/README.md)

可转发文件：[流程图PNG](output/SyCare_20小时流程图.png)、[开发流程PDF](output/pdf/SyCare_20小时开发流程.pdf)、[学生手册PDF](output/pdf/SyCare_学生注册与协作手册.pdf)。

仓库：https://github.com/dylanmiao7/SyCare

当前为开发准备包，尚未建立可运行前后端。学生用GitHub Desktop克隆并接受协作邀请。没有package.json时不要执行npm启动命令。

建议架构：React/Vite中文前端、Supabase登录/数据库/私有文件/Edge Functions、DeepSeek后端问答。配置占位见.env.example与.env.server.example。真实key与真实健康资料不上传公开仓库。

## 模拟数据

data/demo_cn只有三张数据表：12位老人、360条合并健康与关怀的每日记录、24条病历；另有三份对应不同老人的上传测试PDF。三张表用patient_id关联。

正式建表、授权与导入在开发阶段完成；素材不是生产数据库迁移。

真实健康数据试用另行确认部署。模拟人数不是实际服务人数，模拟数据不能证明医疗效果。
