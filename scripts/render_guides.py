"""Render the two Chinese Markdown guides as printable PDFs (reportlab)."""
from pathlib import Path
import re
from xml.sax.saxutils import escape
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.pdfbase.cidfonts import UnicodeCIDFont
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.pagesizes import A4
from reportlab.lib import colors
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, PageBreak, Table, TableStyle, Flowable

ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'output'/'pdf'
OUT.mkdir(parents=True,exist_ok=True)
f='/System/Library/Fonts/STHeiti Light.ttc'
if Path(f).exists():
    pdfmetrics.registerFont(TTFont('GuideCN',f,subfontIndex=0));FONT='GuideCN'
else:
    pdfmetrics.registerFont(UnicodeCIDFont('STSong-Light'));FONT='STSong-Light'
INK=colors.HexColor('#163b48');TEAL=colors.HexColor('#146c7b');MUTED=colors.HexColor('#61747b')
WIDTH=A4[0]-88
body=ParagraphStyle('Body',fontName=FONT,fontSize=9.6,leading=15,spaceAfter=7,wordWrap='CJK')
styles={
 'body':body,
 'h1':ParagraphStyle('H1',parent=body,fontSize=22,leading=30,spaceAfter=15,textColor=INK),
 'h2':ParagraphStyle('H2',parent=body,fontSize=13.5,leading=21,spaceBefore=10,spaceAfter=9,textColor=TEAL,keepWithNext=True),
 'h3':ParagraphStyle('H3',parent=body,fontSize=11,leading=17,spaceBefore=7,spaceAfter=7,textColor=INK,keepWithNext=True),
 'cell':ParagraphStyle('Cell',parent=body,fontSize=8.3,leading=12.7,spaceAfter=0),
 'head':ParagraphStyle('Head',parent=body,fontSize=8.5,leading=13,textColor=colors.white,spaceAfter=0),
 'code':ParagraphStyle('Code',parent=body,fontSize=8.2,leading=13,backColor=colors.HexColor('#f0f5f6'),borderPadding=10,spaceBefore=8,spaceAfter=12),
}


def inline(txt):
    parts=[];last=0
    for m in re.finditer(r'\[([^\]]+)\]\((https?://[^)]+)\)',txt):
        parts.append(escape(txt[last:m.start()]));parts.append(f'<link href="{escape(m.group(2))}" color="#146c7b">{escape(m.group(1))}</link>');last=m.end()
    parts.append(escape(txt[last:]));txt=''.join(parts)
    txt=re.sub(r'\*\*(.+?)\*\*',r'<b>\1</b>',txt)
    txt=re.sub(r'`([^`]+)`',r'<font color="#145c70">\1</font>',txt)
    return txt


class Roadmap(Flowable):
    def __init__(self): Flowable.__init__(self);self.width=WIDTH;self.height=455
    def draw(self):
        c=self.canv
        stages=[('明确用户与场景',1),('注册、克隆与环境',2),('数据库与访问权限',2),('中文首页与健康记录',3),('病历上传与收纳',2),
            ('睡眠、心情与交流需求',1.5),('复诊准备小结',2),('老人问答智能体',3),('联调、权限与错误测试',2),('部署演示、观察与修正',1.5)]
        cumulative=0
        for i,(title,hours) in enumerate(stages):
            y=self.height-39-i*45;cumulative+=hours
            c.setFillColor(colors.HexColor('#eaf3f5') if i not in [7,9] else colors.HexColor('#d5ebeb'))
            c.roundRect(0,y,self.width,36,6,fill=1,stroke=0)
            c.setFillColor(TEAL);c.setFont(FONT,11);c.drawString(12,y+12,f'{i+1:02d}')
            c.setFillColor(INK);c.setFont(FONT,10.5);c.drawString(46,y+12,title)
            c.setFont(FONT,9);c.drawRightString(self.width-13,y+12,f'{hours:g}小时  /  累计{cumulative:g}小时')
            if i<9:
                x=self.width/2;c.setStrokeColor(TEAL);c.setLineWidth(.8);c.line(x,y-1,x,y-8)
                c.line(x,y-8,x-2.5,y-5);c.line(x,y-8,x+2.5,y-5)


