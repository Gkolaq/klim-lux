import {test} from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {build} from 'esbuild';

const compiled = await build({entryPoints: ['src/scripts/contact.ts'], bundle: true, write: false, format: 'cjs', platform: 'node'});
const context = {module: {exports: {}}, Event, AbortSignal};
vm.runInNewContext(compiled.outputFiles[0].text, context);
const {installContactForm} = context.module.exports;

class Element {
  constructor(value = '') { this.value = value; this.listeners = {}; this.attributes = new Set(['hidden']); }
  addEventListener(type, callback) { (this.listeners[type] ??= []).push(callback); }
  async emit(type) { for (const callback of this.listeners[type] ?? []) await callback({preventDefault() {}}); }
  setAttribute(name) { this.attributes.add(name); }
  removeAttribute(name) { this.attributes.delete(name); }
  setCustomValidity(value) { this.validationMessage = value; }
}

function fixture(delivery = 'server') {
  const copy = {invalidName: 'name', invalidContact: 'contact', invalidMessage: 'message', greeting: 'Hello', namePrefix: 'Name', contactPrefix: 'Contact', saved: 'Saved, not sent', sending: 'Sending', error: 'Unconfirmed', limited: 'Limited', accepted: 'Accepted', acceptedEdited: 'Previous accepted, edits not sent'};
  const form = new Element();
  form.dataset = {delivery, locale: 'ru', email: 'business@example.test', copy: JSON.stringify(copy)};
  const fields = {name: new Element('Test visitor'), contact: new Element('visitor@example.test'), message: new Element('Please discuss this test chair.'), website: new Element()};
  const submit = new Element(), status = new Element(), draft = new Element(), draftLabel = new Element(), copyButton = new Element();
  form.elements = {namedItem: name => fields[name]};
  form.querySelector = () => submit;
  form.reportValidity = () => Object.values(fields).every(field => !field.validationMessage);
  const events = [];
  const doc = {querySelector: selector => selector === '#contact-form' ? form : draft,
    getElementById: id => ({'form-status': status, 'email-draft': draftLabel, 'copy-message': copyButton}[id]),
    dispatchEvent(event) { events.push(event.type); }};
  const requests = []; let behavior = 'accept', ids = 0, navigations = 0;
  const location = {};
  Object.defineProperty(location, 'href', {set() {navigations++;}});
  const win = {location, crypto: {randomUUID: () => 'request-' + ++ids}, navigator: {clipboard: {writeText: async () => {}}},
    fetch: async (url, options) => {
      requests.push({url, body: JSON.parse(options.body)});
      if (behavior === 'network') throw Error('Synthetic outage');
      return {ok: behavior === 'accept' || behavior === 'invalid', status: behavior === 'limited' ? 429 : behavior === 'reject' ? 502 : 200,
        json: async () => behavior === 'accept' ? {ok: true, status: 'accepted'} : behavior === 'invalid' ? {status: 'accepted'} : {error: 'unconfirmed'}};
    }};
  installContactForm(doc, win);
  return {form, fields, doc, win, status, draft, draftLabel, copyButton, submit, requests, events, setBehavior: value => {behavior = value;}, navigations: () => navigations};
}

test('unavailable form preserves a copy without navigation or a false sending confirmation', async () => {
  const f = fixture('draft');
  await f.form.emit('submit');
  assert.equal(f.navigations(), 0);
  assert.equal(f.requests.length, 0);
  assert.equal(f.status.textContent, 'Saved, not sent');
  assert.ok(f.draft.value.includes(f.fields.message.value));
  assert.equal(f.draftLabel.attributes.has('hidden'), false);
  assert.deepEqual(f.events, ['klim:email-draft-prepared']);
});

