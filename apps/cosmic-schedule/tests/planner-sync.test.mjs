import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { emptyState, readState } from '../lib/planner.ts';
import { PlannerSync, rebasePlannerState } from '../lib/planner-sync.ts';
import { createStateStore } from '../server/state-store.mjs';

const clone = (value) => JSON.parse(JSON.stringify(value));
const item = (id, title = id) => ({
  id,
  title,
  start: '08:30',
  end: '09:00',
  kind: 'fun',
});
const planned = () => ({
  ...emptyState(),
  days: { '2026-10-03': [item('trip')] },
});

function memoryStorage() {
  const data = new Map();
  return {
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => data.set(key, value),
  };
}

function server(t, initial = planned()) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'sweet-sync-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const store = createStateStore(directory);
  store.put(0, initial);
  return {
    directory,
    store,
    get: async () => clone({ ...store.get(), syncProtocol: 2 }),
    put: async (revision, state) => {
      const saved = store.put(revision, clone(state));
      return clone({
        ...saved,
        syncProtocol: 2,
        conflict: saved.status === 'conflict',
      });
    },
  };
}

function client(t, transport, storage = memoryStorage()) {
  let state, status;
  const sync = new PlannerSync({
    ...transport,
    storage,
    storageKey: 'planner',
    onState: (next) => {
      state = next;
    },
    onStatus: (next) => {
      status = next;
    },
    onReadOnly: () => {},
  });
  t.after(() => sync.stop());
  return { sync, storage, state: () => state, status: () => status };
}

test('three-way rebase preserves deletions, moves, remote edits and explicit unchecking', () => {
  const base = planned();
  base.tasks['2026-10-03'] = [{ id: 'reading', title: '阅读', done: true }];
  base.taskCompletions['daily:2026-10-03'] = {
    taskId: 'daily',
    title: '诵读',
    completedAt: '2026-10-03',
  };
  const local = clone(base);
  local.days['2026-10-03'] = [];
  local.days['2026-10-04'] = [item('trip', '新安排')];
  local.tasks['2026-10-03'][0].done = false;
  delete local.taskCompletions['daily:2026-10-03'];
  const remote = clone(base);
  remote.tasks['2026-10-03'][0].title = '阅读新书';
  remote.days['2026-10-05'] = [item('remote')];
  const merged = rebasePlannerState(base, local, remote);
  assert.deepEqual(merged.days['2026-10-03'], []);
  assert.equal(merged.days['2026-10-04'][0].title, '新安排');
  assert.equal(merged.days['2026-10-05'][0].id, 'remote');
  assert.deepEqual(merged.tasks['2026-10-03'][0], {
    id: 'reading',
    title: '阅读新书',
    done: false,
  });
  assert.deepEqual(merged.taskCompletions, {});
  assert.deepEqual(readState(JSON.stringify(merged)), merged);
});

test('an unchanged stale item cannot revive a remote deletion while another item changes', () => {
  const base = planned(),
    local = clone(base),
    remote = clone(base);
  local.days['2026-10-05'] = [item('new')];
  remote.days['2026-10-03'] = [];
  const merged = rebasePlannerState(base, local, remote);
  assert.deepEqual(merged.days['2026-10-03'], []);
  assert.equal(merged.days['2026-10-05'][0].id, 'new');
});

test('two devices edit concurrently without reviving a deleted National Day plan', async (t) => {
  const backend = server(t);
  const first = client(t, backend),
    stale = client(t, backend);
  await Promise.all([first.sync.start(), stale.sync.start()]);
  const deleted = clone(first.state());
  deleted.days['2026-10-03'] = [];
  first.sync.edit(deleted);
  await first.sync.sync();
  const edited = clone(stale.state());
  edited.days['2026-10-05'] = [item('new')];
  stale.sync.edit(edited);
  await stale.sync.sync();
  assert.deepEqual(backend.store.get().state.days['2026-10-03'], []);
  assert.equal(backend.store.get().state.days['2026-10-05'][0].id, 'new');
  assert.equal(stale.status(), '已同步');
});

test('a PUT conflict preserves deletion and unrelated remote edits', async (t) => {
  const backend = server(t);
  let inject = false;
  const transport = {
    ...backend,
    put: async (revision, state) => {
      if (inject) {
        inject = false;
        const remote = clone(backend.store.get().state);
        remote.days['2026-10-06'] = [item('other')];
        backend.store.put(revision, remote);
      }
      return backend.put(revision, state);
    },
  };
  const device = client(t, transport);
  await device.sync.start();
  device.sync.edit({ ...device.state(), days: { '2026-10-03': [] } });
  inject = true;
  await device.sync.sync();
  assert.deepEqual(backend.store.get().state.days['2026-10-03'], []);
  assert.equal(backend.store.get().state.days['2026-10-06'][0].id, 'other');
  assert.equal(device.status(), '已同步');
});

