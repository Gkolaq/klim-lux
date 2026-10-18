#!/usr/bin/env python3
"""Read-only production audit. Stdlib only; no login, writes or browser claims."""
import argparse
import concurrent.futures as futures
from collections import Counter, defaultdict
from datetime import datetime, timezone
from html.parser import HTMLParser
import json
from pathlib import Path
import re
import time
from urllib.error import HTTPError
from urllib.parse import urljoin, urlsplit
from urllib.request import Request, urlopen
import xml.etree.ElementTree as ET

ORIGIN = 'https://www.klim-lux.com'
AUTHORED_ARTICLES = json.loads((Path(__file__).resolve().parents[1] / 'src/data/authored-articles.json').read_text())
UA = 'KlimLux-Owner-Audit/1.0'
NS = {'s': 'http://www.sitemaps.org/schemas/sitemap/0.9', 'x': 'http://www.w3.org/1999/xhtml', 'i': 'http://www.google.com/schemas/sitemap-image/1.1'}

def request(url, method='GET'):
    for attempt in range(2):
        try:
            started = time.monotonic()
            with urlopen(Request(url, method=method, headers={'User-Agent': UA}), timeout=15) as response:
                body = response.read(2_000_000) if method == 'GET' else b''
                return {'status': response.status, 'final_url': response.url, 'headers': dict(response.headers), 'body': body, 'elapsed_ms': round((time.monotonic()-started)*1000)}
        except HTTPError as e:
            result = {'status': e.code, 'final_url': e.url, 'headers': dict(e.headers), 'body': e.read(400_000), 'elapsed_ms': None}
            if e.code < 500 or attempt: return result
        except Exception as e:
            if attempt: return {'status': 0, 'final_url': url, 'headers': {}, 'body': b'', 'error': type(e).__name__, 'elapsed_ms': None}
    return result

