"""Generate Chinese fixtures for the agreed five-feature teaching prototype.

Run: python scripts/build_demo_cn.py
Dependency: reportlab (for the three sample PDFs). No network or real data.
"""
from pathlib import Path
from datetime import date, timedelta
from collections import Counter
from xml.sax.saxutils import escape
import csv
import json
import random
import statistics

ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'data'/'demo_cn'
SEED=20260917
START=date(2026,8,1)


def dump(path,data):
    path.write_text(json.dumps(data,ensure_ascii=False,indent=2,allow_nan=False)+'\n',encoding='utf-8')


def pdfs(tables):
    from reportlab.pdfbase import pdfmetrics
    from reportlab.pdfbase.ttfonts import TTFont
    from reportlab.pdfbase.cidfonts import UnicodeCIDFont
    from reportlab.lib.styles import ParagraphStyle
    from reportlab.lib.pagesizes import A4
    from reportlab.lib import colors
    from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer
    font='/System/Library/Fonts/STHeiti Light.ttc'
    if Path(font).exists(): pdfmetrics.registerFont(TTFont('CN',font,subfontIndex=0))
    else: pdfmetrics.registerFont(UnicodeCIDFont('STSong-Light'))
    cn='CN' if Path(font).exists() else 'STSong-Light'
    body=ParagraphStyle('body',fontName=cn,fontSize=10.5,leading=17,spaceAfter=9,wordWrap='CJK')
    title=ParagraphStyle('title',parent=body,fontSize=22,leading=30,textColor=colors.HexColor('#143f49'),spaceAfter=14)
    sub=ParagraphStyle('sub',parent=body,fontSize=13,leading=20,textColor=colors.HexColor('#176b78'),spaceBefore=13)
    for pid in ['SYN-001','SYN-003','SYN-006']:
        p=next(p for p in tables['patients'] if p['patient_id']==pid)
        items=[Paragraph('SyCare 中文模拟病历',title),Paragraph('仅供教学与软件测试，不是真实患者、医疗机构或医嘱。',body),
            Paragraph(f'{p["display_name"]}　{pid}　{p["age_years"]}岁',sub),Spacer(1,8)]
        for r in tables['medical_records']:
            if r['patient_id']!=pid: continue
            items.append(Paragraph(f'{r["record_type"]}｜{r["record_date"]}｜{r["record_id"]}',sub))
            for line in r['record_text'].split('\n'): items.append(Paragraph(escape(line),body))
        def footer(c,d):
            c.setFont(cn,8);c.setFillColor(colors.HexColor('#63727c'))
            c.drawString(44,26,'模拟数据｜不得用于诊断、处方或疗效证明')
            c.drawRightString(A4[0]-44,26,str(d.page))
        SimpleDocTemplate(str(OUT/'sample_pdfs'/f'{pid}_模拟病历.pdf'),pagesize=A4,leftMargin=44,rightMargin=44,
            topMargin=40,bottomMargin=43,title=f'{pid} 中文模拟病历',author='SyCare').build(items,onFirstPage=footer,onLaterPages=footer)


