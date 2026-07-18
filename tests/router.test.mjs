import test from 'node:test';
import assert from 'node:assert/strict';

import { createRouteManager, resolveRoute, startHashRouter } from '../src/router.js';
import { createResourceScope } from '../src/shared/resource-scope.js';

test('resolves canonical, legacy, and unknown hash routes', () => {
  assert.deepEqual(resolveRoute(''), {
    path: '/',
    page: 'solar',
    view: 'title',
    replace: true,
  });
  assert.deepEqual(resolveRoute('#modes'), {
    path: '/modes',
    page: 'solar',
    view: 'modes',
    replace: true,
  });
  assert.deepEqual(resolveRoute('#/solar-system'), {
    path: '/solar-system',
    page: 'solar',
    view: 'simulation',
    replace: false,
  });
  assert.deepEqual(resolveRoute('#/big-bang'), {
    path: '/big-bang',
    page: 'big-bang',
    view: 'title',
    replace: false,
  });
  assert.deepEqual(resolveRoute('#/missing'), {
    path: '/',
    page: 'solar',
    view: 'title',
    replace: true,
  });
});

test('changes Solar views without remounting the Solar page', async () => {
  const calls = [];
  const manager = createRouteManager({
    root: {},
    loaders: {
      solar: async () => ({
        mount: ({ route }) => {
          calls.push(['mount', route.view]);
          return {
            setView(view) { calls.push(['view', view]); },
            destroy() { calls.push(['destroy', 'solar']); },
          };
        },
      }),
    },
  });

  await manager.activate(resolveRoute('#/'));
  await manager.activate(resolveRoute('#/modes'));
  await manager.activate(resolveRoute('#/solar-system'));

  assert.deepEqual(calls, [
    ['mount', 'title'],
    ['view', 'modes'],
    ['view', 'simulation'],
  ]);
});

test('destroys the active simulation before mounting another page', async () => {
  const calls = [];
  const page = name => async () => ({
    mount: () => {
      calls.push(`mount:${name}`);
      return { destroy() { calls.push(`destroy:${name}`); } };
    },
  });
  const manager = createRouteManager({
    root: {},
    loaders: { solar: page('solar'), 'big-bang': page('big-bang') },
  });

  await manager.activate(resolveRoute('#/'));
  await manager.activate(resolveRoute('#/big-bang'));

  assert.deepEqual(calls, ['mount:solar', 'destroy:solar', 'mount:big-bang']);
});

test('rapid navigation skips a stale page mount and activates the latest route', async () => {
  const calls = [];
  let releaseBigBang;
  const bigBangLoaded = new Promise(resolve => { releaseBigBang = resolve; });
  const manager = createRouteManager({
    root: {},
    loaders: {
      solar: async () => ({
        mount: ({ route }) => {
          calls.push(`mount:solar:${route.view}`);
          return {
            setView(view) { calls.push(`view:solar:${view}`); },
            destroy() { calls.push('destroy:solar'); },
          };
        },
      }),
      'big-bang': async () => {
        await bigBangLoaded;
        return {
          mount: () => {
            calls.push('mount:big-bang');
            return { destroy() { calls.push('destroy:big-bang'); } };
          },
        };
      },
    },
  });

  await manager.activate(resolveRoute('#/'));
  const pendingBigBang = manager.activate(resolveRoute('#/big-bang'));
  const pendingSolar = manager.activate(resolveRoute('#/modes'));
  releaseBigBang();
  await Promise.all([pendingBigBang, pendingSolar]);

  assert.deepEqual(calls, [
    'mount:solar:title',
    'view:solar:modes',
  ]);
});

test('Back and Forward hash activation swaps pages and clears active debug handles', async () => {
  const win = new EventTarget();
  win.location = { pathname: '/index.html', search: '', hash: '#/' };
  win.history = {
    replaceState(_state, _title, url) {
      win.location.hash = url.slice(url.indexOf('#'));
    },
  };
  win.document = { body: { dataset: {} } };
  win.setTimeout = callback => {
    queueMicrotask(callback);
    return 1;
  };
  const fade = { classList: { add() {}, remove() {} } };
  const root = {};
  const calls = [];
  const page = name => async () => ({
    mount: ({ route }) => {
      calls.push(`mount:${name}:${route.view}`);
      win[name === 'solar' ? 'solar' : 'bang'] = { page: name };
      return {
        setView(view) { calls.push(`view:${name}:${view}`); },
        destroy() {
          calls.push(`destroy:${name}`);
          delete win[name === 'solar' ? 'solar' : 'bang'];
        },
      };
    },
  });
  const router = startHashRouter({
    root,
    fade,
    loaders: { solar: page('solar'), 'big-bang': page('big-bang') },
    win,
  });
  const waitFor = async predicate => {
    for (let attempt = 0; attempt < 30 && !predicate(); attempt++) {
      await new Promise(resolve => setImmediate(resolve));
    }
    assert.ok(predicate(), 'Route did not settle');
  };

  await waitFor(() => router.activeRoute?.page === 'solar');
  assert.ok(win.solar);

  win.location.hash = '#/big-bang';
  win.dispatchEvent(new Event('hashchange'));
  await waitFor(() => router.activeRoute?.page === 'big-bang');
  assert.equal(win.solar, undefined);
  assert.ok(win.bang);

  win.location.hash = '#/';
  win.dispatchEvent(new Event('hashchange'));
  await waitFor(() => router.activeRoute?.page === 'solar');
  assert.equal(win.bang, undefined);
  assert.ok(win.solar);
  assert.deepEqual(calls, [
    'mount:solar:title',
    'destroy:solar',
    'mount:big-bang:title',
    'destroy:big-bang',
    'mount:solar:title',
  ]);

  await router.destroy();
  assert.equal(win.solar, undefined);
});

test('resource scope cancels owned browser work exactly once', () => {
  const target = new EventTarget();
  const canceled = [];
  const clearedTimeouts = [];
  const clearedIntervals = [];
  let disconnected = 0;
  const scope = createResourceScope({
    requestAnimationFrame: () => 11,
    cancelAnimationFrame: id => canceled.push(id),
    setTimeout: () => 12,
    clearTimeout: id => clearedTimeouts.push(id),
    setInterval: () => 13,
    clearInterval: id => clearedIntervals.push(id),
  });
  let events = 0;
  scope.listen(target, 'ping', () => { events++; });
  scope.requestAnimationFrame(() => {});
  scope.setTimeout(() => {}, 10);
  scope.setInterval(() => {}, 10);
  scope.observe({ disconnect() { disconnected++; } });
  const stale = scope.guard(value => value * 2);
  scope.invalidate();
  const guarded = scope.guard(value => value * 2);

  target.dispatchEvent(new Event('ping'));
  assert.equal(stale(2), undefined);
  assert.equal(guarded(2), 4);
  scope.destroy();
  scope.destroy();
  target.dispatchEvent(new Event('ping'));

  assert.equal(events, 1);
  assert.equal(guarded(2), undefined);
  assert.deepEqual(canceled, [11]);
  assert.deepEqual(clearedTimeouts, [12]);
  assert.deepEqual(clearedIntervals, [13]);
  assert.equal(disconnected, 1);
});