class Page(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.title = ''; self.in_title = False; self.h1 = 0; self.description = ''; self.robots = ''; self.lang = ''
        self.canonical = []; self.hreflang = {}; self.links = set(); self.assets = set(); self.alt_missing = 0; self.size_missing = 0
        self.ld = []; self.in_ld = False; self.ld_text = ''; self.skip_text = 0; self.words = []; self.analytics = False
    def handle_starttag(self, tag, attributes):
        a = dict(attributes)
        if tag == 'title': self.in_title = True
        if tag == 'h1': self.h1 += 1
        if tag == 'html': self.lang = a.get('lang','')
        if tag == 'meta':
            if a.get('name') == 'description': self.description = a.get('content','')
            if a.get('name') == 'robots': self.robots = a.get('content','')
        if tag == 'link':
            if a.get('rel') == 'canonical': self.canonical.append(a.get('href',''))
            if a.get('rel') == 'alternate' and a.get('hreflang'): self.hreflang[a['hreflang']] = a.get('href','')
            if a.get('rel') in ('stylesheet','preload','icon','apple-touch-icon') and a.get('href'): self.assets.add(a['href'])
        if tag == 'a' and a.get('href'): self.links.add(a['href'])
        if tag in ('img','source'):
            if a.get('src'): self.assets.add(a['src'])
            for part in a.get('srcset','').split(','):
                if part.strip(): self.assets.add(part.strip().split()[0])
            if tag == 'img':
                self.alt_missing += 'alt' not in a
                self.size_missing += not (a.get('width') and a.get('height'))
        if tag == 'script':
            self.skip_text += 1
            if a.get('src'): self.assets.add(a['src'])
            if a.get('type') == 'application/ld+json': self.in_ld = True; self.ld_text = ''
            if 'googletagmanager' in a.get('src',''): self.analytics = True
        if tag == 'style': self.skip_text += 1
    def handle_endtag(self, tag):
        if tag == 'title': self.in_title = False
        if tag == 'script' and self.in_ld:
            try: self.ld.append(json.loads(self.ld_text))
            except ValueError: self.ld.append(None)
            self.in_ld = False
        if tag in ('style','script'): self.skip_text = max(0,self.skip_text-1)
    def handle_data(self, data):
        if self.in_title: self.title += data
        if self.in_ld: self.ld_text += data
        if not self.skip_text: self.words.extend(re.findall(r'\w+',data))

def page_audit(url):
    r = request(url); p = Page(); p.feed(r['body'].decode('utf-8','replace'))
    headers = {k.lower():v for k,v in r['headers'].items()}; issues = []
    if r['status'] != 200: issues.append('http_not_200')
    if r['final_url'] != url: issues.append('unexpected_redirect')
    if p.canonical != [url]: issues.append('canonical_mismatch')
    if 'noindex' in p.robots.lower() or 'noindex' in headers.get('x-robots-tag','').lower(): issues.append('noindex_in_sitemap')
    if not p.title: issues.append('missing_title')
    if not p.description: issues.append('missing_description')
    if p.h1 != 1: issues.append('h1_count')
    if p.lang != urlsplit(url).path.split('/')[1]: issues.append('html_language')
    expected_hreflang = {'pl-PL','ru','en','x-default'}
    if set(p.hreflang) != expected_hreflang: issues.append('hreflang_missing')
    if p.alt_missing: issues.append('missing_alt')
    if p.size_missing: issues.append('missing_image_dimensions')
    if not p.ld or None in p.ld: issues.append('invalid_structured_data')
    for name in ('x-content-type-options','content-security-policy','referrer-policy'):
        if not headers.get(name): issues.append('missing_'+name)
    return {'url':url,'status':r['status'],'final_url':r['final_url'],'bytes':len(r['body']),'elapsed_ms':r['elapsed_ms'],'title':p.title,'description':p.description,'h1':p.h1,'lang':p.lang,'canonical':p.canonical,'hreflang':p.hreflang,'word_count':len(p.words),'missing_alt':p.alt_missing,'missing_image_dimensions':p.size_missing,'issues':issues,'links':sorted(p.links),'assets':sorted(p.assets),'analytics_tag_detected':p.analytics}

def main():
    parser = argparse.ArgumentParser(); parser.add_argument('--output',required=True); parser.add_argument('--full',action='store_true'); parser.add_argument('--sample',type=int,default=100); parser.add_argument('--workers',type=int,default=4)
    args = parser.parse_args(); workers = max(1,min(args.workers,6)); started = datetime.now(timezone.utc)
    sitemap = request(ORIGIN+'/sitemap.xml'); root = ET.fromstring(sitemap['body'])
    nodes = root.findall('s:url',NS); urls = [n.findtext('s:loc',namespaces=NS) for n in nodes]
    if not urls or len(set(urls)) != len(urls) or any(not u.startswith(ORIGIN+'/') or urlsplit(u).query for u in urls): raise RuntimeError('Invalid sitemap URL inventory')
    main_urls = [u for u in urls if '/portfolio/' not in u or u.endswith('/portfolio/')]
    photos = [u for u in urls if u not in main_urls]; rotation = started.isocalendar().week * 4 % max(1,len(photos))
    selected = urls if args.full else main_urls + (photos[rotation:]+photos[:rotation])[:max(0,args.sample-len(main_urls))]
    pages=[]
    with futures.ThreadPoolExecutor(max_workers=workers) as pool:
        for page in pool.map(page_audit,selected):
            pages.append(page)
            if len(pages)%100==0: print(json.dumps({'progress':'pages','done':len(pages),'total':len(selected)}),flush=True)
    inventory = set(urls); broken_links = []; all_assets = set(); external = set(); errors = Counter(); titles = defaultdict(list); descriptions = defaultdict(list)
    by_url = {p['url']:p for p in pages}
    for p in pages:
        errors.update(p['issues']); titles[p['title']].append(p['url']); descriptions[p['description']].append(p['url'])
        for language, target in p['hreflang'].items():
            if language != 'x-default' and target not in inventory: errors['hreflang_outside_sitemap'] += 1
            elif language != 'x-default' and target in by_url and p['url'] not in by_url[target]['hreflang'].values(): errors['hreflang_not_reciprocal'] += 1
        for href in p['links']:
            target = urljoin(p['url'],href); parts = urlsplit(target)
            if parts.scheme not in ('http','https'): continue
            if parts.netloc != urlsplit(ORIGIN).netloc: external.add(target); continue
            if parts.path.startswith(('/language/','/admin/','/signin-with-chatgpt','/library-files/','/media/','/images/','/brand/')): continue
            clean = ORIGIN+parts.path
            if clean != ORIGIN+'/' and clean not in inventory: broken_links.append({'from':p['url'],'to':clean})
        all_assets.update(urljoin(p['url'],a) for a in p['assets'] if urlsplit(urljoin(p['url'],a)).netloc == urlsplit(ORIGIN).netloc)
    def asset_audit(url):
        r = request(url,'HEAD'); h = {k.lower():v for k,v in r['headers'].items()}
        return {'url':url,'status':r['status'],'bytes':int(h.get('content-length','0')),'content_type':h.get('content-type','')}
    assets=[]
    with futures.ThreadPoolExecutor(max_workers=workers) as pool:
        for asset in pool.map(asset_audit,sorted(all_assets)):
            assets.append(asset)
            if len(assets)%100==0: print(json.dumps({'progress':'assets','done':len(assets),'total':len(all_assets)}),flush=True)
    probes=[]
    for path,expected in [('/robots.txt',200),('/api/health/',200),('/api/content/',401),('/api/history/',401),('/api/library-upload/',[404,405]),('/.git/config',404),('/.env',404),('/pl/does-not-exist/',404)]:
        r=request(ORIGIN+path); probes.append({'path':path,'expected':expected,'status':r['status'],'matches':r['status'] in expected if isinstance(expected,list) else r['status']==expected,'body':r['body'].decode('utf-8','replace')[:600] if path in ('/robots.txt','/api/health/') else None})
    failures = [a for a in assets if a['status'] != 200]
    report = {'schema_version':1,'checked_at':started.isoformat(),'origin':ORIGIN,'mode':'full' if args.full else 'rotating_sample','sitemap':{'status':sitemap['status'],'bytes':len(sitemap['body']),'urls':len(urls),'images':len(root.findall('.//i:image',NS)),'alternates':len(root.findall('.//x:link',NS))},'summary':{'audited_pages':len(pages),'http_statuses':dict(Counter(p['status'] for p in pages)),'issue_counts':dict(errors),'broken_internal_links':len(broken_links),'assets_checked':len(assets),'asset_failures':len(failures),'probe_failures':sum(not p['matches'] for p in probes),'duplicate_titles_groups':sum(len(v)>1 for v in titles.values()),'duplicate_description_groups':sum(len(v)>1 for v in descriptions.values()),'html_bytes_max':max(p['bytes'] for p in pages)},'probes':probes,'broken_internal_links':broken_links,'asset_failures':failures,'assets':assets,'external_source_links':sorted(external),'duplicate_titles':{k:v for k,v in titles.items() if len(v)>1},'duplicate_descriptions':{k:v for k,v in descriptions.items() if len(v)>1},'pages':pages,'limitations':['No browser visual or keyboard interaction test.','Elapsed HTTP timings are diagnostic observations, not Core Web Vitals.','Public crawl does not prove search engine indexing.','No messages sent and no third-party book files downloaded.']}
    out=Path(args.output);out.parent.mkdir(parents=True,exist_ok=True);out.write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n')
    print(json.dumps({'output':str(out.resolve()),'checked_at':report['checked_at'],'sitemap':report['sitemap'],'summary':report['summary'],'probes':probes},ensure_ascii=False))

if __name__ == '__main__': main()