test('offline deletion of the final item survives closing and reopening the page', async (t) => {
  const backend = server(t);
  let online = true;
  const transport = {
    ...backend,
    get: async () => {
      if (!online) throw new Error('offline');
      return backend.get();
    },
  };
  const storage = memoryStorage();
  const first = client(t, transport, storage);
  await first.sync.start();
  online = false;
  first.sync.edit(emptyState());
  await first.sync.sync();
  first.sync.stop();
  const reopened = client(t, transport, storage);
  await reopened.sync.start();
  assert.deepEqual(reopened.state(), emptyState());
  assert.equal(reopened.status(), '本地已保存 · 等待同步');
  online = true;
  await reopened.sync.sync();
  assert.deepEqual(backend.store.get().state, emptyState());
  assert.equal(reopened.status(), '已同步');
});

test('edits made during a save stay pending and are uploaded in a second save', async (t) => {
  const backend = server(t);
  let release, started;
  const entered = new Promise((resolve) => {
    started = resolve;
  });
  const gate = new Promise((resolve) => {
    release = resolve;
  });
  let block = true;
  const transport = {
    ...backend,
    put: async (revision, state) => {
      if (block) {
        block = false;
        started();
        await gate;
      }
      return backend.put(revision, state);
    },
  };
  const device = client(t, transport);
  await device.sync.start();
  device.sync.edit({ ...device.state(), days: { '2026-10-03': [] } });
  const pending = device.sync.sync();
  await entered;
  device.sync.edit({
    ...device.state(),
    days: { ...device.state().days, '2026-10-05': [item('later')] },
  });
  release();
  await pending;
  assert.deepEqual(backend.store.get().state.days['2026-10-03'], []);
  assert.equal(backend.store.get().state.days['2026-10-05'][0].id, 'later');
  assert.equal(device.status(), '已同步');
});

test('failed PUT retries even when no other changes are made', async (t) => {
  const backend = server(t);
  let fail = true;
  const device = client(t, {
    ...backend,
    put: async (revision, state) => {
      if (fail) {
        fail = false;
        throw new Error('offline');
      }
      return backend.put(revision, state);
    },
  });
  await device.sync.start();
  device.sync.edit(emptyState());
  await device.sync.sync();
  assert.equal(device.status(), '本地已保存 · 等待同步');
  await device.sync.sync();
  assert.deepEqual(backend.store.get().state, emptyState());
});

test('migration backs up legacy data and never unions stale plans into a populated server', async (t) => {
  const backend = server(t, emptyState());
  const storage = memoryStorage();
  const legacy = JSON.stringify(planned());
  storage.setItem('planner', legacy);
  const device = client(t, backend, storage);
  await device.sync.start();
  assert.deepEqual(device.state(), emptyState());
  assert.equal(storage.getItem('planner:recovery-v2'), legacy);
  assert.equal(backend.store.get().revision, 1);
});

test('read-only clients discard their pending write without altering the server', async (t) => {
  const backend = server(t);
  const storage = memoryStorage();
  storage.setItem(
    'planner:sync-v2',
    JSON.stringify({ revision: 1, base: planned(), state: emptyState() }),
  );
  const device = client(
    t,
    {
      ...backend,
      get: async () => ({ ...(await backend.get()), readOnly: true }),
    },
    storage,
  );
  await device.sync.start();
  device.sync.edit(emptyState());
  await device.sync.sync();
  assert.deepEqual(device.state(), planned());
  assert.equal(backend.store.get().revision, 1);
  assert.equal(device.status(), '只读访问');
});

test('every saved revision is recoverable, including the snapshot before upgrade', (t) => {
  const backend = server(t);
  backend.store.put(1, emptyState());
  backend.store.put(2, planned());
  const root = path.join(backend.directory, 'backups', 'revisions');
  assert.deepEqual(fs.readdirSync(root), [
    'planner-state-r1.json',
    'planner-state-r2.json',
    'planner-state-r3.json',
  ]);
  assert.deepEqual(
    JSON.parse(
      fs.readFileSync(path.join(root, 'planner-state-r2.json'), 'utf8'),
    ).state,
    emptyState(),
  );
});
