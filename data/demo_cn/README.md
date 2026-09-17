# 国内场景中文模拟数据

适配五个入口：问一问、记健康、存病历、复诊小结、关怀记录。

| 文件 | 数量 | 用途 |
|---|---:|---|
| patients.csv | 12人 | 档案、居住情况、分享偏好 |
| health_logs.csv | 360条 | 每人30天血压和脉搏，区分本人/家属代录 |
| wellbeing_logs.csv | 360条 | 睡眠、心情、是否想交流，可跳过 |
| medical_records.csv | 24条 | 每人建档和随访各1条 |
| chat_messages.csv | 24条 | 每人一问一答，有来源病历编号 |
| visit_summary_examples.json | 3份 | 待用户确认的小结示例 |
| sample_pdfs/ | 3份 | 中文文字PDF，供上传和来源核对 |
| dataset.json | 同上5张表 | 保留数值、布尔值和null类型 |

日期为2026-08-01至30日，对话为8月31日，时区Asia/Shanghai。CSV为UTF-8 BOM；空单元格是缺失，JSON为null，0是有效值。所有行is_synthetic=true。

先用SYN-001（血压趋势）、SYN-003（希望交流）、SYN-006（享受独处且不分享）三人，再扩展到12人。SYN-002含连续缺失，SYN-005在8月21日有174/96的设定读数。

所有人物数值均为教学设定，未拟合真实分布。心情选项不是心理量表。病历与聊天未经临床专家审阅，不能作为医疗标准答案。PDF为文字版，不代表扫描件OCR已测试。

没有真实地址、医院、挂号、用药提醒或美国调查数据。技术字段保留英文，面向用户的内容使用中文。

sharing_preference是偏好，不是数据库权限。Supabase导入前需建立Auth用户、老人授权关系、RLS和私有文件规则。不能将12人直接公开给所有登录用户。recorded_by_type是演示标签，真实系统须另存实际录入用户ID。

字段定义见[数据字典](DATA_DICTIONARY.md)。重新生成：项目根目录执行 `python scripts/build_demo_cn.py`（需要reportlab）。核对：`python scripts/check_demo_cn.py`（需要pdftotext）。会覆盖生成文件，先保存个人修改。
