# 中文模拟数据：只看三张表

保留原有规模：12位虚构老人、每人30天记录、每人2条病历。只有下面三张CSV表，它们用 `patient_id` 关联；另有一份供上传测试的[中文病历PDF](sample_pdfs/SYN-003_模拟病历.pdf)。所有内容都是模拟的。

| 表 | 行数 | 什么时候用 | 关键字段 |
|---|---:|---|---|
| [patients.csv](patients.csv) | 12 | 显示老人档案，查看居住和分享偏好 | `patient_id`、`display_name`、`age_years`、`sharing_preference` |
| [daily_checkins.csv](daily_checkins.csv) | 360 | 同一张表支持“记健康”和“记心情”；每人每天一行 | `patient_id`、`record_date`、血压、脉搏、睡眠、心情、交流意愿 |
| [medical_records.csv](medical_records.csv) | 24 | 病历收纳、复诊小结和问答引用；每人建档与随访各一条 | `record_id`、`patient_id`、`record_date`、`record_text` |

**怎么连起来？** 先在 `patients.csv` 找到 `SYN-003`，再用同一个 `patient_id` 筛选 `daily_checkins.csv` 和 `medical_records.csv`。问“最近睡得怎么样”时读每日表；问“病历里写了什么”时读病历表。复诊小结从这两张表临时生成草稿，聊天记录由应用在真实使用时保存，因此不再预放聊天表和小结表。

**如何处理空白？** 每日表的 `systolic_mmhg`、`diastolic_mmhg`、`pulse_bpm` 同时为空时，查看 `capture_status` 是 `not_recorded`（未记录）还是 `device_error`（设备错误）。不要当作0。`mood_response` 的“跳过”是本人没有回答；不是心情不好。`wants_to_talk` 只是交流意愿，不代表已经通知家属。`recorded_by_type` 是模拟的本人/家属标签，正式应用须记录真实登录用户。

建议先演示 `SYN-001`（血压趋势）、`SYN-003`（睡眠与交流需求、上传PDF）、`SYN-006`（享受独处、不愿自动分享），再看全部12人。日期为2026年8月1日至30日。心情字段不是心理量表，病历未经临床审核。分享偏好只是数据，正式应用仍需登录授权与数据库访问规则。

CSV为UTF-8 BOM，Excel可直接打开。每行 `is_synthetic=True`。无真实姓名、地址、医院或用药处方。

重新生成需要安装 `reportlab`，在项目根目录运行 `python scripts/build_demo_cn.py`；核对运行 `python scripts/check_demo_cn.py`（需 `pdftotext`）。重新生成会覆盖三张表和测试PDF。
