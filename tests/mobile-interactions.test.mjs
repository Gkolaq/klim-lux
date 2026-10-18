import {test} from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {build} from 'esbuild';

const [navigation, photos] = await Promise.all(['navigation', 'photo-viewer'].map(async name =>
  (await build({entryPoints: [`src/scripts/${name}.ts`], bundle: true, write: false, format: 'iife'})).outputFiles[0].text));

class Target {
  listeners = new Map();
  addEventListener(type, callback) {
    const callbacks = this.listeners.get(type) ?? [];
    callbacks.push(callback); this.listeners.set(type, callbacks);
  }
  emit(type, props = {}) {
    const event = {target: this, defaultPrevented: false, preventDefault() {this.defaultPrevented = true;}, ...props};
    for (const callback of this.listeners.get(type) ?? []) callback(event);
    return event;
  }
}
class Element extends Target {
  attributes = new Map(); children = []; focusCount = 0; clicks = 0;
  setAttribute(name, value) {this.attributes.set(name, value);}
  getAttribute(name) {return this.attributes.get(name);}
  focus() {this.focusCount++;}
  contains(node) {return node === this || this.children.some(child => child.contains(node));}
  closest(selector) {return selector === 'a' && this.tag === 'a' ? this : null;}
  matches(selector) {return selector.split(',').includes(this.tag);}
  click() {this.clicks++; this.emit('click', {button: 0});}
}

function navigationFixture() {
  const button = new Element(), menu = new Element(), link = new Element(), outside = new Element();
  menu.hidden = true; link.tag = 'a'; menu.children.push(link);
  button.setAttribute('aria-expanded', 'false');
  const doc = new Target(), win = new Target(); win.innerWidth = 390; win.innerHeight = 844;
  doc.querySelector = () => button; doc.getElementById = () => menu;
  vm.runInNewContext(navigation, {document: doc, window: win, Node: Element, Element});
  return {button, menu, link, outside, doc, win};
}

function photoFixture({hash = '', dialogSupport = true} = {}) {
  const doc = new Target(), win = new Target(), trigger = new Element(), close = new Element();
  const image = {src: '', dataset: {fullSrc: '/images/originals/test.jpg'}}, queued = [];
  const viewer = new Element(), stage = new Element(), next = new Element(), previous = new Element();
  const classes = new Set(); viewer.open = false;
  doc.documentElement = {classList: {add: value => classes.add(value), remove: value => classes.delete(value)}};
  if (dialogSupport) viewer.showModal = () => {viewer.open = true;};
  viewer.close = () => {if (viewer.open) {viewer.open = false; queued.push(() => viewer.emit('close'));}};
  viewer.querySelector = selector => selector === 'img[data-full-src]' ? image : selector.includes('next') ? next : previous;
  stage.querySelector = selector => selector.includes('next') ? next : previous;
  doc.getElementById = id => ({'photo-viewer': viewer, 'open-photo-viewer': trigger, 'close-photo-viewer': close}[id]);
  doc.querySelector = () => stage;
  let current = new URL('https://www.klim-lux.com/pl/portfolio/303/?from=test' + hash), index = 1;
  const entries = [{url: new URL('https://www.klim-lux.com/pl/portfolio/'), state: null}, {url: new URL(current), state: {retained: 7}}];
  const location = {};
  for (const key of ['pathname', 'search', 'hash', 'href']) Object.defineProperty(location, key, {get: () => current[key]});
  const history = {
    get state() {return entries[index].state;}, get length() {return entries.length;},
    pushState(state, _, url) {entries.splice(index + 1); entries.push({url: new URL(url, current), state}); index++; current = new URL(entries[index].url);},
    replaceState(state, _, url) {entries[index] = {url: new URL(url, current), state}; current = new URL(entries[index].url);},
    go(delta) {
      const position = index + delta; if (position < 0 || position >= entries.length) return;
      const old = current; index = position; current = new URL(entries[index].url);
      // Fragment history navigation fires hashchange; push/replaceState do not.
      if (old.pathname === current.pathname && old.search === current.search && old.hash !== current.hash)
        queued.push(() => win.emit('hashchange'));
    },
    back() {this.go(-1);}, forward() {this.go(1);},
  };
  const flush = () => {let count = 0; while (queued.length) {assert.ok(++count < 50, 'history must settle'); queued.shift()();}};
  vm.runInNewContext(photos, {document: doc, window: win, location, history, HTMLElement: Element});
  return {doc, win, trigger, close, viewer, image, next, previous, classes, location, history, flush};
}

