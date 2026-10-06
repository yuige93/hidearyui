import { calendarDayInfo } from './school-calendar.ts';

export type PlanItem = {
  id: string;
  start: string;
  end: string;
  title: string;
  kind: 'school' | 'family' | 'habit' | 'fun';
  variant?: 'delayed';
  emoji?: string;
  palette?: number;
  cadence?: 'weekly';
  sourceId?: string;
};
export type RecurringPlan = {
  id: string;
  start: string;
  end: string;
  title: string;
  kind: 'family' | 'habit' | 'fun';
  emoji?: string;
  palette?: number;
  weekday: number;
  createdOn: string;
  active: boolean;
};
type DayPlan = {
  key: string;
  weekday: string;
  date: string;
  mood: string;
  items: Omit<PlanItem, 'id'>[];
};
export type TaskCadence = 'once' | 'daily' | 'weekly';
export type Task = {
  id: string;
  title: string;
  done: boolean;
  cadence?: TaskCadence;
  sourceId?: string;
  completionKey?: string;
};
export type RecurringTask = {
  id: string;
  title: string;
  cadence: 'daily' | 'weekly';
  createdOn: string;
  active: boolean;
};
export type TaskCompletion = {
  taskId: string;
  title: string;
  completedAt: string;
};
export type StarSpend = {
  id: string;
  title: string;
  amount: number;
  spentOn: string;
};
export type ClassicProgress = Record<string, Record<string, number>>;
export type PlannerState = {
  version: 4;
  days: Record<string, PlanItem[]>;
  recurringPlans: RecurringPlan[];
  tasks: Record<string, Task[]>;
  recurringTasks: RecurringTask[];
  taskCompletions: Record<string, TaskCompletion>;
  starSpends: StarSpend[];
  classicsProgress: ClassicProgress;
};
export const STORAGE_KEY = 'hidearyui:cosmic-schedule:v1';
export const emptyState = (): PlannerState => ({
  version: 4,
  days: {},
  recurringPlans: [],
  tasks: {},
  recurringTasks: [],
  taskCompletions: {},
  starSpends: [],
  classicsProgress: {},
});
// Fictional demonstration timetable; edit examples/timetable.ts for your own classes.
export { schoolWeek } from '../examples/timetable.ts';
import { schoolWeek } from '../examples/timetable.ts';

export function dateKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}
export function parseDate(value: string) {
  return new Date(`${value}T12:00:00`);
}
export function addDays(value: string, amount: number) {
  const date = parseDate(value);
  date.setDate(date.getDate() + amount);
  return dateKey(date);
}
export function mondayOf(value: string) {
  return addDays(value, -((parseDate(value).getDay() + 6) % 7));
}
export function dateLabel(value: string) {
  const date = parseDate(value);
  return `${date.getMonth() + 1}月${date.getDate()}日`;
}
export function weekdayIndex(value: string) {
  return (parseDate(value).getDay() + 6) % 7;
}
export function taskInstanceKey(task: RecurringTask, date: string) {
  return `${task.id}:${task.cadence === 'daily' ? date : mondayOf(date)}`;
}
export function tasksForDate(state: PlannerState, date: string): Task[] {
  const dated = (state.tasks[date] ?? []).map((task) => ({
    ...task,
    cadence: 'once' as const,
  }));
  const recurring = state.recurringTasks
    .filter((task) => task.active && task.createdOn <= date)
    .map((task) => {
      const completionKey = taskInstanceKey(task, date);
      return {
        id: `repeat:${completionKey}`,
        title: task.title,
        done: !!state.taskCompletions[completionKey],
        cadence: task.cadence,
        sourceId: task.id,
        completionKey,
      } satisfies Task;
    });
  return [...recurring, ...dated];
}
export function starEarnedCount(state: PlannerState) {
  const datedStars = Object.values(state.tasks)
    .flat()
    .filter((task) => task.done).length;
  return datedStars + Object.keys(state.taskCompletions).length;
}
export function starSpentCount(state: PlannerState) {
  return state.starSpends.reduce((sum, spend) => sum + spend.amount, 0);
}
export function starCount(state: PlannerState) {
  return Math.max(0, starEarnedCount(state) - starSpentCount(state));
}
export function hasPlannerData(state: PlannerState) {
  return (
    Object.values(state.days).some((items) =>
      items.some((item) => item.kind !== 'school'),
    ) ||
    state.recurringPlans.length > 0 ||
    Object.values(state.tasks).some((tasks) => tasks.length > 0) ||
    state.recurringTasks.length > 0 ||
    Object.keys(state.taskCompletions).length > 0 ||
    state.starSpends.length > 0 ||
    Object.keys(state.classicsProgress).length > 0
  );
}

