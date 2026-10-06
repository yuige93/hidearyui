import { emptyState, readState, type PlannerState } from './planner.ts';

export const SYNC_PROTOCOL = 2;
const equal = (a: unknown, b: unknown) =>
  JSON.stringify(a) === JSON.stringify(b);
const record = (value: unknown): Record<string, unknown> =>
  value !== null && typeof value === 'object'
    ? (value as Record<string, unknown>)
    : {};

// Apply only edits relative to the last acknowledged snapshot. Absence is a
// deletion, not an invitation to union an old item back into the collection.
function rebaseValue(base: unknown, local: unknown, remote: unknown): unknown {
  if (equal(base, local)) return remote;
  if (local === undefined) return undefined;
  if (Array.isArray(local)) {
    const byId = (items: unknown) =>
      new Map<string, unknown>(
        (Array.isArray(items) ? (items as { id: string }[]) : []).map(
          (item) => [item.id, item],
        ),
      );
    const before = byId(base),
      after = byId(local),
      latest = byId(remote);
    const result: unknown[] = [];
    for (const id of new Set([
      ...latest.keys(),
      ...before.keys(),
      ...after.keys(),
    ])) {
      // A concurrent edit of a remotely removed entity is an explicit new
      // intent; keep the complete entity rather than an invalid partial object.
      const item =
        !latest.has(id) &&
        after.has(id) &&
        !equal(before.get(id), after.get(id))
          ? after.get(id)
          : rebaseValue(before.get(id), after.get(id), latest.get(id));
      if (item !== undefined) result.push(item);
    }
    return result;
  }
  if (local !== null && typeof local === 'object') {
    const result: Record<string, unknown> = {};
    const before = record(base),
      after = record(local),
      latest = record(remote);
    for (const key of new Set([
      ...Object.keys(before),
      ...Object.keys(latest),
      ...Object.keys(after),
    ])) {
      const value = rebaseValue(before[key], after[key], latest[key]);
      if (value !== undefined) result[key] = value;
    }
    return result;
  }
  return local;
}

export function rebasePlannerState(
  base: PlannerState,
  local: PlannerState,
  remote: PlannerState,
): PlannerState {
  return rebaseValue(base, local, remote) as PlannerState;
}

export type RemoteSnapshot = {
  revision: number;
  state: PlannerState | null;
  readOnly?: boolean;
  syncProtocol: number;
  conflict?: boolean;
};
type SyncOptions = {
  storage: Pick<Storage, 'getItem' | 'setItem'>;
  storageKey: string;
  get: () => Promise<RemoteSnapshot>;
  put: (revision: number, state: PlannerState) => Promise<RemoteSnapshot>;
  onState: (state: PlannerState) => void;
  onStatus: (message: string) => void;
  onReadOnly: (readOnly: boolean) => void;
};

export class PlannerSync {
  private base: PlannerState;
  private current: PlannerState;
  private revision = -1;
  private readOnly = false;
  private running: Promise<void> | null = null;
  private stopped = false;
  private storageOK = true;
  private timer: ReturnType<typeof setTimeout> | undefined;
  private key: string;
  private options: SyncOptions;

  constructor(options: SyncOptions) {
    this.options = options;
    this.key = `${options.storageKey}:sync-v2`;
    this.current = emptyState();
    this.base = emptyState();
    try {
      const raw = options.storage.getItem(this.key);
      if (raw) {
        const saved = JSON.parse(raw);
        if (!Number.isInteger(saved.revision) || saved.revision < -1)
          throw new Error('invalid_snapshot');
        const base = readState(JSON.stringify(saved.base));
        const state = readState(JSON.stringify(saved.state));
        this.base = base;
        this.current = state;
        this.revision = saved.revision;
        this.readOnly = saved.readOnly === true;
      } else {
        const legacy = options.storage.getItem(options.storageKey);
        if (legacy) {
          this.current = readState(legacy);
          this.base = this.current;
          // Preserve the original local copy before migration. Do not upload
          // an untracked old snapshot into an already populated server.
          options.storage.setItem(`${options.storageKey}:recovery-v2`, legacy);
        }
      }
    } catch {
      this.storageOK = false;
    }
  }

  private dirty() {
    return !equal(this.base, this.current);
  }

  private status(message: string) {
    if (!this.stopped)
      this.options.onStatus(
        this.storageOK ? message : '本机保存失败 · 请保持页面打开',
      );
  }

  private persist() {
    try {
      // One atomic localStorage record keeps the pending edits and their base
      // together, including an empty state after deleting the final item.
      this.options.storage.setItem(
        this.key,
        JSON.stringify({
          revision: this.revision,
          base: this.base,
          state: this.current,
          readOnly: this.readOnly,
        }),
      );
      this.storageOK = true;
    } catch {
      this.storageOK = false;
    }
  }

  private publish() {
    this.persist();
    if (!this.stopped) this.options.onState(this.current);
  }

  async start() {
    this.publish();
    this.options.onReadOnly(this.readOnly);
    await this.sync();
  }

  edit(state: PlannerState) {
    if (this.stopped || this.readOnly) return;
    this.current = state;
    this.publish();
    this.status('同步中…');
    clearTimeout(this.timer);
    this.timer = setTimeout(() => {
      void this.sync();
    }, 450);
  }

  stop() {
    this.stopped = true;
    clearTimeout(this.timer);
  }

  sync(): Promise<void> {
    if (this.stopped) return Promise.resolve();
    if (this.running) return this.running;
    this.running = this.synchronize().finally(() => {
      this.running = null;
    });
    return this.running;
  }

  private adopt(remote: RemoteSnapshot, before: PlannerState) {
    if (remote.syncProtocol !== SYNC_PROTOCOL)
      throw new Error('update_required');
    if (!Number.isInteger(remote.revision) || remote.revision < 0)
      throw new Error('invalid_revision');
    const latest = remote.state
      ? readState(JSON.stringify(remote.state))
      : emptyState();
    this.readOnly = remote.readOnly === true;
    if (!this.stopped) this.options.onReadOnly(this.readOnly);
    this.current = this.readOnly
      ? latest
      : rebasePlannerState(before, this.current, latest);
    this.base = latest;
    this.revision = remote.revision;
    this.publish();
  }

  private async synchronize() {
    try {
      const remote = await this.options.get();
      if (this.stopped) return;
      // A genuinely empty server can import a legacy local snapshot. Otherwise
      // only edits made against a recorded baseline are rebased onto the server.
      const before =
        this.revision === -1 && !remote.state ? emptyState() : this.base;
      this.adopt(remote, before);
      for (
        let attempt = 0;
        !this.readOnly && this.dirty() && attempt < 8;
        attempt++
      ) {
        this.status('同步中…');
        const sent = this.current;
        const baseline = this.base;
        const saved = await this.options.put(this.revision, sent);
        if (this.stopped) return;
        // Edits made while PUT was in flight are kept. A conflict applies our
        // changes against the old baseline, a success against the sent state.
        this.adopt(saved, saved.conflict ? baseline : sent);
      }
      this.status(
        this.readOnly
          ? '只读访问'
          : this.dirty()
            ? '本地已保存 · 等待同步'
            : '已同步',
      );
    } catch (error) {
      this.persist();
      this.status(
        error instanceof Error && error.message === 'update_required'
          ? '请刷新页面后继续同步'
          : '本地已保存 · 等待同步',
      );
    }
  }
}