def build():
    rng=random.Random(SEED)
    tables={k:[] for k in ['patients','health_logs','wellbeing_logs','medical_records','chat_messages']}
    examples=[]
    for i in range(1,13):
        pid=f'SYN-{i:03d}'
        history='自述既往有高血压。' if i in [1,2,5,6,8,10] else '本次模拟建档未报告慢性病。'
        p=dict(patient_id=pid,display_name=f'模拟老人{i:03d}',age_years=rng.randint(65,88),
            gender=rng.choice(['女','男','未说明']),living_arrangement='独居' if i in [3,6] else rng.choice(['与配偶同住','与家人同住']),
            support_person=rng.choice(['子女','朋友','社区工作人员','暂未指定']),
            sharing_preference='不分享' if i==6 else '可与指定家属分享',
            preferred_language='zh-CN',history_summary=history,
            allergy_status='未知' if i==1 else rng.choice(['未知','自述无已知过敏','自述青霉素过敏']),is_synthetic=True)
        tables['patients'].append(p)
        baseline=rng.uniform(124,142)
        for day in range(30):
            dt=START+timedelta(days=day)
            sbp=round(rng.gauss(baseline,5));dbp=round(rng.gauss(76,4));pulse=rng.randint(60,88)
            if i==1: sbp=round(148-day*.5+rng.gauss(0,3))
            capture='recorded'
            if rng.random()<.06 or (i==2 and day in [3,4,10,11,12,20]):
                sbp=dbp=pulse=None;capture=rng.choice(['not_recorded','device_error'])
            if i==5 and day==20: sbp,dbp,pulse,capture=174,96,83,'recorded'
            recorder='family' if i%3==0 and i!=6 else 'self'
            tables['health_logs'].append(dict(log_id=f'HL-{i:03d}-{day+1:02d}',patient_id=pid,record_date=str(dt),
                systolic_mmhg=sbp,diastolic_mmhg=dbp,pulse_bpm=pulse,capture_status=capture,
                recorded_by_type=recorder,note='模拟记录，尚未经过临床核实。',is_synthetic=True))
            sleep=round(rng.uniform(5.5,8.5),1);mood=rng.choice(['很好','一般','不太好'])
            wish=rng.choice(['愿意','暂时不需要','跳过']);note='今天想按自己的节奏安排生活。'
            if i==3 and day>=16:
                sleep=round(rng.uniform(4,5.5),1);mood='不太好';wish='愿意';note='最近睡得少，想找人聊聊。'
            if i==6: mood='很好';wish='暂时不需要';note='我喜欢安静独处，不希望自动把记录发给家人。'
            if rng.random()<.05: sleep=None
            if rng.random()<.05: mood='跳过'
            tables['wellbeing_logs'].append(dict(wellbeing_id=f'WB-{i:03d}-{day+1:02d}',patient_id=pid,record_date=str(dt),
                sleep_hours=sleep,mood_response=mood,wants_to_talk=wish,self_report_note=note,is_synthetic=True))
        recent=[x for x in tables['health_logs'] if x['patient_id']==pid][-7:]
        bps=[r['systolic_mmhg'] for r in recent if r['systolic_mmhg'] is not None]
        means=f'所记录收缩压的平均值为{statistics.mean(bps):.1f}毫米汞柱。' if bps else '没有可计算的收缩压记录。'
        sleep=[x['sleep_hours'] for x in tables['wellbeing_logs'] if x['patient_id']==pid][-7:]
        valid_sleep=[x for x in sleep if x is not None]
        sleep_text=f'有{len(valid_sleep)}天填写睡眠时长，均值为{statistics.mean(valid_sleep):.1f}小时。' if valid_sleep else '睡眠时长未填写。'
        intake=f'【完全模拟病历】\n姓名：{p["display_name"]}；编号：{pid}；年龄：{p["age_years"]}岁。\n{history}过敏情况：{p["allergy_status"]}。\n居住情况：{p["living_arrangement"]}；支持对象：{p["support_person"]}。\n关注事项：整理既往资料、记录日常健康情况、准备复诊时想问的问题。\n药物名称和剂量没有提供，不应根据本记录补写处方。分享偏好：{p["sharing_preference"]}。'
        concern='本人表示最近睡得少，希望找人交流。' if i==3 else '请先询问本人希望讨论什么，不根据记录直接作出诊断。'
        follow=f'【完全模拟病历】\n随访日期：2026-08-30；编号：{pid}。\n8月24日至30日共有{len(bps)}天有血压记录，{7-len(bps)}天未获得读数。{means}\n{sleep_text}\n{concern}\n待确认：测量方式、未记录的原因、目前正在使用的药物。\n本记录没有新增诊断或调药决定，空白信息保持未知。'
        for n,(dt,kind,txt) in enumerate([('2026-08-01','建档记录',intake),('2026-08-30','随访记录',follow)],1):
            tables['medical_records'].append(dict(record_id=f'REC-{i:03d}-{n}',patient_id=pid,record_date=dt,record_type=kind,
                source_label='中文教学模拟文本',record_text=txt,text_status='confirmed_demo',is_synthetic=True))
        chat_context='记录中提到您最近睡得少，希望找人交流。' if i==3 else '记录建议在复诊前补充您想咨询的问题。'
        answer=f'根据8月30日的随访记录，最近7天有{len(bps)}天记录了血压。{means}{chat_context}您希望先看哪一部分？'
        for n,(role,msg) in enumerate([('user','帮我看一下最近的健康记录。'),('assistant',answer)],1):
            tables['chat_messages'].append(dict(message_id=f'MSG-{i:03d}-{n}',conversation_id=f'CONV-{i:03d}',patient_id=pid,
                sent_at=f'2026-08-31T10:00:0{n}+08:00',role=role,content=msg,
                source_record_id=f'REC-{i:03d}-2' if role=='assistant' else None,is_synthetic=True))
        if i in [1,3,6]:
            examples.append(dict(patient_id=pid,period_start='2026-08-24',period_end='2026-08-30',
                draft_text=f'本周有{len(bps)}天记录血压，{7-len(bps)}天没有读数。{means}{sleep_text}{concern}\n复诊前想问：这些记录还需要补充哪些信息？',
                source_record_ids=[f'REC-{i:03d}-2'],status='draft_needs_user_confirmation',is_synthetic=True))
    return tables,examples


if __name__=='__main__':
    (OUT/'sample_pdfs').mkdir(parents=True,exist_ok=True)
    tables,examples=build()
    dump(OUT/'dataset.json',{'metadata':{'is_synthetic':True,'seed':SEED,'language':'zh-CN','timezone':'Asia/Shanghai',
        'purpose':'问答智能体、健康记录、病历收纳、复诊小结、关怀记录教学原型','method':'人为教学假设和固定随机种子，未由真实人群数据拟合'},'tables':tables})
    for name,rows in tables.items():
        with (OUT/f'{name}.csv').open('w',encoding='utf-8-sig',newline='') as f:
            w=csv.DictWriter(f,fieldnames=list(rows[0]),lineterminator='\n');w.writeheader();w.writerows(rows)
    dump(OUT/'visit_summary_examples.json',examples)
    pdfs(tables)
    print(json.dumps({k:len(v) for k,v in tables.items()},ensure_ascii=False))