function mergeListsById<T extends { id: string }>(
  base: T[],
  incoming: T[],
  incomingWins: boolean,
) {
  const merged = new Map(base.map((item) => [item.id, item]));
  for (const item of incoming)
    if (incomingWins || !merged.has(item.id)) merged.set(item.id, item);
  return [...merged.values()];
}

export function mergePlannerStates(
  base: PlannerState,
  incoming: PlannerState,
  incomingWins = false,
): PlannerState {
  const days: PlannerState['days'] = {};
  for (const date of new Set([
    ...Object.keys(base.days),
    ...Object.keys(incoming.days),
  ]))
    days[date] = mergeListsById(
      (base.days[date] ?? []).filter((item) => item.kind !== 'school'),
      (incoming.days[date] ?? []).filter((item) => item.kind !== 'school'),
      incomingWins,
    );
  const tasks: PlannerState['tasks'] = {};
  for (const date of new Set([
    ...Object.keys(base.tasks),
    ...Object.keys(incoming.tasks),
  ]))
    tasks[date] = mergeListsById(
      base.tasks[date] ?? [],
      incoming.tasks[date] ?? [],
      incomingWins,
    );
  const classicsProgress: ClassicProgress = {};
  for (const nodeId of new Set([
    ...Object.keys(base.classicsProgress),
    ...Object.keys(incoming.classicsProgress),
  ])) {
    classicsProgress[nodeId] = {};
    for (const milestoneId of new Set([
      ...Object.keys(base.classicsProgress[nodeId] ?? {}),
      ...Object.keys(incoming.classicsProgress[nodeId] ?? {}),
    ]))
      classicsProgress[nodeId][milestoneId] = Math.max(
        base.classicsProgress[nodeId]?.[milestoneId] ?? 0,
        incoming.classicsProgress[nodeId]?.[milestoneId] ?? 0,
      );
  }
  return {
    version: 4,
    days,
    recurringPlans: mergeListsById(
      base.recurringPlans,
      incoming.recurringPlans,
      incomingWins,
    ),
    tasks,
    recurringTasks: mergeListsById(
      base.recurringTasks,
      incoming.recurringTasks,
      incomingWins,
    ),
    taskCompletions: incomingWins
      ? { ...base.taskCompletions, ...incoming.taskCompletions }
      : { ...incoming.taskCompletions, ...base.taskCompletions },
    starSpends: mergeListsById(
      base.starSpends,
      incoming.starSpends,
      incomingWins,
    ),
    classicsProgress,
  };
}
export function dayItems(state: PlannerState, date: string): PlanItem[] {
  const scheduleIndex = calendarDayInfo(date).schoolScheduleIndex;
  const schoolItems =
    scheduleIndex !== null
      ? schoolWeek[scheduleIndex].items.map((item, i) => ({
          ...item,
          kind: 'school' as const,
          id: `${date}-school-${i}`,
        }))
      : [];
  const personalItems = (state.days[date] ?? []).filter(
    (item) => item.kind !== 'school',
  );
  const recurringItems = state.recurringPlans
    .filter(
      (item) =>
        item.active &&
        item.createdOn <= date &&
        item.weekday === weekdayIndex(date),
    )
    .map(
      (item) =>
        ({
          id: `repeat:${item.id}:${date}`,
          sourceId: item.id,
          cadence: 'weekly',
          start: item.start,
          end: item.end,
          title: item.title,
          kind: item.kind,
          emoji: item.emoji,
          palette: item.palette,
        }) satisfies PlanItem,
    );
  return [...schoolItems, ...recurringItems, ...personalItems]
    .slice()
    .sort((a, b) => a.start.localeCompare(b.start));
}
export function toMinutes(value: string) {
  const [h, m] = value.split(':').map(Number);
  return h * 60 + m;
}
export function formatTime(minutes: number) {
  return `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;
}
export function validDate(value: string): boolean {
  return (
    /^\d{4}-\d{2}-\d{2}$/.test(value) &&
    Number.isFinite(parseDate(value).getTime()) &&
    dateKey(parseDate(value)) === value
  );
}
export function planError(
  item: Pick<PlanItem, 'start' | 'end' | 'title'>,
  others: PlanItem[],
) {
  if (!item.title.trim()) return '请写下想安排的事情。';
  if (item.title.trim().length > 60) return '安排名称请控制在 60 个字以内。';
  if (
    ![item.start, item.end].every((time) =>
      /^([01]\d|2[0-3]):[0-5]\d$/.test(time),
    )
  )
    return '请填写完整的开始和结束时间。';
  const start = toMinutes(item.start),
    end = toMinutes(item.end);
  if (start < 510 || end > 1200) return '这张课程表支持 08:30—20:00 的安排。';
  if (end - start < 15) return '结束时间至少要比开始时间晚 15 分钟。';
  const conflict = others.find(
    (other) => start < toMinutes(other.end) && end > toMinutes(other.start),
  );
  if (conflict)
    return `与「${conflict.title}」${conflict.start}—${conflict.end} 重叠，请调整时间。`;
  return '';
}
export function readState(raw: string): PlannerState {
  const value = JSON.parse(raw);
  const record = (v: unknown): v is Record<string, unknown> =>
    typeof v === 'object' && v !== null && !Array.isArray(v);
  if (
    !record(value) ||
    ![1, 2, 3, 4].includes(Number(value.version)) ||
    !record(value.days) ||
    !record(value.tasks)
  )
    throw new Error('不支持的计划文件');
  for (const [date, items] of Object.entries(value.days)) {
    if (!validDate(date) || !Array.isArray(items))
      throw new Error('安排日期无效');
    const ids = new Set<string>();
    for (const item of items) {
      if (
        !record(item) ||
        typeof item.id !== 'string' ||
        ids.has(item.id) ||
        typeof item.title !== 'string' ||
        typeof item.start !== 'string' ||
        typeof item.end !== 'string' ||
        !['school', 'family', 'habit', 'fun'].includes(String(item.kind)) ||
        (item.emoji !== undefined &&
          (typeof item.emoji !== 'string' || item.emoji.length > 8)) ||
        (item.palette !== undefined &&
          (!Number.isInteger(item.palette) ||
            Number(item.palette) < 0 ||
            Number(item.palette) > 7)) ||
        planError(item as PlanItem, [])
      )
        throw new Error('安排内容无效');
      ids.add(item.id);
    }
    if (items.some((item, i) => planError(item, items.slice(0, i))))
      throw new Error('安排时间重叠');
  }
  for (const [date, tasks] of Object.entries(value.tasks)) {
    if (!validDate(date) || !Array.isArray(tasks))
      throw new Error('任务日期无效');
    const ids = new Set<string>();
    for (const task of tasks) {
      if (
        !record(task) ||
        typeof task.id !== 'string' ||
        ids.has(task.id) ||
        typeof task.title !== 'string' ||
        !task.title.trim() ||
        task.title.length > 60 ||
        typeof task.done !== 'boolean'
      )
        throw new Error('任务内容无效');
      ids.add(task.id);
    }
  }
  const personalDays = Object.fromEntries(
    Object.entries(value.days).map(([date, items]) => [
      date,
      (items as PlanItem[]).filter((item) => item.kind !== 'school'),
    ]),
  );
  if (value.version === 1) {
    return {
      version: 4,
      days: personalDays,
      recurringPlans: [],
      tasks: value.tasks as Record<string, Task[]>,
      recurringTasks: [],
      taskCompletions: {},
      starSpends: [],
      classicsProgress: {},
    };
  }
  if (
    !Array.isArray(value.recurringTasks) ||
    !record(value.taskCompletions) ||
    !record(value.classicsProgress)
  )
    throw new Error('重复任务或学习进度无效');

  const recurringPlans = value.version === 2 ? [] : value.recurringPlans;
  if (!Array.isArray(recurringPlans)) throw new Error('每周安排无效');
  const recurringPlanIds = new Set<string>();
  for (const plan of recurringPlans) {
    if (
      !record(plan) ||
      typeof plan.id !== 'string' ||
      recurringPlanIds.has(plan.id) ||
      typeof plan.title !== 'string' ||
      typeof plan.start !== 'string' ||
      typeof plan.end !== 'string' ||
      !['family', 'habit', 'fun'].includes(String(plan.kind)) ||
      (plan.emoji !== undefined &&
        (typeof plan.emoji !== 'string' || plan.emoji.length > 8)) ||
      (plan.palette !== undefined &&
        (!Number.isInteger(plan.palette) ||
          Number(plan.palette) < 0 ||
          Number(plan.palette) > 7)) ||
      !Number.isInteger(plan.weekday) ||
      Number(plan.weekday) < 0 ||
      Number(plan.weekday) > 6 ||
      typeof plan.createdOn !== 'string' ||
      !validDate(plan.createdOn) ||
      typeof plan.active !== 'boolean' ||
      planError(plan as PlanItem, [])
    )
      throw new Error('每周安排内容无效');
    recurringPlanIds.add(plan.id);
  }
  if (
    recurringPlans.some((plan, index) =>
      planError(
        plan,
        recurringPlans
          .slice(0, index)
          .filter(
            (other) =>
              other.active && plan.active && other.weekday === plan.weekday,
          ),
      ),
    )
  )
    throw new Error('每周安排时间重叠');
  const recurringIds = new Set<string>();
  for (const task of value.recurringTasks) {
    if (
      !record(task) ||
      typeof task.id !== 'string' ||
      recurringIds.has(task.id) ||
      typeof task.title !== 'string' ||
      !task.title.trim() ||
      task.title.length > 60 ||
      !['daily', 'weekly'].includes(String(task.cadence)) ||
      typeof task.active !== 'boolean' ||
      typeof task.createdOn !== 'string' ||
      !validDate(task.createdOn)
    )
      throw new Error('重复任务内容无效');
    recurringIds.add(task.id);
  }
  for (const completion of Object.values(value.taskCompletions)) {
    if (
      !record(completion) ||
      typeof completion.taskId !== 'string' ||
      typeof completion.title !== 'string' ||
      typeof completion.completedAt !== 'string' ||
      !validDate(completion.completedAt)
    )
      throw new Error('星星记录无效');
  }
  const starSpends = value.version === 4 ? value.starSpends : [];
  if (!Array.isArray(starSpends)) throw new Error('星星兑换记录无效');
  const starSpendIds = new Set<string>();
  for (const spend of starSpends) {
    if (
      !record(spend) ||
      typeof spend.id !== 'string' ||
      starSpendIds.has(spend.id) ||
      typeof spend.title !== 'string' ||
      !spend.title.trim() ||
      spend.title.length > 60 ||
      !Number.isInteger(spend.amount) ||
      Number(spend.amount) < 1 ||
      Number(spend.amount) > 999 ||
      typeof spend.spentOn !== 'string' ||
      !validDate(spend.spentOn)
    )
      throw new Error('星星兑换记录无效');
    starSpendIds.add(spend.id);
  }
  for (const milestones of Object.values(value.classicsProgress)) {
    if (!record(milestones)) throw new Error('国学进度无效');
    for (const amount of Object.values(milestones))
      if (!Number.isInteger(amount) || Number(amount) < 0)
        throw new Error('国学里程碑进度无效');
  }
  return {
    ...value,
    version: 4,
    days: personalDays,
    recurringPlans,
    starSpends,
  } as unknown as PlannerState;
}
