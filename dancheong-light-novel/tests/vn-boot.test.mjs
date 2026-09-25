import { test } from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const html = fs.readFileSync(path.join(here, '../public/vn-boot.html'), 'utf8');
const match = html.match(/<script id="vn-boot-controller">([\s\S]*?)<\/script>/);
assert.ok(match, 'vn-boot-controller script must exist in vn-boot.html');
const controllerSrc = match[1];

// Minimal harness: mocked document + window error listener + fake timers.
function loadBoot(sheets) {
  let errorHandler = null;
  let timeoutFn = null;
  let timeoutMs = null;
  let cleared = false;
  const root = { dataset: {} };
  const documentMock = {
    documentElement: root,
    getElementById: (id) => (sheets[id] ? { sheet: sheets[id] } : null),
  };
  const windowMock = {
    NexusVNBoot: undefined,
    addEventListener: (type, fn) => {
      if (type === 'error') errorHandler = fn;
    },
  };
  const context = vm.createContext({
    document: documentMock,
    window: windowMock,
    setTimeout: (fn, ms) => {
      timeoutFn = fn;
      timeoutMs = ms;
      return 1;
    },
    clearTimeout: () => {
      cleared = true;
      timeoutFn = null;
    },
  });
  vm.runInContext(controllerSrc, context, { filename: 'vn-boot-controller.js' });
  return {
    root,
    boot: windowMock.NexusVNBoot,
    timeoutMs: () => timeoutMs,
    wasCleared: () => cleared,
    fireTimeout: () => timeoutFn?.(),
    sendError: (event) => errorHandler?.(event),
  };
}

const bothSheets = () => ({ 'vn-style-main': {}, 'vn-style-reader': {} });

test('ready succeeds only when both CSS sheets exist', () => {
  const t = loadBoot(bothSheets());
  assert.equal(t.timeoutMs(), 30000);
  t.boot.ready();
  assert.equal(t.root.dataset.vnBoot, 'ready');
  assert.equal(t.wasCleared(), true);
});

test('missing stylesheet keeps error on ready', () => {
  const t = loadBoot({ 'vn-style-main': {} }); // vn-style-reader absent
  t.boot.ready();
  assert.equal(t.root.dataset.vnBoot, 'error');
});

test('module asset error prevents later ready', () => {
  const t = loadBoot(bothSheets());
  t.sendError({ target: { id: 'vn-entry' }, filename: '' });
  assert.equal(t.root.dataset.vnBoot, 'error');
  t.boot.ready();
  assert.equal(t.root.dataset.vnBoot, 'error');
});

test('timeout shows error but a late successful ready can recover', () => {
  const t = loadBoot(bothSheets());
  t.fireTimeout();
  assert.equal(t.root.dataset.vnBoot, 'error');
  t.boot.ready();
  assert.equal(t.root.dataset.vnBoot, 'ready');
});

test('post-ready unrelated error does not hide the UI', () => {
  const t = loadBoot(bothSheets());
  t.boot.ready();
  assert.equal(t.root.dataset.vnBoot, 'ready');
  t.sendError({ target: { id: 'something-else' }, filename: 'https://example.com/other.js' });
  assert.equal(t.root.dataset.vnBoot, 'ready');
});

