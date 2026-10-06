import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createStateStore } from '../server/state-store.mjs';

function plannerState(title = '周末骑行') {
  return {
    version: 4,
    days: {
      '2026-09-12': [
        {
          id: 'outing',
          title,
          start: '16:00',
          end: '17:00',
          kind: 'fun',
          emoji: '🚲',
          palette: 3,
        },
      ],
    },
    recurringPlans: [],
    tasks: {},
    recurringTasks: [],
    taskCompletions: {},
    starSpends: [],
    classicsProgress: {},
  };
}

function withStore(run) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'hidearyui-state-'));
  try {
    run(createStateStore(directory), directory);
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
}

test('server state survives restart, rejects stale writes and creates a daily backup', () => {
  withStore((store, directory) => {
    assert.deepEqual(store.get(), {
      revision: 0,
      state: null,
      updatedAt: null,
    });
    const first = store.put(0, plannerState());
    assert.equal(first.status, 'saved');
    assert.equal(first.revision, 1);
    assert.equal(store.put(0, plannerState('过期修改')).status, 'conflict');

    const restored = createStateStore(directory).get();
    assert.equal(restored.revision, 1);
    assert.equal(restored.state.days['2026-09-12'][0].title, '周末骑行');
    assert.equal(fs.readdirSync(path.join(directory, 'backups')).length, 2);
  });
});

test('server rejects malformed planner state without advancing the revision', () => {
  withStore((store) => {
    assert.equal(store.put(0, { version: 4 }).status, 'invalid_state');
    const overlap = plannerState();
    overlap.days['2026-09-12'].push({
      ...overlap.days['2026-09-12'][0],
      id: 'conflicting',
    });
    assert.equal(store.put(0, overlap).status, 'invalid_state');
    assert.equal(store.get().revision, 0);
  });
});

test('server migrates old state with empty weekly-plan and star-spend collections', () => {
  withStore((_store, directory) => {
    fs.writeFileSync(
      path.join(directory, 'planner-state.json'),
      JSON.stringify({
        revision: 4,
        updatedAt: '2026-09-19T00:00:00.000Z',
        state: {
          ...plannerState(),
          version: 2,
          recurringPlans: undefined,
        },
      }),
    );
    const restored = createStateStore(directory).get();
    assert.equal(restored.state.version, 4);
    assert.deepEqual(restored.state.recurringPlans, []);
    assert.deepEqual(restored.state.starSpends, []);
  });
});

test('every saved revision keeps its snapshot and the daily backup keeps its first snapshot', () => {
  withStore((store, directory) => {
    const first = store.put(0, plannerState('第一次保存'));
    const second = store.put(1, plannerState('第二次保存'));
    assert.equal(second.revision, 2);
    const revisions = path.join(directory, 'backups', 'revisions');
    for (const [revision, title] of [[1, '第一次保存'], [2, '第二次保存']]) {
      const snapshot = JSON.parse(fs.readFileSync(path.join(revisions, `planner-state-r${revision}.json`), 'utf8'));
      assert.equal(snapshot.revision, revision);
      assert.equal(snapshot.state.days['2026-09-12'][0].title, title);
    }
    const day = first.updatedAt.slice(0, 10);
    const daily = JSON.parse(fs.readFileSync(path.join(directory, 'backups', `planner-state-${day}.json`), 'utf8'));
    assert.equal(daily.revision, 1);
  });
});

test('a failed backup preserves the live file and revision, then a retry can succeed', () => {
  withStore((store, directory) => {
    store.put(0, plannerState('已保存的计划'));
    const stateFile = path.join(directory, 'planner-state.json');
    const previousFile = fs.readFileSync(stateFile, 'utf8');
    const blockedBackup = path.join(directory, 'backups', 'revisions', 'planner-state-r2.json');
    fs.mkdirSync(blockedBackup);

    assert.throws(() => store.put(1, plannerState('本次保存失败')));
    assert.equal(store.get().revision, 1);
    assert.equal(store.get().state.days['2026-09-12'][0].title, '已保存的计划');
    assert.equal(fs.readFileSync(stateFile, 'utf8'), previousFile);
    assert.equal(createStateStore(directory).get().revision, 1);

    fs.rmdirSync(blockedBackup);
    assert.equal(store.put(1, plannerState('重试成功')).status, 'saved');
    assert.equal(createStateStore(directory).get().revision, 2);
    assert.equal(createStateStore(directory).get().state.days['2026-09-12'][0].title, '重试成功');
  });
});

test('invalid expected revisions are rejected without creating a live state file', () => {
  withStore((store, directory) => {
    for (const revision of [-1, 1.5, NaN, '0', undefined]) {
      assert.equal(store.put(revision, plannerState()).status, 'invalid_revision');
    }
    assert.equal(store.get().revision, 0);
    assert.equal(fs.existsSync(path.join(directory, 'planner-state.json')), false);
  });
});
