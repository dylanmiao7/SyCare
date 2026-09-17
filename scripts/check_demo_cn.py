"""Check the three CSV tables and the sample PDF."""
from pathlib import Path
from collections import Counter
import csv
import subprocess

root=Path(__file__).resolve().parents[1]/'data'/'demo_cn'
def read(name):
    with (root/name).open(encoding='utf-8-sig',newline='') as file:
        return list(csv.DictReader(file))

people=read('patients.csv')
daily=read('daily_checkins.csv')
notes=read('medical_records.csv')
ids={r['patient_id'] for r in people}
assert len(people)==12 and len(ids)==12
assert len(daily)==360 and len(notes)==24
assert set(Counter(r['patient_id'] for r in daily).values())=={30}
assert set(Counter(r['patient_id'] for r in notes).values())=={2}
assert len({(r['patient_id'],r['record_date']) for r in daily})==360
for row in daily:
    assert row['patient_id'] in ids
    pair=[row['systolic_mmhg'],row['diastolic_mmhg'],row['pulse_bpm']]
    if row['capture_status']=='recorded':
        assert all(pair) and int(pair[0])>int(pair[1])>0
    else:
        assert not any(pair)
for row in notes: assert row['patient_id'] in ids
text=subprocess.check_output(['pdftotext',str(root/'sample_pdfs'/'SYN-003_模拟病历.pdf'),'-'],text=True)
clean=''.join(text.split())
for row in notes:
    if row['patient_id']=='SYN-003': assert ''.join(row['record_text'].split()) in clean
print('PASS: 12档案、360条每日记录、24条病历；关联、缺失值与PDF内容一致。')
