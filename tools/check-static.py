"""Validate generated pages without browser or third-party dependencies."""
from html.parser import HTMLParser
from pathlib import Path
from urllib.parse import urlsplit, unquote
import json
ROOT=Path(__file__).resolve().parents[1]/'public'
class Page(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True);self.ids=[];self.links=[];self.h1=0;self.canonical=False;self.ld=False;self.buf='';self.teams=0
    def handle_starttag(self,tag,attrs):
        a=dict(attrs)
        if 'id' in a:self.ids.append(a['id'])
        if tag=='h1':self.h1+=1
        if tag=='link' and a.get('rel')=='canonical':self.canonical=True
        if tag=='script' and a.get('type')=='application/ld+json':self.ld=True;self.buf=''
        if 'team-card' in a.get('class','').split():self.teams+=1
        for key in ('src','href'):
            if a.get(key):self.links.append(a[key])
    def handle_data(self,data):
        if self.ld:self.buf+=data
    def handle_endtag(self,tag):
        if tag=='script' and self.ld:json.loads(self.buf);self.ld=False
errors=[];pages=list(ROOT.rglob('*.html'))
for p in pages:
    doc=Page();doc.feed(p.read_text())
    if doc.h1!=1:errors.append(f'{p}: H1 count {doc.h1}')
    if not doc.canonical:errors.append(f'{p}: missing canonical')
    if len(doc.ids)!=len(set(doc.ids)):errors.append(f'{p}: duplicate IDs')
    for link in doc.links:
        u=urlsplit(link)
        if u.scheme or u.netloc or not u.path:continue
        q=ROOT/unquote(u.path.lstrip('/')) if u.path.startswith('/') else p.parent/unquote(u.path)
        if q.is_dir():q=q/'index.html'
        if not q.exists():errors.append(f'{p}: missing {u.path}')
    if p==ROOT/'about/index.html' and doc.teams!=5:errors.append('About must have five team cards')
assert not errors,'\n'.join(errors)
print(f'PASS: {len(pages)} pages; local assets/links, unique IDs, H1s, canonical URLs, JSON-LD and five team cards')
