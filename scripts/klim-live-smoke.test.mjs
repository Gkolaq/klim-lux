import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {once} from 'node:events';
import {auditSite} from './klim-live-smoke.mjs';

async function fixture(mutator) {
  const server = createServer((req, res) => {
    const path = req.url;
    if (path === '/admin/') { res.writeHead(401).end('Unauthorized'); return; }
    if (path === '/be/') { res.writeHead(301, {location: '/ru/'}).end(); return; }
    if (path === '/robots.txt') { res.writeHead(200).end('User-agent: *\nDisallow: /admin/\nSitemap: http://127.0.0.1:PORT/sitemap.xml'); return; }
    if (path === '/sitemap.xml') { res.writeHead(200).end('<urlset><url><loc>http://127.0.0.1:PORT/pl/</loc></url><url><loc>http://127.0.0.1:PORT/ru/</loc></url><url><loc>http://127.0.0.1:PORT/en/</loc></url></urlset>'); return; }
    const lang = /^\/(pl|ru|en)\/$/.exec(path)?.[1];
    if (lang) { res.writeHead(200).end(`<html lang="${lang}"><head><link rel="canonical" href="http://127.0.0.1:PORT/${lang}/"></head><body>ready</body></html>`); return; }
    res.writeHead(404).end('no');
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const origin = `http://127.0.0.1:${server.address().port}`;
  const fetchImpl = async (url, init) => fetch(url, init).then(async r => {
    // override text() only for the fixture placeholder without modifying prod code
    const text = await r.text();
    return {status: r.status, headers: r.headers, text: async () => text.replaceAll('127.0.0.1:PORT', `127.0.0.1:${server.address().port}`)};
  });
  try { return await mutator(origin, fetchImpl); } finally { server.close(); }
}

test('all checks pass on healthy local fixture', async () => {
  await fixture(async (url, fetchImpl) => {
    const r = await auditSite(url, fetchImpl);
    assert.equal(r.passed, r.total, JSON.stringify(r.checks.filter(x=>x.status!=='PASS')));
    assert.ok(r.total >= 12);
  });
});

test('bad canonical is reported as a failure', async () => {
  await fixture(async (url, fetchImpl) => {
    const broken = async (target, init) => {
      const r = await fetchImpl(target, init);
      if (target.endsWith('/pl/')) return {...r, text: async () => (await r.text()).replace('/pl/"', '/wrong/"')};
      return r;
    };
    const report = await auditSite(url, broken);
    assert.ok(report.checks.some(x => x.id === 'pl.canonical' && x.status === 'FAIL'));
  });
});