class AgentFlow(Flowable):
    def __init__(self): Flowable.__init__(self);self.width=WIDTH;self.height=196
    def draw(self):
        c=self.canv
        nodes=['老人提出问题','后端验证身份及老人访问权限','按问题读取：本人记录 / 固定说明 / 一般信息','DeepSeek组织回答，后端核对来源与敏感行动','显示简短中文回答、日期与可点击来源']
        for i,title in enumerate(nodes):
            y=self.height-32-i*39
            c.setFillColor(colors.HexColor('#eaf3f5'));c.roundRect(0,y,self.width,30,5,fill=1,stroke=0)
            c.setFillColor(INK);c.setFont(FONT,10);c.drawCentredString(self.width/2,y+10,title)
            if i<4:
                x=self.width/2;c.setStrokeColor(TEAL);c.line(x,y-1,x,y-8);c.line(x,y-8,x-2,y-5);c.line(x,y-8,x+2,y-5)


def render(source,target):
    lines=source.read_text().splitlines();items=[];i=0;diagram=0
    while i<len(lines):
        line=lines[i].strip()
        if not line: i+=1;continue
        if line=='<!-- PAGEBREAK -->': items.append(PageBreak());i+=1;continue
        if line.startswith('```'):
            lang=line[3:];block=[];i+=1
            while i<len(lines) and not lines[i].startswith('```'): block.append(lines[i]);i+=1
            i+=1
            if lang=='mermaid':
                items.append(Roadmap() if diagram==0 else AgentFlow());diagram+=1;items.append(Spacer(1,7))
            else: items.append(Paragraph('<br/>'.join(escape(x) for x in block),styles['code']))
            continue
        if line.startswith('|'):
            rows=[]
            while i<len(lines) and lines[i].strip().startswith('|'):
                row=[x.strip() for x in lines[i].strip().strip('|').split('|')]
                if not all(re.fullmatch(r':?-+:?',x) for x in row): rows.append(row)
                i+=1
            n=len(rows[0])
            if n==4: widths=[82,31,225,WIDTH-338]
            elif n==3: widths=[100,210,WIDTH-310] if '平台' in rows[0][0] else [160,64,WIDTH-224]
            else: widths=[145,WIDTH-145]
            content=[[Paragraph(inline(cell),styles['head'] if j==0 else styles['cell']) for cell in row] for j,row in enumerate(rows)]
            table=Table(content,colWidths=widths,repeatRows=1,hAlign='LEFT')
            table.setStyle(TableStyle([('BACKGROUND',(0,0),(-1,0),INK),('VALIGN',(0,0),(-1,-1),'TOP'),
                ('ROWBACKGROUNDS',(0,1),(-1,-1),[colors.HexColor('#f2f6f7'),colors.white]),
                ('LEFTPADDING',(0,0),(-1,-1),7),('RIGHTPADDING',(0,0),(-1,-1),7),
                ('TOPPADDING',(0,0),(-1,-1),7),('BOTTOMPADDING',(0,0),(-1,-1),7)]))
            items += [table,Spacer(1,10)];continue
        if line.startswith('# '): items.append(Paragraph(inline(line[2:]),styles['h1']))
        elif line.startswith('## '): items.append(Paragraph(inline(line[3:]),styles['h2']))
        elif line.startswith('### '): items.append(Paragraph(inline(line[4:]),styles['h3']))
        else:
            if line.startswith('- [ ] '): line='□ '+line[6:]
            elif line.startswith('- '): line='• '+line[2:]
            items.append(Paragraph(inline(line),body))
        i+=1
    def footer(c,d):
        c.setFont(FONT,8);c.setFillColor(MUTED);c.drawString(44,25,'SyCare  /  2026-09-17');c.drawRightString(A4[0]-44,25,str(d.page))
    SimpleDocTemplate(str(target),pagesize=A4,leftMargin=44,rightMargin=44,topMargin=36,bottomMargin=42,
        title=source.stem,author='SyCare').build(items,onFirstPage=footer,onLaterPages=footer)
    print(target)


if __name__=='__main__':
    render(ROOT/'docs'/'01_20小时开发流程.md',OUT/'SyCare_20小时开发流程.pdf')
    render(ROOT/'docs'/'02_学生注册与协作手册.md',OUT/'SyCare_学生注册与协作手册.pdf')
