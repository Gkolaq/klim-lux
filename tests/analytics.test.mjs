import { test } from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { build } from 'esbuild';

async function moduleAt(entry) {
  const result = await build({ entryPoints: [entry], bundle: true, write: false, format: 'cjs', platform: 'node' });
  const context = { module: { exports: {} }, URL, Date };
  vm.runInNewContext(result.outputFiles[0].text, context);
  return context.module.exports;
}
const rules = await moduleAt('src/config/analytics.ts');
const { installAnalytics } = await moduleAt('src/scripts/analytics.ts');
const id = 'G-TEST123456';
const granted = () => JSON.stringify({ v: 1, choice: 'granted', at: Date.now() });

class Element {
  constructor(dataset = {}) { this.dataset = dataset; this.hidden = true; this.listeners = {}; }
  addEventListener(name, callback) { (this.listeners[name] ??= []).push(callback); }
  emit(name, event = {}) { for (const callback of this.listeners[name] ?? []) callback(event); }
  focus() { this.focused = true; }
}
function fixture({ saved = null, host = 'www.klim-lux.com', blockedStorage = false, panelExists = true } = {}) {
  const grant = new Element({ analyticsChoice: 'granted' });
  const deny = new Element({ analyticsChoice: 'denied' });
  const close = new Element();
  const settings = new Element();
  const panel = new Element({ measurementId: id });
  panel.querySelector = selector => selector === '[data-analytics-close]' ? close : deny;
  panel.querySelectorAll = () => [deny, grant];
  const doc = new Element();
  doc.querySelector = () => panelExists ? panel : null;
  doc.querySelectorAll = () => [settings];
  doc.documentElement = { lang: 'ru' };
  doc.referrer = 'https://referrer.example/private/person@example.com?auth=private-token#private';
  const scripts = [];
  doc.head = { append: script => scripts.push(script) };
  doc.createElement = () => ({});
  let cookie = '_ga=old; _ga_TEST123456=old; klim_locale=ru';
  const cookieWrites = [];
  Object.defineProperty(doc, 'cookie', { get: () => cookie, set: value => { cookieWrites.push(value); cookie = 'klim_locale=ru'; } });
  const storage = new Map(saved === null ? [] : [[rules.ANALYTICS_CONSENT_KEY, saved]]);
  const win = new Element();
  let reloads = 0;
  win.location = { hostname: host, href: `https://${host}/ru/contacts/?q=person@example.com#private-message`, pathname: '/ru/contacts/', reload: () => reloads++ };
  win.localStorage = {
    getItem: key => { if (blockedStorage) throw Error('storage blocked'); return storage.get(key) ?? null; },
    setItem: (key, value) => { if (blockedStorage) throw Error('storage blocked'); storage.set(key, value); },
  };
  const contact = href => doc.emit('click', { target: { closest: () => ({ getAttribute: () => href }) } });
  const events = () => Array.from(win.dataLayer ?? []).map(args => Array.from(args));
  return { doc, win, panel, grant, deny, close, settings, scripts, storage, cookieWrites, contact, events, reloads: () => reloads };
}

test('consent has a bounded lifetime; tracking is limited to the public primary host', () => {
  const now = Date.now();
  for (const raw of [null, 'bad-json', '{}', JSON.stringify({ v: 1, choice: 'granted', at: now + 1 }), JSON.stringify({ v: 1, choice: 'granted', at: now - 180 * 86400000 })]) assert.equal(rules.consentDecision(raw, now), null);
  assert.equal(rules.consentDecision(JSON.stringify({ v: 1, choice: 'denied', at: now }), now), 'denied');
  assert.equal(rules.publicAnalyticsId(id, 'www.klim-lux.com'), id);
  for (const host of ['klim-lux.com', 'klim-lux.xelogen9999.chatgpt.site', 'localhost']) assert.equal(rules.publicAnalyticsId(id, host), null);
  assert.equal(rules.publicAnalyticsId(id, 'www.klim-lux.com', true), null);
  assert.equal(rules.measurementId('G-x"><script>'), null);
  assert.equal(rules.analyticsLocation('https://www.klim-lux.com/ru/?email=private@example.com#message'), 'https://www.klim-lux.com/ru/');
  assert.ok(!rules.contentSecurityPolicy(false).includes('google'));
  assert.ok(rules.contentSecurityPolicy(true).includes('https://*.google-analytics.com'));
  assert.ok(!rules.contentSecurityPolicy(true).includes('doubleclick'));
});

