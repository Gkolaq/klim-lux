#!/usr/bin/env python3
"""Bounded read-only PL/RU/EN checks using currently published work links."""
import argparse
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone
from html.parser import HTMLParser
import json
from pathlib import Path
import re
import subprocess
from urllib.parse import urljoin, urlsplit

ORIGIN = 'https://www.klim-lux.com'
LOCALES = ('pl', 'ru', 'en')
ROUTES = tuple(path for locale in LOCALES for path in (f'/{locale}/', f'/{locale}/contacts/')) + ('/api/health/',)
BODY_LIMIT = 1024 * 1024


class Page(HTMLParser):
    def __init__(self):
        super().__init__()
        self.lang = ''; self.canonical = []; self.h1 = 0; self.ids = set()
        self.contact_mode = None; self.contact_fields = set(); self.in_contact = False
        self.work_links = []; self.robots = []

    def handle_starttag(self, tag, attributes):
        attrs = dict(attributes)
        if attrs.get('id'): self.ids.add(attrs['id'])
        if tag == 'html': self.lang = attrs.get('lang', '')
        if tag == 'h1': self.h1 += 1
        if tag == 'link' and 'canonical' in attrs.get('rel', '').split():
            self.canonical.append(attrs.get('href', ''))
        if tag == 'meta' and attrs.get('name', '').lower() == 'robots':
            self.robots.extend(re.split(r'[\s,]+', attrs.get('content', '').lower()))
        if tag == 'a':
            try:
                target = urlsplit(urljoin(ORIGIN + '/', attrs.get('href', '')))
                if (target.scheme == 'https' and target.netloc == urlsplit(ORIGIN).netloc
                        and not target.query and not target.fragment
                        and re.fullmatch(r'/(?:pl|ru|en)/portfolio/[0-9]+/', target.path)):
                    self.work_links.append(target.path)
            except ValueError:
                pass
        if tag == 'form' and attrs.get('id') == 'contact-form':
            self.in_contact = True; self.contact_mode = attrs.get('data-delivery')
        if self.in_contact and tag in ('input', 'textarea') and 'required' in attrs:
            self.contact_fields.add(attrs.get('name', ''))

    def handle_endtag(self, tag):
        if tag == 'form': self.in_contact = False


def check_response(path, status, final_url, body):
    issues = []
    if status != 200: issues.append('http_not_200')
    if final_url != ORIGIN + path: issues.append('unexpected_redirect')
    if path == '/api/health/':
        try:
            health = json.loads(body)
            if not isinstance(health, dict) or health.get('status') != 'ok':
                issues.append('health_not_ok')
            checks = health.get('checks') if isinstance(health, dict) else None
            if not isinstance(checks, dict) or checks.get('content') is not True or checks.get('files') is not True:
                issues.append('storage_unhealthy')
        except (ValueError, UnicodeError):
            issues.append('invalid_health_json')
    else:
        page = Page(); page.feed(body.decode('utf-8', errors='replace'))
        if page.lang != path.split('/')[1]: issues.append('html_language')
        if page.canonical != [ORIGIN + path]: issues.append('canonical_mismatch')
        if page.h1 != 1: issues.append('h1_count')
        if 'noindex' in page.robots or 'none' in page.robots: issues.append('unexpected_noindex')
        if 'mobile-nav' not in page.ids: issues.append('mobile_navigation_missing')
        if '/contacts/' in path:
            if page.contact_mode != 'server': issues.append('contact_not_server')
            if not {'name', 'contact', 'message'} <= page.contact_fields:
                issues.append('required_contact_fields_missing')
        if re.fullmatch(r'/(?:pl|ru|en)/portfolio/[0-9]+/', path) and not {'photo-viewer', 'open-photo-viewer'} <= page.ids:
            issues.append('photo_controls_missing')
    result = {'path': path, 'status': status, 'ok': not issues, 'issues': issues}
    if path in tuple(f'/{locale}/' for locale in LOCALES):
        result['visible_work'] = next((link for link in page.work_links if link.startswith(path + 'portfolio/')), None)
    return result


def probe(path):
    url = ORIGIN + path
    try:
        response = subprocess.run(['curl', '--silent', '--show-error', '--location', '--max-redirs', '3',
                                   '--proto', '=https', '--proto-redir', '=https', '--max-time', '20',
                                   '--max-filesize', str(BODY_LIMIT), '--user-agent', 'KlimLux-owner-release-check/2.0',
                                   '--write-out', '\n%{http_code}\n%{url_effective}', url],
                                  capture_output=True, timeout=25, check=False)
        if response.returncode:
            issue = 'response_too_large' if response.returncode == 63 else 'request_failed'
            return {'path': path, 'status': 0, 'ok': False, 'issues': [issue], 'client_exit': response.returncode}
        body, raw_status, final_url = response.stdout.rsplit(b'\n', 2)
        if len(body) > BODY_LIMIT:
            return {'path': path, 'status': int(raw_status), 'ok': False, 'issues': ['response_too_large']}
        return check_response(path, int(raw_status), final_url.decode('utf-8'), body)
    except Exception as error:
        return {'path': path, 'status': 0, 'ok': False, 'issues': ['request_failed'], 'error': type(error).__name__}


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--output', help='Optional JSON result path; response bodies are never saved.')
    args = parser.parse_args(argv)
    with ThreadPoolExecutor(max_workers=3) as pool:
        results = list(pool.map(probe, ROUTES))
        work_routes = []
        skipped = []
        for locale in LOCALES:
            home = next(item for item in results if item['path'] == f'/{locale}/')
            candidate = home.get('visible_work')
            if home['ok'] and candidate and re.fullmatch(rf'/{locale}/portfolio/[0-9]+/', candidate):
                work_routes.append(candidate)
            else:
                skipped.append({'locale': locale, 'check': 'work', 'reason': 'home_failed' if not home['ok'] else 'no_visible_work_link_on_home'})
        results.extend(pool.map(probe, work_routes))
    report = {'checked_at': datetime.now(timezone.utc).isoformat(), 'origin': ORIGIN,
              'ok': all(result['ok'] for result in results), 'checks': results,
              'requests': len(results), 'skipped': skipped, 'locales': list(LOCALES),
              'scope': '7–10 HTTP GETs; PL/RU/EN home, contacts, visible work; no browser, email or version-provenance verification'}
    if args.output:
        output = Path(args.output); output.parent.mkdir(parents=True, exist_ok=True)
        output.write_text(json.dumps(report, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    print(json.dumps(report, ensure_ascii=False))
    return 0 if report['ok'] else 1


if __name__ == '__main__':
    raise SystemExit(main())
