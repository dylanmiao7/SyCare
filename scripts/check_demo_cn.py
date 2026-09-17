"""Check saved Chinese fixtures. Requires pdftotext for the PDF text checks."""
from pathlib import Path
import csv
import json
import subprocess
from collections import Counter
root=Path(__file__).resolve().parents[1]/'data'/'demo_cn'
tables=json.loads((root/'dataset.json').read_text())['tables']
people={r['patient_id']:r for r in tables['patients']}
records={r['record_id']:r for r in tables['medical_records']}
assert len(people)==12
for name,rows in tables.items():
    key=next(iter(rows[0]));assert len({r[key] for r in rows})==len(rows)
    for r in rows: assert r['is_synthetic'] is True and r['patient_id'] in people
    with (root/f'{name}.csv').open(encoding='utf-8-sig',newline='') as f: saved=list(csv.DictReader(f))
    assert saved==[{k:'' if v is None else str(v) for k,v in r.items()} for r in rows]
for name in ['health_logs','wellbeing_logs']:
    assert set(Counter(r['patient_id'] for r in tables[name]).values())=={30}
    assert len({(r['patient_id'],r['record_date']) for r in tables[name]})==360
for r in tables['health_logs']:
    if r['capture_status']=='recorded': assert r['systolic_mmhg']>r['diastolic_mmhg']>0 and r['pulse_bpm']>0
    else: assert r['systolic_mmhg'] is r['diastolic_mmhg'] is r['pulse_bpm'] is None
for r in tables['chat_messages']:
    if r['source_record_id']: assert records[r['source_record_id']]['patient_id']==r['patient_id']
for r in json.loads((root/'visit_summary_examples.json').read_text()):
    assert all(records[s]['patient_id']==r['patient_id'] for s in r['source_record_ids'])
for pid in ['SYN-001','SYN-003','SYN-006']:
    text=subprocess.check_output(['pdftotext',str(root/'sample_pdfs'/f'{pid}_模拟病历.pdf'),'-'],text=True)
    text=''.join(text.split())
    for r in records.values():
        if r['patient_id']==pid: assert ''.join(r['record_text'].split()) in text
report={'status':'passed','row_counts':{k:len(v) for k,v in tables.items()},'scope':'数据、关联关系、CSV/JSON一致性及PDF正文检查；不代表应用或医学效果已验证。'}
(root/'VALIDATION_REPORT.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n')
print(json.dumps(report,ensure_ascii=False,indent=2))
