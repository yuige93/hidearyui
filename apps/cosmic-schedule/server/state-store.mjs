import fs from 'node:fs';
import path from 'node:path';
import { readState } from '../lib/planner.ts';

export const MAX_STATE_BYTES = 1024 * 1024;

function normalizeState(state) {
  if (state?.version === 2)
    return { ...state, version: 4, recurringPlans: [], starSpends: [] };
  if (state?.version === 3) return { ...state, version: 4, starSpends: [] };
  return state;
}

function validState(state) {
  const validShape =
    state &&
    typeof state === 'object' &&
    !Array.isArray(state) &&
    state.version === 4 &&
    state.days &&
    typeof state.days === 'object' &&
    !Array.isArray(state.days) &&
    Array.isArray(state.recurringPlans) &&
    state.tasks &&
    typeof state.tasks === 'object' &&
    !Array.isArray(state.tasks) &&
    Array.isArray(state.recurringTasks) &&
    state.taskCompletions &&
    typeof state.taskCompletions === 'object' &&
    !Array.isArray(state.taskCompletions) &&
    Array.isArray(state.starSpends) &&
    state.classicsProgress &&
    typeof state.classicsProgress === 'object' &&
    !Array.isArray(state.classicsProgress);
  if (!validShape) return false;
  try {
    readState(JSON.stringify(state));
    return true;
  } catch {
    return false;
  }
}

export function createStateStore(root) {
  const stateFile = path.join(root, 'planner-state.json');
  const backupDirectory = path.join(root, 'backups');
  const revisionDirectory = path.join(backupDirectory, 'revisions');
  fs.mkdirSync(backupDirectory, { recursive: true, mode: 0o700 });
  fs.mkdirSync(revisionDirectory, { recursive: true, mode: 0o700 });
  let saved = null;
  if (fs.existsSync(stateFile)) {
    const parsed = JSON.parse(fs.readFileSync(stateFile, 'utf8'));
    const normalizedState = normalizeState(parsed?.state);
    if (
      !parsed ||
      !Number.isInteger(parsed.revision) ||
      parsed.revision < 1 ||
      !validState(normalizedState)
    )
      throw new Error('Saved planner state is invalid');
    saved = { ...parsed, state: normalizedState };
  }

  function get() {
    return saved
      ? {
          revision: saved.revision,
          state: saved.state,
          updatedAt: saved.updatedAt,
        }
      : { revision: 0, state: null, updatedAt: null };
  }

  function put(expectedRevision, state) {
    if (!Number.isInteger(expectedRevision) || expectedRevision < 0)
      return { status: 'invalid_revision' };
    const normalizedState = normalizeState(state);
    if (!validState(normalizedState)) return { status: 'invalid_state' };
    const currentRevision = saved?.revision ?? 0;
    if (expectedRevision !== currentRevision)
      return { status: 'conflict', ...get() };

    const next = {
      revision: currentRevision + 1,
      updatedAt: new Date().toISOString(),
      state: normalizedState,
    };
    const serialized = JSON.stringify(next);
    if (Buffer.byteLength(serialized) > MAX_STATE_BYTES)
      return { status: 'too_large' };

    fs.mkdirSync(root, { recursive: true, mode: 0o700 });
    const temporary = `${stateFile}.${process.pid}.tmp`;
    fs.writeFileSync(temporary, `${serialized}\n`, { mode: 0o600 });
    // Archive the existing head too, including the pre-upgrade revision. A
    // failed backup must not advance the live file or the in-memory revision.
    const archive = (snapshot) => {
      const file = path.join(
        revisionDirectory,
        `planner-state-r${snapshot.revision}.json`,
      );
      if (!fs.existsSync(file))
        fs.writeFileSync(file, `${JSON.stringify(snapshot)}\n`, {
          mode: 0o600,
          flag: 'wx',
        });
    };
    if (saved) archive(saved);
    const revisionBackup = path.join(
      revisionDirectory,
      `planner-state-r${next.revision}.json`,
    );
    // A prior failed write may have left this uncommitted revision behind.
    fs.writeFileSync(revisionBackup, `${serialized}\n`, { mode: 0o600 });
    const day = next.updatedAt.slice(0, 10);
    const dailyBackup = path.join(backupDirectory, `planner-state-${day}.json`);
    if (!fs.existsSync(dailyBackup))
      fs.writeFileSync(dailyBackup, `${serialized}\n`, {
        mode: 0o600,
        flag: 'wx',
      });
    fs.renameSync(temporary, stateFile);
    saved = next;
    return { status: 'saved', ...get() };
  }

  return { get, put };
}
