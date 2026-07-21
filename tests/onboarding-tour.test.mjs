import test from 'node:test';
import assert from 'node:assert/strict';

import {
  ONBOARDING_KEYS,
  computeTourCardPosition,
  hasCompletedOnboarding,
  markOnboardingComplete,
  startOnboardingTour,
} from '../src/shared/onboarding-tour.js';

class MemoryStorage {
  constructor({ throws = false } = {}) {
    this.values = new Map();
    this.throws = throws;
  }
  getItem(key) {
    if (this.throws) throw new Error('storage unavailable');
    return this.values.get(key) ?? null;
  }
  setItem(key, value) {
    if (this.throws) throw new Error('storage unavailable');
    this.values.set(key, String(value));
  }
}

class FakeClassList {
  constructor() { this.values = new Set(); }
  add(...names) { names.forEach(name => this.values.add(name)); }
  remove(...names) { names.forEach(name => this.values.delete(name)); }
  contains(name) { return this.values.has(name); }
}

class FakeElement extends EventTarget {
  constructor(tagName, ownerDocument) {
    super();
    this.tagName = tagName.toUpperCase();
    this.ownerDocument = ownerDocument;
    this.children = [];
    this.parentElement = null;
    this.classList = new FakeClassList();
    this.dataset = {};
    this.style = {};
    this.attributes = new Map();
    this.inert = false;
    this.isConnected = true;
    this.textContent = '';
  }
  set className(value) { value.split(/\s+/).filter(Boolean).forEach(name => this.classList.add(name)); }
  get className() { return [...this.classList.values].join(' '); }
  append(...children) {
    for (const child of children) {
      child.parentElement = this;
      this.children.push(child);
    }
  }
  setAttribute(name, value) { this.attributes.set(name, String(value)); }
  getAttribute(name) { return this.attributes.get(name) ?? null; }
  remove() {
    if (!this.parentElement) return;
    this.parentElement.children = this.parentElement.children.filter(child => child !== this);
    this.parentElement = null;
    this.isConnected = false;
  }
  click() { this.dispatchEvent(new Event('click')); }
  focus() { this.ownerDocument.activeElement = this; }
  getBoundingClientRect() { return this.rect || { left: 0, top: 0, right: 0, bottom: 0, width: 0, height: 0 }; }
}

class FakeDocument extends EventTarget {
  constructor() {
    super();
    this.body = new FakeElement('body', this);
    this.activeElement = null;
    this.targets = new Map();
    this.keydownListener = null;
  }
  createElement(tagName) { return new FakeElement(tagName, this); }
  querySelector(selector) { return this.targets.get(selector) || null; }
  addEventListener(type, listener, options) {
    super.addEventListener(type, listener, options);
    if (type === 'keydown') this.keydownListener = listener;
  }
  removeEventListener(type, listener, options) {
    super.removeEventListener(type, listener, options);
    if (type === 'keydown' && this.keydownListener === listener) this.keydownListener = null;
  }
  fireKey(key, target) {
    const result = { prevented: false, stopped: false };
    this.keydownListener?.({
      key,
      target,
      preventDefault: () => { result.prevented = true; },
      stopImmediatePropagation: () => { result.stopped = true; },
    });
    return result;
  }
}

class FakeWindow extends EventTarget {
  constructor() {
    super();
    this.innerWidth = 1200;
    this.innerHeight = 800;
  }
  requestAnimationFrame(callback) { callback(); return 1; }
  cancelAnimationFrame() {}
}

function findByTag(root, tagName) {
  if (root.tagName === tagName.toUpperCase()) return root;
  for (const child of root.children) {
    const found = findByTag(child, tagName);
    if (found) return found;
  }
  return null;
}

function findByClass(root, className) {
  if (root.classList.contains(className)) return root;
  for (const child of root.children) {
    const found = findByClass(child, className);
    if (found) return found;
  }
  return null;
}

test('persists completion independently for each onboarding mode', () => {
  const storage = new MemoryStorage();
  assert.equal(hasCompletedOnboarding(ONBOARDING_KEYS.solar, storage), false);
  assert.equal(hasCompletedOnboarding(ONBOARDING_KEYS.creator, storage), false);

  markOnboardingComplete(ONBOARDING_KEYS.solar, storage);
  assert.equal(storage.getItem(ONBOARDING_KEYS.solar), '1');
  assert.equal(storage.getItem(ONBOARDING_KEYS.creator), null);
  assert.equal(hasCompletedOnboarding(ONBOARDING_KEYS.solar, storage), true);
  assert.equal(hasCompletedOnboarding(ONBOARDING_KEYS.creator, storage), false);

  markOnboardingComplete(ONBOARDING_KEYS.creator, storage);
  assert.equal(storage.getItem(ONBOARDING_KEYS.creator), '1');
  assert.equal(hasCompletedOnboarding(ONBOARDING_KEYS.creator, storage), true);
});

