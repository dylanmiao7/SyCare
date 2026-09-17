# 数据字典

共同字段：patient_id关联patients；is_synthetic恒为true。ID是测试文本，不是生产身份。JSON null和CSV空单元格表示缺失；0是有效值。日期YYYY-MM-DD，时间+08:00。

## patients

| 字段 | 类型 | 含义 |
|---|---|---|
| patient_id | text | 主键，SYN-001等 |
| display_name | text | 模拟称呼 |
| age_years | integer | 2026-08-01时的年龄，岁 |
| gender | text | 女/男/未说明 |
| living_arrangement | text | 独居/与配偶同住/与家人同住 |
| support_person | text | 支持对象类型，无联系方式 |
| sharing_preference | text | 不分享/可与指定家属分享；只是偏好 |
| preferred_language | text | zh-CN |
| history_summary | text | 模拟既往情况 |
| allergy_status | text | 未知/自述无已知过敏/自述青霉素过敏 |

## health_logs

| 字段 | 类型 | 含义 |
|---|---|---|
| log_id | text | 主键 |
| record_date | date text | 每人每天一条 |
| systolic_mmhg | integer/null | 收缩压，毫米汞柱 |
| diastolic_mmhg | integer/null | 舒张压，毫米汞柱 |
| pulse_bpm | integer/null | 脉搏，次/分钟 |
| capture_status | text | recorded已记录/not_recorded未记录/device_error设备错误 |
| recorded_by_type | text | self本人/family家属；须另存真实用户ID |
| note | text | 记录说明 |

## wellbeing_logs

| 字段 | 类型 | 含义 |
|---|---|---|
| wellbeing_id | text | 主键 |
| record_date | date text | 每人每天一条 |
| sleep_hours | number/null | 前一晚自述睡眠小时数 |
| mood_response | text | 很好/一般/不太好/跳过；非诊断量表 |
| wants_to_talk | text | 愿意/暂时不需要/跳过；不代表已通知家属 |
| self_report_note | text | 本人模拟自述 |

## medical_records

| 字段 | 类型 | 含义 |
|---|---|---|
| record_id | text | 主键 |
| record_date | date text | 病历日期 |
| record_type | text | 建档记录/随访记录 |
| source_label | text | 中文教学模拟文本 |
| record_text | text | 中文全文 |
| text_status | text | confirmed_demo：示例文字已确定，不表示真实患者确认 |

## chat_messages

| 字段 | 类型 | 含义 |
|---|---|---|
| message_id | text | 主键 |
| conversation_id | text | 一组问答编号 |
| sent_at | ISO timestamp | 消息时间 |
| role | text | user/assistant |
| content | text | 中文模拟消息 |
| source_record_id | text/null | 引用medical_records.record_id；问题本身可为空 |

## 小结示例

visit_summary_examples.json包含patient_id、period_start、period_end、draft_text、source_record_ids、status和is_synthetic。source_record_ids为病历编号数组，status固定draft_needs_user_confirmation，不能展示成已确认医嘱。

生产实现将增加创建人、更新时间、授权关系、文件路径和确认人等字段。本字典定义教学素材，不表示已完成数据库迁移。