test('empty and invalid required fields preserve entered text without a request or lead event', async () => {
  for (const values of [
    {name: '', contact: '', message: '', invalid: 'name'},
    {name: 'Test interfejsu', contact: '', message: '', invalid: 'contact'},
    {name: '  ', contact: 'visitor@example.test', message: 'A valid message.', invalid: 'name'},
    {name: 'Visitor', contact: 'invalid', message: 'A valid message.', invalid: 'contact'},
    {name: 'Visitor', contact: '+48 733 272 681', message: 'short', invalid: 'message'},
  ]) {
    const f = fixture();
    for (const name of ['name', 'contact', 'message']) f.fields[name].value = values[name];
    await f.form.emit('input');
    await f.form.emit('submit');
    assert.equal(f.fields[values.invalid].validationMessage, values.invalid);
    for (const name of ['name', 'contact', 'message']) assert.equal(f.fields[name].value, values[name]);
    assert.equal(f.requests.length, 0);
    assert.deepEqual(f.events, []);
    assert.equal(f.navigations(), 0);
    assert.equal(f.submit.disabled, false);
  }
});

test('sending failures retain the message and retries reuse the request identifier; success and duplicate submit are distinct', async () => {
  const f = fixture();
  installContactForm(f.doc, f.win);
  assert.equal(f.form.listeners.submit.length, 1);
  f.setBehavior('reject');
  await f.form.emit('submit');
  assert.equal(f.status.textContent, 'Unconfirmed');
  assert.equal(f.draftLabel.attributes.has('hidden'), false);
  assert.equal(f.fields.message.value, 'Please discuss this test chair.');
  assert.deepEqual(f.events, [], 'a rejected request is never a lead');
  f.setBehavior('accept');
  await f.form.emit('submit');
  assert.equal(f.requests[0].url, '/api/contact/');
  assert.deepEqual(f.requests[0].body, f.requests[1].body);
  assert.equal(f.status.textContent, 'Accepted');
  assert.equal(f.draftLabel.attributes.has('hidden'), true);
  assert.equal(f.submit.disabled, false);
  await f.form.emit('submit');
  assert.equal(f.requests.length, 2);
  await f.form.emit('input');
  await f.form.emit('submit');
  assert.equal(f.requests.length, 2, 'an input event without a changed payload cannot resend an accepted message');
  assert.deepEqual(f.events, ['klim:contact-accepted'], 'a repeated submit does not count another lead');
  f.fields.message.value += ' A revised request.';
  await f.form.emit('input');
  await f.form.emit('submit');
  assert.notEqual(f.requests[1].body.requestId, f.requests[2].body.requestId);
  assert.deepEqual(f.events, ['klim:contact-accepted', 'klim:contact-accepted']);
  assert.equal(f.navigations(), 0);
});

test('editing during an in-flight request preserves the unsent edits and permits a new submission', async () => {
  const f = fixture();
  let finish;
  f.win.fetch = (url, options) => {
    f.requests.push({url, body: JSON.parse(options.body)});
    return new Promise(resolve => { finish = () => resolve({ok: true, status: 200, json: async () => ({ok: true, status: 'accepted'})}); });
  };
  const pending = f.form.emit('submit');
  const original = f.requests[0].body.message;
  f.fields.message.value += ' A change while sending.';
  await f.form.emit('input');
  await f.form.emit('submit');
  assert.equal(f.requests.length, 1, 'a concurrent click is ignored');
  finish(); await pending;
  assert.equal(f.status.textContent, 'Previous accepted, edits not sent');
  assert.notEqual(f.fields.message.value, original);
  const changed = f.form.emit('submit');
  assert.equal(f.requests.length, 2, 'the edited message can still be sent');
  assert.notEqual(f.requests[0].body.requestId, f.requests[1].body.requestId);
  assert.equal(f.requests[1].body.message, f.fields.message.value);
  finish(); await changed;
  assert.equal(f.status.textContent, 'Accepted');
  assert.equal(f.events.length, 2);
});

test('rate limits, transport errors and incomplete acknowledgements never appear as success', async () => {
  for (const behavior of ['limited', 'network', 'invalid']) {
    const f = fixture(); f.setBehavior(behavior);
    await f.form.emit('submit');
    assert.equal(f.status.textContent, behavior === 'limited' ? 'Limited' : 'Unconfirmed');
    assert.equal(f.submit.disabled, false);
    assert.equal(f.draftLabel.attributes.has('hidden'), false);
    assert.equal(f.navigations(), 0);
    assert.deepEqual(f.events, [], 'failures never produce a lead event');
  }
  const invalid = fixture(); invalid.fields.contact.value = 'invalid';
  await invalid.form.emit('submit');
  assert.equal(invalid.requests.length, 0);
});
