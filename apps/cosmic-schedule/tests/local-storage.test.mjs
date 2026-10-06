import test from 'node:test';
import assert from 'node:assert/strict';
import { PlannerLocal } from '../lib/local-storage.ts';
import { emptyState, STORAGE_KEY } from '../lib/planner.ts';

function fixture(initial = null, failWrite = false) {
  const values = new Map(initial === null ? [] : [[STORAGE_KEY, initial]]);
  const observed = { state: emptyState(), status: '', readOnly: false };
  const store = new PlannerLocal({
    storage: {
      getItem: (key) => values.get(key) ?? null,
      setItem: (key, value) => {
        if (failWrite) throw new Error('Quota exceeded');
        values.set(key, value);
      },
    },
    storageKey: STORAGE_KEY,
    onState: (state) => { observed.state = state; },
    onStatus: (message) => { observed.status = message; },
    onReadOnly: (value) => { observed.readOnly = value; },
  });
  return { store, observed, values };
}

test('tasks, earned stars and learning progress survive a fresh store', () => {
  const f = fixture();
  f.store.start();
  const next = emptyState();
  next.tasks['2026-10-06'] = [{ id: 'read', title: '阅读十分钟', done: true }];
  next.classicsProgress['demo-book'] = { read: 1 };
  f.store.edit(next);
  const reopened = fixture(f.values.get(STORAGE_KEY));
  reopened.store.start();
  assert.deepEqual(reopened.observed.state, next);
});

test('a damaged existing record is preserved and cannot be overwritten', () => {
  const f = fixture('{broken json');
  f.store.start();
  f.store.edit(emptyState());
  assert.equal(f.observed.readOnly, true);
  assert.equal(f.values.get(STORAGE_KEY), '{broken json');
  assert.equal(f.store.backup(emptyState()), '{broken json');
  assert.match(f.observed.status, /原数据已保留/);
});

test('quota failure keeps the in-memory edit and clearly requests a backup', () => {
  const f = fixture(null, true);
  f.store.start();
  const next = emptyState();
  next.tasks['2026-10-06'] = [{ id: 'read', title: '阅读十分钟', done: false }];
  f.store.edit(next);
  assert.deepEqual(f.observed.state, next);
  assert.equal(f.values.has(STORAGE_KEY), false);
  assert.match(f.observed.status, /保存失败，请导出备份/);
});

test('public storage starts empty, makes no network requests and uses its own key', () => {
  const before = globalThis.fetch;
  globalThis.fetch = () => { throw new Error('Network is forbidden'); };
  try {
    const f = fixture();
    f.store.start();
    f.store.edit(emptyState());
    assert.equal(STORAGE_KEY, 'hidearyui:cosmic-schedule:v1');
    assert.deepEqual(f.observed.state, emptyState());
    assert.equal(f.observed.readOnly, false);
  } finally { globalThis.fetch = before; }
});
