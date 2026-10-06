import { emptyState, readState, type PlannerState } from './planner.ts';

type Options = {
  storage: Pick<Storage, 'getItem' | 'setItem'>;
  storageKey: string;
  onState: (state: PlannerState) => void;
  onStatus: (message: string) => void;
  onReadOnly: (readOnly: boolean) => void;
};

// This public edition has no network client or shared server storage.
export class PlannerLocal {
  private blocked = false;
  private preservedRaw: string | null = null;
  private options: Options;
  constructor(options: Options) { this.options = options; }

  start() {
    let raw: string | null;
    try {
      raw = this.options.storage.getItem(this.options.storageKey);
    } catch {
      this.blocked = false;
      this.options.onReadOnly(false);
      this.options.onState(emptyState());
      this.options.onStatus('浏览器存储不可用，当前计划仅在本次页面中保留');
      return;
    }
    this.preservedRaw = raw;
    try {
      const state = raw === null ? emptyState() : readState(raw);
      this.blocked = false;
      this.options.onReadOnly(false);
      this.options.onState(state);
      this.options.onStatus('已保存在当前浏览器');
    } catch {
      // Leave the original value intact so a damaged backup can be recovered.
      this.blocked = true;
      this.options.onReadOnly(true);
      this.options.onStatus('本地计划无法读取，原数据已保留，暂时停止修改');
    }
  }

  backup(state: PlannerState) {
    return this.blocked && this.preservedRaw !== null
      ? this.preservedRaw
      : JSON.stringify(state, null, 2);
  }

  edit(next: PlannerState) {
    if (this.blocked) return;
    const checked = readState(JSON.stringify(next));
    this.options.onState(checked);
    try {
      this.options.storage.setItem(this.options.storageKey, JSON.stringify(checked));
      this.options.onStatus('已保存在当前浏览器');
    } catch {
      this.options.onStatus('保存失败，请导出备份；当前修改仅在本次页面中保留');
    }
  }
}
