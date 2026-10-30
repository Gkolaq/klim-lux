/**
 * KLIM-LUX read-only HTTP smoke test. No authentication, mutation or external email.
 * Node 20+. Usage: node klim-live-smoke.mjs [https://www.klim-lux.com]
 * Exit code 1 means at least one test failed; 2 means the checker itself failed.
 */
const DEFAULT_BASE = 'https://www.klim-lux.com';

export async function auditSite(base = DEFAULT_BASE, fetchImpl = fetch) {
  const url = new URL(base);
  if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password) {
    throw new Error('Expected an ordinary HTTP(S) origin without credentials');
  }
  const origin = url.origin;
  const checks = [];
  const add = (id, passed, details = '') => checks.push({id, status: passed ? 'PASS' : 'FAIL', details});
  const request = async (path, follow = true) => {
    const response = await fetchImpl(origin + path, {
      method: 'GET', redirect: follow ? 'follow' : 'manual',
      headers: {'Accept': 'text/html, application/xml, text/plain;q=0.9'},
      signal: AbortSignal.timeout(12000),
    });
    const text = await response.text();
    return {response, text};
  };
  const locales = ['pl', 'ru', 'en'];
  for (const lang of locales) {
    try {
      const {response, text} = await request(`/${lang}/`);
      add(`${lang}.http200`, response.status === 200, `HTTP ${response.status}`);
      const canonical = text.match(/<link\b(?=[^>]*\brel\s*=\s*["']canonical["'])(?=[^>]*\bhref\s*=\s*["']([^"']+)["'])[^>]*>/i)?.[1]
        ?? text.match(/<link\b(?=[^>]*\bhref\s*=\s*["']([^"']+)["'])(?=[^>]*\brel\s*=\s*["']canonical["'])[^>]*>/i)?.[1];
      add(`${lang}.canonical`, canonical === `${origin}/${lang}/`, canonical ?? 'missing canonical');
      const tagLang = text.match(/<html\b[^>]*\blang\s*=\s*["']([^"']+)["']/i)?.[1];
      add(`${lang}.html-lang`, tagLang === lang || tagLang?.startsWith(lang + '-'), tagLang ?? 'missing lang');
    } catch (e) { add(`${lang}.request`, false, String(e)); }
  }
  // Customer conversion gate: read-only GET, never submit, save or disclose customer data.
  for (const lang of locales) {
    try {
      const {response, text} = await request(`/${lang}/contacts/`);
      add(`${lang}.contact.http200`, response.status === 200, `HTTP ${response.status}`);
      const formOpen = [...text.matchAll(/<form\b[^>]*>/gi)]
        .map(m => m[0])
        .find(tag => /\bid\s*=\s*[\"']contact-form[\"']/i.test(tag));
      add(`${lang}.contact.form`, !!formOpen, 'Client enquiry form exists');
      const mode = formOpen?.match(/\bdata-delivery\s*=\s*[\"']([^\"']+)[\"']/i)?.[1];
      add(`${lang}.contact.server-mode`, mode === 'server', `Mode ${mode ?? 'missing'}`);
      const formHtml = formOpen && text.slice(text.indexOf(formOpen), text.indexOf('</form>', text.indexOf(formOpen)) + 7);
      const required = ['name', 'contact', 'message'];
      const allFields = !!formHtml && required.every(field => new RegExp(`\\bname\\s*=\\s*[\"']${field}[\"']`, 'i').test(formHtml));
      add(`${lang}.contact.fields`, allFields, 'Required name/contact/message fields present');
    } catch (e) { add(`${lang}.contact.request`, false, String(e)); }
  }
  try {
    const {response, text} = await request('/robots.txt');
    add('robots.http200', response.status === 200, `HTTP ${response.status}`);
    add('robots.sitemap', /^Sitemap:\s*https?:\/\/\S+\/sitemap\.xml\s*$/im.test(text), 'Sitemap directive present');
    add('robots.admin', /^Disallow:\s*\/admin\/\s*$/im.test(text), 'Admin excluded');
  } catch (e) { add('robots.request', false, String(e)); }
  try {
    const {response, text} = await request('/sitemap.xml');
    const urls = [...text.matchAll(/<loc>\s*([^<]+)\s*<\/loc>/gi)].map(x => x[1].trim());
    add('sitemap.http200', response.status === 200, `HTTP ${response.status}`);
    add('sitemap.locations', urls.length >= 3, `Found ${urls.length} <loc> URLs`);
    add('sitemap.languages', ['pl', 'ru', 'en'].every(lang => urls.includes(`${origin}/${lang}/`)), 'PL/RU/EN home URLs present');
  } catch (e) { add('sitemap.request', false, String(e)); }
  try {
    const {response} = await request('/admin/', false);
    add('admin.unauthorized', response.status === 401 || response.status === 403, `HTTP ${response.status}`);
  } catch (e) { add('admin.request', false, String(e)); }
  try {
    const {response} = await request('/be/', false);
    const location = response.headers.get('location');
    add('be.redirect', [301, 302, 307, 308].includes(response.status) && !!location && new URL(location, origin).pathname === '/ru/', `HTTP ${response.status} → ${location ?? 'none'}`);
  } catch (e) { add('be.request', false, String(e)); }
  return {checkedAt: new Date().toISOString(), origin, passed: checks.filter(x => x.status === 'PASS').length, total: checks.length, checks};
}

if (process.argv[1]?.endsWith('klim-live-smoke.mjs')) {
  auditSite(process.argv[2]).then(report => {
    console.log(JSON.stringify(report, null, 2));
    if (report.passed !== report.total) process.exitCode = 1;
  }).catch(e => { console.error(`checker error: ${e.message}`); process.exitCode = 2; });
}