test('no tag or events before consent, after rejection, on previews or without the consent UI', () => {
  for (const options of [{}, { saved: JSON.stringify({ v: 1, choice: 'denied', at: Date.now() }) }, { saved: 'invalid' }, { blockedStorage: true }]) {
    const f = fixture(options); installAnalytics(f.doc, f.win);
    f.contact('tel:+48733272681'); f.doc.emit('klim:email-draft-prepared'); f.doc.emit('klim:contact-accepted');
    assert.equal(f.scripts.length, 0); assert.equal(f.events().length, 0);
    f.deny.emit('click'); assert.equal(f.scripts.length, 0); assert.equal(f.panel.hidden, true);
    assert.equal(f.reloads(), 0); assert.ok(!f.cookieWrites.some(cookie => cookie.startsWith('klim_locale=')));
  }
  for (const options of [{ saved: granted(), host: 'klim-lux.xelogen9999.chatgpt.site' }, { saved: granted(), panelExists: false }]) {
    const f = fixture(options); installAnalytics(f.doc, f.win); assert.equal(f.scripts.length, 0);
  }
});

test('grant loads one tag and one page view; contact events never contain personal message data', () => {
  const f = fixture(); installAnalytics(f.doc, f.win); assert.equal(f.panel.hidden, false);
  f.grant.emit('click'); f.grant.emit('click'); installAnalytics(f.doc, f.win);
  assert.equal(f.scripts.length, 1); assert.equal(f.scripts[0].src, 'https://www.googletagmanager.com/gtag/js?id=' + id);
  const config = f.events().find(args => args[0] === 'config')[2];
  assert.equal(config.send_page_view, false); assert.equal(config.allow_google_signals, false); assert.equal(config.allow_ad_personalization_signals, false);
  assert.equal(config.page_referrer, 'https://referrer.example/'); assert.equal(config.cookie_expires, 180 * 86400);
  assert.equal(f.events().filter(args => args[0] === 'event' && args[1] === 'page_view').length, 1);
  f.contact('tel:+48733272681'); f.contact('mailto:private@example.com?body=personal-message');
  f.doc.emit('klim:email-draft-prepared', { detail: { name: 'private-name', message: 'personal-message' } });
  f.doc.emit('klim:contact-accepted', { detail: { contact: 'private@example.com', message: 'personal-message' } });
  assert.deepEqual(f.events().filter(args => args[0] === 'event').map(args => args[1]), ['page_view', 'click_phone', 'click_email', 'email_draft_prepared', 'generate_lead']);
  const payload = JSON.stringify(f.events());
  for (const privateValue of ['person@example.com', 'private@example.com', 'private-token', 'personal-message', 'private-name', '48733272681']) assert.ok(!payload.includes(privateValue), privateValue);
  f.settings.emit('click'); assert.equal(f.panel.hidden, false); assert.equal(f.close.hidden, false); assert.equal(f.deny.focused, true);
  f.deny.emit('click'); assert.equal(f.reloads(), 1); assert.equal(f.win['ga-disable-' + id], true);
  f.contact('tel:+48733272681'); assert.equal(f.events().length, 0, 'withdrawal clears the pending queue');
});

test('persisted consent starts tracking; cross-tab withdrawal disables it and reloads', () => {
  const f = fixture({ saved: granted() }); installAnalytics(f.doc, f.win);
  assert.equal(f.scripts.length, 1); assert.equal(f.panel.hidden, true);
  f.storage.set(rules.ANALYTICS_CONSENT_KEY, JSON.stringify({ v: 1, choice: 'denied', at: Date.now() }));
  f.win.emit('storage', { key: rules.ANALYTICS_CONSENT_KEY });
  assert.equal(f.reloads(), 1); assert.equal(f.win['ga-disable-' + id], true); assert.equal(f.events().length, 0);
});
