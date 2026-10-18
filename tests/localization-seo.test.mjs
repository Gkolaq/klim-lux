import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
const require = createRequire(import.meta.url), wranglerRequire = createRequire(require.resolve('wrangler/package.json'));
const { build } = wranglerRequire('esbuild');
const compiled = await build({ stdin: { contents: "export{DEFAULT_CONTENT}from'./src/data/content';export{contentSchema}from'./src/server/validation';export*from'./src/seo/pages';export{LOCALES}from'./src/i18n/locales';export{MESSAGES}from'./src/i18n/messages';", resolveDir: resolve('.'), loader: 'ts' }, bundle: true, platform: 'node', format: 'esm', write: false });
const { DEFAULT_CONTENT, contentSchema, changedPageUrls, withPageModifiedDates, LOCALES, MESSAGES } = await import('data:text/javascript;base64,' + Buffer.from(compiled.outputFiles[0].contents).toString('base64'));

test('legacy language backups preserve owner edits and gain a complete English edition', () => {
  const old = structuredClone(DEFAULT_CONTENT);
  old.translations.pl.home.title = 'Tekst właściciela';
  old.home.title = 'Сохранённый текст владельца';
  old.translations.be = structuredClone(old.translations.pl);
  old.translations.uk = structuredClone(old.translations.pl);
  delete old.translations.en;
  for (const book of old.library) { delete book.descriptions.en; book.descriptions.be = 'Старое описание'; book.descriptions.uk = 'Старое описание'; }
  const migrated = contentSchema.parse(old);
  assert.deepEqual(LOCALES, ['pl', 'ru', 'en']);
  assert.deepEqual(Object.keys(migrated.translations).sort(), ['en', 'pl']);
  assert.equal(migrated.translations.pl.home.title, 'Tekst właściciela');
  assert.equal(migrated.home.title, 'Сохранённый текст владельца');
  assert.equal(Object.keys(migrated.translations.en.works).length, 299);
  assert.ok(migrated.library.every(book => book.descriptions.en.length > 30));
  assert.deepEqual(contentSchema.parse(migrated), migrated);
  const unrelated = structuredClone(migrated); unrelated.translations.de = {};
  assert.equal(contentSchema.safeParse(unrelated).success, false, 'migration does not silently discard unrelated fields');
});

test('English UI and captions are complete; original publication titles remain source metadata', () => {
  const keys = value => Object.keys(value).sort();
  for (const section of ['ui', 'contact', 'analytics', 'library']) {
    assert.deepEqual(keys(MESSAGES.en[section]), keys(MESSAGES.ru[section]), section);
  }
  for (const text of Object.values(DEFAULT_CONTENT.translations.en.works)) {
    assert.ok(text.title);
    assert.ok(!/[А-Яа-яЁёІіЇїЄєЎў]/.test(text.title + text.description), 'archive captions are translated');
  }
});

test('page modification dates and notifications follow actual localized content changes', () => {
  const before = structuredClone(DEFAULT_CONTENT), edited = structuredClone(before);
  edited.translations.pl.works['301'].description = 'Nowy, rzeczywisty opis realizacji.';
  const urls = changedPageUrls(before, edited);
  assert.ok(urls.includes('https://www.klim-lux.com/pl/portfolio/301/'));
  assert.ok(urls.every(url => url.startsWith('https://www.klim-lux.com/pl/')), 'a Polish caption cannot modify Russian or English pages');
  const at = '2026-10-15T10:00:00.000Z', marked = withPageModifiedDates(before, edited, at);
  assert.equal(marked.seoUpdatedAt['https://www.klim-lux.com/pl/portfolio/301/'], at);
  assert.equal(marked.seoUpdatedAt['https://www.klim-lux.com/en/portfolio/301/'], undefined);
  assert.deepEqual(changedPageUrls(marked, structuredClone(marked)), []);
  assert.deepEqual(withPageModifiedDates(marked, structuredClone(marked), '2026-10-16T10:00:00.000Z').seoUpdatedAt, marked.seoUpdatedAt, 'no-op saves do not falsify lastmod');
});

test('related service copy updates only the pages that render it', () => {
  const before = structuredClone(DEFAULT_CONTENT), edited = structuredClone(before);
  const service = edited.translations.pl.services.find(item => item.slug === 'upholstery');
  service.title = 'Tapicerowanie — tekst właściciela';
  service.lead = 'Indywidualny opis usługi właściciela.';
  const urls = changedPageUrls(before, edited);
  const changedServices = urls.filter(url => /\/services\/[^/]+\/$/.test(url)).sort();
  assert.deepEqual(changedServices, ['covers', 'restoration', 'upholstery'].map(slug => 'https://www.klim-lux.com/pl/services/' + slug + '/').sort());
  assert.ok(urls.every(url => url.startsWith('https://www.klim-lux.com/pl/')), 'related copy stays in its language');
  const at = '2026-10-17T07:00:00.000Z', marked = withPageModifiedDates(before, edited, at);
  for (const url of changedServices) assert.equal(marked.seoUpdatedAt[url], at, 'rendered related copy receives a modification date');
  const bodyOnly = structuredClone(before);
  bodyOnly.translations.pl.services.find(item => item.slug === 'upholstery').body += '\nSzczegóły wyłącznie tej usługi.';
  assert.deepEqual(changedPageUrls(before, bodyOnly).filter(url => /\/services\/[^/]+\/$/.test(url)), ['https://www.klim-lux.com/pl/services/upholstery/'], 'body text is not rendered in related links');
});