test('keeps completion for the SPA session when storage is unavailable', async () => {
  const fresh = await import(`../src/shared/onboarding-tour.js?fallback=${Date.now()}`);
  const storage = new MemoryStorage({ throws: true });
  assert.equal(fresh.hasCompletedOnboarding(fresh.ONBOARDING_KEYS.solar, storage), false);
  fresh.markOnboardingComplete(fresh.ONBOARDING_KEYS.solar, storage);
  assert.equal(fresh.hasCompletedOnboarding(fresh.ONBOARDING_KEYS.solar, storage), true);
  assert.equal(fresh.hasCompletedOnboarding(fresh.ONBOARDING_KEYS.creator, storage), false);
});

test('positions the tour card beside a target and stacks it on narrow screens', () => {
  const card = { width: 280, height: 160 };
  assert.deepEqual(
    computeTourCardPosition({ left: 40, top: 200, right: 240, bottom: 400 }, card, { width: 1200, height: 800 }),
    { left: 258, top: 220, placement: 'right' },
  );
  assert.deepEqual(
    computeTourCardPosition({ left: 20, top: 160, right: 340, bottom: 300 }, card, { width: 360, height: 640 }),
    { left: 40, top: 318, placement: 'bottom' },
  );
});

test('writes completion only after the final step and restores the app', () => {
  const previousDocument = globalThis.document;
  const previousWindow = globalThis.window;
  const document = new FakeDocument();
  const window = new FakeWindow();
  globalThis.document = document;
  globalThis.window = window;

  try {
    const storage = new MemoryStorage();
    const appRoot = new FakeElement('main', document);
    const target = new FakeElement('section', document);
    target.rect = { left: 20, top: 20, right: 220, bottom: 120, width: 200, height: 100 };
    document.targets.set('#target', target);
    const endings = [];

    const tour = startOnboardingTour({
      appRoot,
      storage,
      storageKey: ONBOARDING_KEYS.solar,
      steps: [
        { target: '#target', title: 'First', description: 'One' },
        { target: '#target', title: 'Second', description: 'Two' },
      ],
      onEnd: result => endings.push(result),
    });

    const button = findByTag(document.body, 'button');
    assert.ok(tour);
    assert.equal(appRoot.inert, true);
    assert.equal(button.textContent, 'Next');
    assert.deepEqual(document.fireKey('Escape', button), { prevented: true, stopped: true });
    assert.deepEqual(document.fireKey(' ', button), { prevented: true, stopped: true });
    assert.equal(storage.getItem(ONBOARDING_KEYS.solar), null);
    assert.equal(button.textContent, 'Start Exploring');
    button.dispatchEvent(new Event('click'));
    assert.equal(storage.getItem(ONBOARDING_KEYS.solar), '1');
    assert.equal(appRoot.inert, false);
    assert.deepEqual(endings, [{ completed: true }]);
    assert.equal(document.body.children.length, 0);
  } finally {
    globalThis.document = previousDocument;
    globalThis.window = previousWindow;
  }
});

test('destroying an unfinished tour cleans up without marking completion', () => {
  const previousDocument = globalThis.document;
  const previousWindow = globalThis.window;
  const document = new FakeDocument();
  const window = new FakeWindow();
  globalThis.document = document;
  globalThis.window = window;

  try {
    const storage = new MemoryStorage();
    const appRoot = new FakeElement('main', document);
    const endings = [];
    const tour = startOnboardingTour({
      appRoot,
      storage,
      storageKey: ONBOARDING_KEYS.creator,
      steps: [{ target: '#missing', title: 'Fallback', description: 'Still visible' }],
      onEnd: result => endings.push(result),
    });

    tour.destroy();
    tour.destroy();
    assert.equal(storage.getItem(ONBOARDING_KEYS.creator), null);
    assert.equal(appRoot.inert, false);
    assert.deepEqual(endings, [{ completed: false }]);
    assert.equal(document.body.children.length, 0);
  } finally {
    globalThis.document = previousDocument;
    globalThis.window = previousWindow;
  }
});

test('dims a canvas target that fills the viewport', () => {
  const previousDocument = globalThis.document;
  const previousWindow = globalThis.window;
  const document = new FakeDocument();
  const window = new FakeWindow();
  globalThis.document = document;
  globalThis.window = window;

  try {
    const target = new FakeElement('canvas', document);
    target.rect = { left: 0, top: 0, right: 1200, bottom: 800, width: 1200, height: 800 };
    document.targets.set('canvas', target);
    const tour = startOnboardingTour({
      appRoot: new FakeElement('main', document),
      storage: new MemoryStorage(),
      storageKey: ONBOARDING_KEYS.solar,
      steps: [{ target: 'canvas', title: 'Canvas', description: 'Navigation' }],
    });

    assert.equal(
      findByClass(document.body, 'onboarding-tour__shield').style.background,
      'rgba(0, 0, 0, 0.58)',
    );
    tour.destroy();
  } finally {
    globalThis.document = previousDocument;
    globalThis.window = previousWindow;
  }
});
