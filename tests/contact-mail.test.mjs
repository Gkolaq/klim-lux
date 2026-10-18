import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {mkdtemp, readdir, readFile, rm} from 'node:fs/promises';
import {join, resolve} from 'node:path';
import {tmpdir} from 'node:os';
import {randomUUID} from 'node:crypto';

const require = createRequire(import.meta.url);
const wranglerRequire = createRequire(require.resolve('wrangler/package.json'));
const {Miniflare, convertV4MiniflareOptions} = wranglerRequire('miniflare');
const {build} = wranglerRequire('esbuild');
const mfRequire = createRequire(wranglerRequire.resolve('miniflare'));
const {Response: NetworkResponse} = mfRequire('undici');
const origin = 'https://www.klim-lux.com';
const syntheticKey = 're_contact_test_fixture_never_real';

test('contact Worker: configuration gate, safe fallback, validation, private credentials, idempotency and atomic quotas', async () => {
  const state = await mkdtemp(join(tmpdir(), 'klim-contact-test-'));
  const root = resolve('dist/server');
  const modules = [{type: 'ESModule', path: join(root, 'index.js')}, ...(await readdir(root, {recursive: true})).filter(file => /\.m?js$/.test(file) && file !== 'index.js').map(file => ({type: 'ESModule', path: join(root, file)}))];
  const requests = [], delivered = new Map();
  let behavior = 'accept';
  const outboundService = async request => {
    assert.equal(request.url, 'https://api.resend.com/emails', 'only a mocked email endpoint is permitted');
    assert.equal(request.method, 'POST');
    const data = await request.json();
    const key = request.headers.get('Idempotency-Key');
    requests.push({data, key, authorization: request.headers.get('Authorization')});
    if (behavior === 'network') throw new Error('Synthetic upstream failure');
    if (behavior === 'reject') return new NetworkResponse(JSON.stringify({error: 'Synthetic private provider error'}), {status: 429});
    if (behavior === 'invalid') return new NetworkResponse('{}', {status: 200});
    if (!delivered.has(key)) delivered.set(key, 'mock-email-' + delivered.size);
    return new NetworkResponse(JSON.stringify({id: delivered.get(key)}), {status: 200});
  };
  const options = enabled => convertV4MiniflareOptions({
    name: 'klim-contact-tests', modules, modulesRoot: root,
    compatibilityDate: '2026-10-01', compatibilityFlags: ['nodejs_compat'],
    d1Databases: {DB: 'contact-test-db'}, r2Buckets: {BUCKET: 'contact-test-files'}, resourcePersistencePath: state,
    bindings: enabled ? {RESEND_API_KEY: syntheticKey, RESEND_FROM: 'site@mail.klim-lux.com', CONTACT_EMAIL_ENABLED: 'true'} : {},
    assets: {directory: resolve('dist/client'), binding: 'ASSETS', routerConfig: {has_user_worker: true, invoke_user_worker_ahead_of_assets: true}},
    cf: false, logRequests: false, outboundService,
  });
  let mf = new Miniflare(options(false));
  const body = overrides => ({name: 'Test Visitor', contact: 'visitor@example.test', message: 'Please discuss this test chair. <script>literal text</script>', locale: 'pl', requestId: randomUUID(), website: '', ...overrides});
  const post = (data = body(), headers = {}, hostname = origin) => mf.dispatchFetch(hostname + '/api/contact/', {method: 'POST', headers: {Origin: hostname, 'Content-Type': 'application/json', 'CF-Connecting-IP': '192.0.2.10', ...headers}, body: typeof data === 'string' ? data : JSON.stringify(data)});
  try {
    let db = await mf.getD1Database('DB');
    for (const file of (await readdir('drizzle')).filter(file => file.endsWith('.sql')).sort()) {
      await db.batch((await readFile(join('drizzle', file), 'utf8')).split('--> statement-breakpoint').map(sql => sql.trim()).filter(Boolean).map(sql => db.prepare(sql)));
    }
    for (const locale of ['pl', 'ru', 'en']) {
      const html = await (await mf.dispatchFetch(origin + '/' + locale + '/contacts/')).text();
      assert.match(html, /data-delivery="draft"/);
      assert.ok(!html.includes(syntheticKey));
    }
    const off = await post(); assert.equal(off.status, 503); assert.equal((await off.json()).error, 'mail_unavailable');
    assert.equal(requests.length, 0);
    assert.equal(await db.prepare("SELECT name FROM sqlite_master WHERE name='contact_rate_limits'").first(), null, 'disabled email does not mutate the database');
    await mf.dispose(); mf = new Miniflare(options(true)); db = await mf.getD1Database('DB');
    for (const locale of ['pl', 'ru', 'en']) {
      const html = await (await mf.dispatchFetch(origin + '/' + locale + '/contacts/')).text();
      assert.match(html, /data-delivery="server"/);
      assert.ok(!html.includes(syntheticKey), 'the secret never enters public HTML');
      assert.match(html, /name="website"[^>]*hidden/);
    }
    const alternate = await (await mf.dispatchFetch('https://klim-lux.xelogen9999.chatgpt.site/pl/contacts/')).text(); assert.match(alternate, /data-delivery="server"/);
    assert.equal((await post(body(), {}, 'https://unrelated.example')).status, 503);
    const get = await mf.dispatchFetch(origin + '/api/contact/'); assert.equal(get.status, 405); assert.equal(get.headers.get('Allow'), 'POST');
    assert.equal((await post(body(), {Origin: 'https://unrelated.example'})).status, 403);
    assert.equal((await post(body(), {'Sec-Fetch-Site': 'cross-site'})).status, 403);
    assert.equal((await post(body(), {'Content-Type': 'text/plain'})).status, 415);
    assert.equal((await post('invalid json')).status, 400);
    assert.equal((await post('a'.repeat(20001))).status, 413);
    for (const invalid of [{website: 'spam'}, {contact: 'invalid'}, {message: 'short'}, {name: 'Header\r\nInjection'}, {to: 'someone-else@example.test'}, {locale: 'be'}]) assert.equal((await post(body(invalid))).status, 400);
    assert.equal(requests.length, 0, 'invalid submissions never contact the provider');
    const submission = body();
    const ok = await post(submission); assert.equal(ok.status, 200); assert.deepEqual(await ok.json(), {ok: true, status: 'accepted'});
    assert.match(ok.headers.get('X-Robots-Tag'), /noindex/); assert.match(ok.headers.get('Cache-Control'), /no-store/);
    const message = requests[0];
    assert.equal(message.authorization, 'Bearer ' + syntheticKey);
    assert.equal(message.data.from, 'Klim & Co <site@mail.klim-lux.com>');
    assert.deepEqual(message.data.to, ['Xelogen9999@gmail.com']);
    assert.equal(message.data.reply_to, submission.contact);
    assert.equal(message.data.html, undefined); assert.ok(message.data.text.includes('<script>literal text</script>'));
    assert.ok(!JSON.stringify(message.data).includes('192.0.2.10'));
    assert.match(message.key, /^klim-contact\/[a-f0-9-]{36}\/[a-f0-9]{64}$/);
    assert.equal((await post(submission)).status, 200);
    assert.equal(requests[1].key, message.key); assert.equal(delivered.size, 1, 'a replay has the same provider idempotency key');
    behavior = 'reject'; const denied = await post(body(), {'CF-Connecting-IP': '192.0.2.11'}); assert.equal(denied.status, 502); assert.equal((await denied.json()).error, 'mail_not_confirmed');
    behavior = 'invalid'; assert.equal((await post(body(), {'CF-Connecting-IP': '192.0.2.12'})).status, 502);
    // Miniflare turns a service-binding exception into an upstream HTTP failure.
    behavior = 'network'; assert.equal((await post(body(), {'CF-Connecting-IP': '192.0.2.13'})).status, 502);
    const compiled = await build({entryPoints: ['src/server/contact-mail.ts'], bundle: true, platform: 'node', format: 'esm', write: false});
    const {submitContact} = await import('data:text/javascript;base64,' + Buffer.from(compiled.outputFiles[0].contents).toString('base64'));
    const failedTransport = await submitContact(new Request(origin + '/api/contact/', {method: 'POST', headers: {Origin: origin, 'Content-Type': 'application/json', 'CF-Connecting-IP': '192.0.2.14'}, body: JSON.stringify(body())}), {DB: db, RESEND_API_KEY: syntheticKey, RESEND_FROM: 'site@mail.klim-lux.com', CONTACT_EMAIL_ENABLED: 'true'}, async () => { throw new Error('Synthetic connection error'); });
    assert.equal(failedTransport.status, 503); assert.equal((await failedTransport.json()).error, 'mail_not_confirmed');
    behavior = 'accept';
    const concurrent = await Promise.all(Array.from({length: 6}, () => post(body(), {'CF-Connecting-IP': '192.0.2.20'})));
    assert.deepEqual(concurrent.map(response => response.status).sort(), [200, 200, 200, 200, 200, 429]);
    const visitorRetry = Number(concurrent.find(response => response.status === 429).headers.get('Retry-After'));
    assert.ok(visitorRetry > 0 && visitorRetry <= 600);
    await db.prepare("UPDATE contact_rate_limits SET count=74 WHERE id LIKE 'day:%'").run();
    const last = await Promise.all([post(body(), {'CF-Connecting-IP': '192.0.2.30'}), post(body(), {'CF-Connecting-IP': '192.0.2.31'})]);
    assert.deepEqual(last.map(response => response.status).sort(), [200, 429]);
    const dailyRetry = Number(last.find(response => response.status === 429).headers.get('Retry-After'));
    assert.ok(dailyRetry > 0 && dailyRetry <= 86400);
    assert.equal((await db.prepare("SELECT count FROM contact_rate_limits WHERE id LIKE 'day:%'").first()).count, 75);
    const rateRows = JSON.stringify((await db.prepare('SELECT * FROM contact_rate_limits').all()).results);
    for (const privateValue of ['192.0.2.', submission.name, submission.contact, submission.message, syntheticKey]) assert.ok(!rateRows.includes(privateValue));
    assert.equal((await db.prepare('SELECT COUNT(*) AS count FROM site_content').first()).count, 0, 'contact delivery never edits CMS contents');
  } finally { await mf.dispose(); await rm(state, {recursive: true, force: true}); }
});