test('mobile menu stays open when only viewport height changes', () => {
  const f = navigationFixture(); f.button.click();
  f.win.innerHeight = 600; f.win.emit('resize');
  assert.equal(f.menu.hidden, false); assert.equal(f.button.getAttribute('aria-expanded'), 'true');
});

test('mobile menu closes when viewport width changes', () => {
  const f = navigationFixture(); f.button.click();
  f.win.innerWidth = 844; f.win.emit('resize');
  assert.equal(f.menu.hidden, true); assert.equal(f.button.getAttribute('aria-expanded'), 'false');
});

test('menu closes on Escape, outside tap and link activation', () => {
  const f = navigationFixture(); f.button.click();
  f.doc.emit('keydown', {key: 'Escape'}); assert.equal(f.menu.hidden, true); assert.equal(f.button.focusCount, 1);
  f.button.click(); f.doc.emit('pointerdown', {target: f.menu}); assert.equal(f.menu.hidden, false);
  f.doc.emit('pointerdown', {target: f.outside}); assert.equal(f.menu.hidden, true);
  f.button.click(); f.menu.emit('click', {target: f.link}); assert.equal(f.menu.hidden, true);
});

test('Back closes an enlarged photo while keeping the same project page and query', () => {
  const f = photoFixture(); f.trigger.click();
  assert.equal(f.viewer.open, true); assert.equal(f.image.src, '/images/originals/test.jpg');
  assert.equal(f.classes.has('viewer-open'), true);
  f.history.back(); f.flush();
  assert.equal(f.location.pathname, '/pl/portfolio/303/'); assert.equal(f.location.search, '?from=test');
  assert.equal(f.location.hash, ''); assert.equal(f.viewer.open, false);
  assert.equal(f.classes.has('viewer-open'), false); assert.equal(f.trigger.focusCount, 1);
});

test('closing a photo and reopening it does not accumulate duplicate history entries', () => {
  const f = photoFixture(); f.trigger.click(); assert.equal(f.history.state.retained, 7);
  f.close.click(); f.flush();
  assert.equal(f.location.hash, ''); assert.equal(f.history.state.retained, 7);
  f.trigger.click(); assert.equal(f.history.length, 3);
  f.history.back(); f.flush(); assert.equal(f.viewer.open, false);
});

test('Forward reopens a photo and closing it returns to the previous page state', () => {
  const f = photoFixture(); f.trigger.click(); f.history.back(); f.flush();
  f.history.forward(); f.flush(); assert.equal(f.viewer.open, true);
  f.close.click(); f.flush(); assert.equal(f.location.hash, ''); assert.equal(f.viewer.open, false);
  f.history.forward(); f.flush(); assert.equal(f.viewer.open, true, 'closing should retain the viewer history entry');
});

test('closing a direct #viewer URL keeps the current project and existing history state', () => {
  const f = photoFixture({hash: '#viewer'}); assert.equal(f.viewer.open, true);
  f.close.click(); f.flush();
  assert.equal(f.location.pathname, '/pl/portfolio/303/'); assert.equal(f.location.hash, '');
  assert.equal(f.history.state.retained, 7); assert.equal(f.history.length, 2);
});

test('modified clicks and missing dialog support keep the original image link usable', () => {
  const f = photoFixture(); const event = f.trigger.emit('click', {button: 0, ctrlKey: true});
  assert.equal(event.defaultPrevented, false); assert.equal(f.viewer.open, false); assert.equal(f.history.length, 2);
  const fallback = photoFixture({dialogSupport: false});
  assert.equal(fallback.trigger.emit('click', {button: 0}).defaultPrevented, false);
});

test('photo arrow keys work in the viewer but leave typing controls alone', () => {
  const f = photoFixture(); f.trigger.click();
  f.doc.emit('keydown', {key: 'ArrowRight'}); assert.equal(f.next.clicks, 1);
  const input = new Element(); input.tag = 'input';
  f.doc.emit('keydown', {key: 'ArrowRight', target: input}); assert.equal(f.next.clicks, 1);
  f.doc.emit('keydown', {key: 'ArrowLeft'}); assert.equal(f.previous.clicks, 1);
});
