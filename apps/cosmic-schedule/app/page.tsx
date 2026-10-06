'use client';

import { useEffect, useRef, useState } from 'react';
import Image from '@/web/image';
import {
  CalendarDays,
  Check,
  ChevronLeft,
  ChevronRight,
  Clock3,
  Download,
  Gift,
  Map,
  Pencil,
  Plus,
  Printer,
  Rocket,
  RotateCcw,
  Settings2,
  Sparkles,
  Star,
  Trash2,
} from 'lucide-react';
import { PlannerLocal } from '@/lib/local-storage';
import { GrowthMap } from '@/components/growth-map';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Progress } from '@/components/ui/progress';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { calendarDayInfo, hasSchoolSchedule } from '@/lib/school-calendar';
import {
  addDays,
  dateKey,
  dateLabel,
  dayItems,
  emptyState,
  formatTime,
  mondayOf,
  parseDate,
  planError,
  schoolWeek,
  starCount,
  starEarnedCount,
  starSpentCount,
  STORAGE_KEY,
  tasksForDate,
  toMinutes,
  validDate,
  weekdayIndex,
  type PlanItem,
  type PlannerState,
  type Task,
} from '@/lib/planner';

// Keep noon compact while giving 15-minute afternoon/evening plans enough room.
const scheduleStart = 510,
  scheduleEnd = 1200,
  lunchStart = 720,
  lunchEnd = 840;
const scale = 1.35,
  lunchHeight = 20,
  morningHeight = (lunchStart - scheduleStart) * scale;
const scheduleHeight =
  morningHeight + lunchHeight + (scheduleEnd - lunchEnd) * scale;
const starBurstParticles = Array.from({ length: 20 }, (_, index) => ({
  angle: `${index * 18 + (index % 2 ? 5 : 0)}deg`,
  distance: `${48 + (index % 4) * 12}px`,
  color: ['#ffd84d', '#fff3a1', '#ff7fb5', '#72ddff', '#aa91ff'][index % 5],
  delay: `${(index % 4) * 0.018}s`,
}));
function minuteToY(minutes: number) {
  if (minutes <= lunchStart) return (minutes - scheduleStart) * scale;
  if (minutes <= lunchEnd)
    return morningHeight + ((minutes - lunchStart) / 120) * lunchHeight;
  return morningHeight + lunchHeight + (minutes - lunchEnd) * scale;
}
function yToMinute(y: number) {
  if (y <= morningHeight) return scheduleStart + y / scale;
  if (y <= morningHeight + lunchHeight)
    return lunchStart + ((y - morningHeight) / lunchHeight) * 120;
  return lunchEnd + (y - morningHeight - lunchHeight) / scale;
}
const lessonSlots = [
  { period: '1', start: '08:45', end: '09:25' },
  { period: '2', start: '09:35', end: '10:15' },
  { period: '3', start: '10:30', end: '11:10' },
  { period: '4', start: '11:20', end: '12:00' },
  { period: '5', start: '14:20', end: '15:00' },
  { period: '6', start: '15:20', end: '16:00' },
];
const planEmojis = [
  '📚',
  '✏️',
  '⚽️',
  '🎹',
  '🎨',
  '🧩',
  '🚲',
  '🚄',
  '🧳',
  '🛝',
  '🌳',
  '🎬',
  '🍜',
  '🚀',
];
const planPaletteCount = 8;
function planPalette(item: PlanItem) {
  if (Number.isInteger(item.palette)) return Number(item.palette);
  return (
    Array.from(item.id).reduce(
      (sum, character) => sum + (character.codePointAt(0) ?? 0),
      0,
    ) % planPaletteCount
  );
}
function subjectClass(item: PlanItem) {
  const title = item.title.replace(/\s/g, '');
  if (item.variant === 'delayed') return 'subject-delayed';
  if (/语文|阅读|国学|共读/.test(title)) return 'subject-chinese';
  if (/数学/.test(title)) return 'subject-math';
  if (/英语|外教/.test(title)) return 'subject-english';
  if (/体育|足球|体活|运动|跳绳|骑行/.test(title)) return 'subject-sport';
  if (/音乐/.test(title)) return 'subject-music';
  if (/美术|手工/.test(title)) return 'subject-art';
  if (/科学/.test(title)) return 'subject-science';
  if (/道法|德育|劳动|国象/.test(title)) return 'subject-other';
  return item.kind === 'school' ? 'subject-routine' : 'subject-personal';
}
type PlanDraft = {
  date: string;
  originalDate?: string;
  item: PlanItem;
  editing: boolean;
  recurrence: 'once' | 'weekly';
  recurringId?: string;
  recurringCreatedOn?: string;
  recurringWeekday?: number;
};
type TaskDraft = {
  date: string;
  task: Task;
  editing: boolean;
  cadence: 'daily' | 'weekly';
  recurringId?: string;
};
type SpendDraft = {
  title: string;
  amount: string;
  spentOn: string;
};
type StarFlight = {
  id: number;
  startX: number;
  startY: number;
  endX: number;
  endY: number;
};

export default function Home({
  storageKey = STORAGE_KEY,
  assetBase = '',
}: {
  storageKey?: string;
  assetBase?: string;
} = {}) {
  const [state, setState] = useState<PlannerState>(emptyState);
  const [ready, setReady] = useState(false);
  const [readOnly, setReadOnly] = useState(false);
  const [storageMessage, setStorageMessage] = useState('正在读取计划…');
  const [selectedDate, setSelectedDate] = useState(() => dateKey(new Date()));
  const [view, setView] = useState('week');
  const [weekendOnly, setWeekendOnly] = useState(false);
  const [planDraft, setPlanDraft] = useState<PlanDraft | null>(null);
  const [taskDraft, setTaskDraft] = useState<TaskDraft | null>(null);
  const [spendDraft, setSpendDraft] = useState<SpendDraft | null>(null);
  const [error, setError] = useState('');
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [notice, setNotice] = useState('');
  const [undo, setUndo] = useState<PlannerState | null>(null);
  const [starFlight, setStarFlight] = useState<StarFlight | null>(null);
  const starTargetRef = useRef<HTMLButtonElement>(null);
  const starFlightIdRef = useRef(0);
  const storeRef = useRef<PlannerLocal | null>(null);
  useEffect(() => {
    const store = new PlannerLocal({
      storage: {
        getItem: (key) => localStorage.getItem(key),
        setItem: (key, value) => localStorage.setItem(key, value),
      },
      storageKey,
      onState: setState,
      onStatus: setStorageMessage,
      onReadOnly: setReadOnly,
    });
    storeRef.current = store;
    store.start();
    setReady(true);
    const reload = (event: StorageEvent) => {
      if (event.storageArea === localStorage && (event.key === storageKey || event.key === null)) {
        store.start();
        setUndo(null);
        setPlanDraft(null);
        setTaskDraft(null);
        setSpendDraft(null);
        setError('');
        setNotice('已读取其他窗口的计划，请重新打开要编辑的安排');
      }
    };
    window.addEventListener('storage', reload);
    return () => {
      if (storeRef.current === store) storeRef.current = null;
      window.removeEventListener('storage', reload);
    };
  }, [storageKey]);

  const weekStart = mondayOf(selectedDate);
  const week = schoolWeek.map((day, index) => {
    const key = addDays(weekStart, index);
    return {
      ...day,
      key,
      date: dateLabel(key),
      calendar: calendarDayInfo(key),
    };
  });
  const activeDay = week[weekdayIndex(selectedDate)];
  const activeCalendar = activeDay.calendar;
  const activeItems = dayItems(state, selectedDate);
  const tasks = tasksForDate(state, selectedDate);
  const completedCount = tasks.filter((task) => task.done).length;
  const earnedStars = starEarnedCount(state);
  const spentStars = starSpentCount(state);
  const fuel = starCount(state);
  const missionLabel =
    tasks.length === 0
      ? '暂无任务'
      : completedCount === tasks.length
        ? '今日任务已完成'
        : `剩余 ${tasks.length - completedCount} 项`;
  const visibleDays = weekendOnly ? week.slice(5) : week;
  const selectedMonth = parseDate(selectedDate);
  const monthStart = dateKey(
    new Date(selectedMonth.getFullYear(), selectedMonth.getMonth(), 1, 12),
  );
  const monthGridStart = addDays(monthStart, -weekdayIndex(monthStart));
  const monthDays = Array.from({ length: 42 }, (_, index) =>
    addDays(monthGridStart, index),
  );
  const monthTitle = `${selectedMonth.getFullYear()}年${selectedMonth.getMonth() + 1}月`;
  const recentSpends = state.starSpends
    .slice()
    .sort((a, b) =>
      a.spentOn === b.spentOn
        ? b.id.localeCompare(a.id)
        : b.spentOn.localeCompare(a.spentOn),
    );

  function change(next: PlannerState, message: string) {
    if (readOnly) {
      setUndo(null);
      setNotice('本地数据暂时无法读取，请先导出备份或检查浏览器存储');
      return;
    }
    setUndo(state);
    storeRef.current?.edit(next);
    setNotice(message);
  }
  function goToday() {
    setSelectedDate(dateKey(new Date()));
    setWeekendOnly(false);
  }
  function moveMonth(amount: number) {
    const date = parseDate(selectedDate);
    date.setDate(1);
    date.setMonth(date.getMonth() + amount);
    setSelectedDate(dateKey(date));
  }
  function openPlan(
    date = selectedDate,
    minute = hasSchoolSchedule(date) ? 1020 : 570,
    item?: PlanItem,
  ) {
    if (readOnly) {
      setNotice('本地数据暂时无法读取，请先导出备份或检查浏览器存储');
      return;
    }
    const recurringPlan = item?.sourceId
      ? state.recurringPlans.find((plan) => plan.id === item.sourceId)
      : undefined;
    const start = Math.max(
      scheduleStart,
      Math.min(scheduleEnd - 30, Math.round(minute / 15) * 15),
    );
    setError('');
    setPlanDraft({
      date,
      originalDate: item ? date : undefined,
      editing: !!item,
      recurrence: item?.cadence === 'weekly' ? 'weekly' : 'once',
      recurringId: item?.sourceId,
      recurringCreatedOn: recurringPlan?.createdOn,
      recurringWeekday: recurringPlan?.weekday,
      item: item
        ? { ...item }
        : {
            id: crypto.randomUUID(),
            title: '',
            start: formatTime(start),
            end: formatTime(start + 30),
            kind: 'family',
            emoji: hasSchoolSchedule(date) ? '📚' : '🌈',
            palette:
              crypto.getRandomValues(new Uint32Array(1))[0] % planPaletteCount,
          },
    });
  }
  function savePlan() {
    if (readOnly) return;
    if (!planDraft) return;
    const {
      date,
      originalDate,
      item,
      recurrence,
      recurringId,
      recurringCreatedOn,
      recurringWeekday,
    } = planDraft;
    if (!validDate(date)) {
      setError('请选择有效日期。');
      return;
    }
    if (hasSchoolSchedule(date) && toMinutes(item.start) < 960) {
      setError('工作日请安排在16:00以后。');
      return;
    }
    const others = dayItems(state, date).filter(
      (other) =>
        other.id !== item.id &&
        (!recurringId || other.sourceId !== recurringId),
    );
    const message = planError(item, others);
    if (message) {
      setError(message);
      return;
    }
    const days = { ...state.days };
    if (originalDate && !recurringId)
      days[originalDate] = (state.days[originalDate] ?? []).filter(
        (other) => other.kind !== 'school' && other.id !== item.id,
      );

    const kind = item.kind === 'school' ? 'family' : item.kind;
    const normalizedItem: PlanItem = {
      id: recurringId ?? item.id,
      title: item.title.trim(),
      start: item.start,
      end: item.end,
      kind,
      emoji: item.emoji,
      palette: item.palette,
    };
    const recurringPlans = state.recurringPlans.filter(
      (plan) => plan.id !== recurringId,
    );

    if (recurrence === 'weekly') {
      const weekday = weekdayIndex(date);
      const createdOn =
        recurringId &&
        recurringCreatedOn &&
        recurringWeekday === weekday &&
        recurringCreatedOn < date
          ? recurringCreatedOn
          : date;
      recurringPlans.push({
        ...normalizedItem,
        kind: kind as 'family' | 'habit' | 'fun',
        weekday,
        createdOn,
        active: true,
      });
    } else {
      const current = (days[date] ?? []).filter(
        (other) => other.kind !== 'school',
      );
      days[date] = [
        ...current.filter((other) => other.id !== normalizedItem.id),
        normalizedItem,
      ];
    }
    change(
      { ...state, days, recurringPlans },
      recurrence === 'weekly'
        ? planDraft.editing
          ? '每周安排已调整，可撤销'
          : '已加入每周安排，以后会自动出现'
        : planDraft.editing
          ? '安排已调整，可撤销'
          : '新安排已加入计划',
    );
    setSelectedDate(date);
    if (weekdayIndex(date) < 5) setWeekendOnly(false);
    if (view === 'jar' || date !== dateKey(new Date())) setView('week');
    setPlanDraft(null);
  }
  function deletePlan() {
    if (readOnly) return;
    if (!planDraft?.originalDate) return;
    if (planDraft.recurringId) {
      change(
        {
          ...state,
          recurringPlans: state.recurringPlans.filter(
            (plan) => plan.id !== planDraft.recurringId,
          ),
        },
        '每周安排已删除，可撤销',
      );
      setPlanDraft(null);
      return;
    }
    const date = planDraft.originalDate;
    change(
      {
        ...state,
        days: {
          ...state.days,
          [date]: (state.days[date] ?? []).filter(
            (item) => item.kind !== 'school' && item.id !== planDraft.item.id,
          ),
        },
      },
      '已移除这一天的安排，可撤销',
    );
    setPlanDraft(null);
  }
  function openTask(task?: Task, title = '') {
    if (readOnly) {
      setNotice('本地数据暂时无法读取，请先导出备份或检查浏览器存储');
      return;
    }
    setError('');
    setTaskDraft({
      date: selectedDate,
      editing: !!task,
      cadence: task?.cadence === 'weekly' ? 'weekly' : 'daily',
      recurringId: task?.sourceId,
      task: task
        ? { ...task }
        : { id: crypto.randomUUID(), title, done: false },
    });
  }
  function saveTask() {
    if (readOnly) return;
    if (!taskDraft) return;
    const title = taskDraft.task.title.trim();
    if (!title || title.length > 60) {
      setError('请填写 1—60 个字的任务名称。');
      return;
    }
    if (taskDraft.editing && !taskDraft.recurringId) {
      const current = state.tasks[taskDraft.date] ?? [];
      change(
        {
          ...state,
          tasks: {
            ...state.tasks,
            [taskDraft.date]: current.map((task) =>
              task.id === taskDraft.task.id
                ? { ...taskDraft.task, title }
                : task,
            ),
          },
        },
        '这一天的任务已调整',
      );
    } else {
      const id = taskDraft.recurringId ?? taskDraft.task.id;
      const recurringTask = {
        id,
        title,
        cadence: taskDraft.cadence,
        createdOn: taskDraft.date,
        active: true,
      } as const;
      change(
        {
          ...state,
          recurringTasks: taskDraft.recurringId
            ? state.recurringTasks.map((task) =>
                task.id === taskDraft.recurringId
                  ? { ...task, title, cadence: taskDraft.cadence }
                  : task,
              )
            : [...state.recurringTasks, recurringTask],
        },
        taskDraft.cadence === 'daily'
          ? '日任务已保存，每天会出现一次'
          : '周任务已保存，每周会出现一次',
      );
    }
    setTaskDraft(null);
  }
  function playStarSound() {
    const AudioContextType =
      window.AudioContext ||
      (window as typeof window & { webkitAudioContext?: typeof AudioContext })
        .webkitAudioContext;
    if (!AudioContextType) return;
    const audio = new AudioContextType();
    const notes = [880, 1174.66, 1567.98];
    notes.forEach((frequency, index) => {
      const oscillator = audio.createOscillator();
      const gain = audio.createGain();
      const start = audio.currentTime + index * 0.075;
      oscillator.type = index === 2 ? 'triangle' : 'sine';
      oscillator.frequency.setValueAtTime(frequency, start);
      oscillator.frequency.exponentialRampToValueAtTime(
        frequency * 1.08,
        start + 0.14,
      );
      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.exponentialRampToValueAtTime(0.12, start + 0.012);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.3);
      oscillator.connect(gain);
      gain.connect(audio.destination);
      oscillator.start(start);
      oscillator.stop(start + 0.32);
      if (index === notes.length - 1)
        oscillator.addEventListener('ended', () => void audio.close());
    });
  }
  function celebrateTask(source: HTMLElement) {
    const target = starTargetRef.current;
    if (!target) return;
    const from = source.getBoundingClientRect();
    const to = target.getBoundingClientRect();
    setStarFlight({
      id: ++starFlightIdRef.current,
      startX: from.left + Math.min(34, from.width / 2),
      startY: from.top + from.height / 2,
      endX: to.left + to.width / 2,
      endY: to.top + to.height / 2,
    });
    playStarSound();
    window.setTimeout(() => setStarFlight(null), 1120);
  }
  function toggleTask(task: Task, source: HTMLElement) {
    if (readOnly) {
      setNotice('本地数据暂时无法读取，请先导出备份或检查浏览器存储');
      return;
    }
    const completing = !task.done;
    if (!completing && fuel === 0) {
      setNotice('这些星星已经兑换成奖励啦，暂时不能取消这次完成');
      setUndo(null);
      return;
    }
    if (task.completionKey && task.sourceId) {
      const taskCompletions = { ...state.taskCompletions };
      if (task.done) delete taskCompletions[task.completionKey];
      else
        taskCompletions[task.completionKey] = {
          taskId: task.sourceId,
          title: task.title,
          completedAt: dateKey(new Date()),
        };
      change(
        { ...state, taskCompletions },
        completing ? '叮！星星已经收进罐子' : '已取消这次完成',
      );
    } else {
      change(
        {
          ...state,
          tasks: {
            ...state.tasks,
            [selectedDate]: (state.tasks[selectedDate] ?? []).map((item) =>
              item.id === task.id ? { ...item, done: !item.done } : item,
            ),
          },
        },
        completing ? '叮！星星已经收进罐子' : '已取消这次完成',
      );
    }
    if (completing) celebrateTask(source);
  }
  function openSpend() {
    if (readOnly) {
      setNotice('本地数据暂时无法读取，请先导出备份或检查浏览器存储');
      return;
    }
    setError('');
    setSpendDraft({
      title: '',
      amount: String(Math.min(10, Math.max(1, fuel))),
      spentOn: dateKey(new Date()),
    });
  }
  function saveSpend() {
    if (readOnly) return;
    if (!spendDraft) return;
    const title = spendDraft.title.trim();
    const amount = Number(spendDraft.amount);
    if (!title || title.length > 60) {
      setError('请写下这次星星变成了什么。');
      return;
    }
    if (!Number.isInteger(amount) || amount < 1 || amount > 999) {
      setError('每次兑换数量需要是 1—999 颗的整数。');
      return;
    }
    if (amount > fuel) {
      setError(`罐子里现在有 ${fuel} 颗星，请减少兑换数量。`);
      return;
    }
    if (!validDate(spendDraft.spentOn)) {
      setError('请选择有效的兑换日期。');
      return;
    }
    change(
      {
        ...state,
        starSpends: [
          ...state.starSpends,
          {
            id: crypto.randomUUID(),
            title,
            amount,
            spentOn: spendDraft.spentOn,
          },
        ],
      },
      `兑换成功！${amount}颗星星变成了「${title}」`,
    );
    setSpendDraft(null);
  }
  function restoreSpend(id: string, title: string) {
    if (readOnly) return;
    change(
      {
        ...state,
        starSpends: state.starSpends.filter((spend) => spend.id !== id),
      },
      `「${title}」的星星已退回罐子`,
    );
  }
  function exportBackup() {
    const url = URL.createObjectURL(
      new Blob([storeRef.current?.backup(state) ?? JSON.stringify(state, null, 2)], { type: 'application/json' }),
    );
    const link = document.createElement('a');
    link.href = url;
    link.download = `宇宙课程表-${dateKey(new Date())}.json`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  function taskList(large = false) {
    return (
      <div className={large ? 'large-task-list' : 'task-list'}>
        {tasks.length === 0 && (
          <div className="empty-state">
            <Star />
            <strong>暂无任务</strong>
          </div>
        )}
        {tasks.map((task) => (
          <div className="editable-task" key={task.id}>
            <button
              type="button"
              aria-pressed={task.done}
              className={`${large ? 'large-task' : 'task-row'} ${task.done ? 'is-done' : ''}`}
              onClick={(event) => toggleTask(task, event.currentTarget)}
            >
              <span className={large ? 'large-check' : 'check-orbit'}>
                {task.done && <Check />}
              </span>
              <span>
                <strong>{task.title}</strong>
                <small>
                  {task.done
                    ? '已完成'
                    : task.cadence === 'weekly'
                      ? '本周完成一次 · ＋1颗星'
                      : task.cadence === 'daily'
                        ? '每天完成一次 · ＋1颗星'
                        : '做好了，就收下一颗星'}
                </small>
              </span>
            </button>
            <Button
              size="icon"
              variant="ghost"
              aria-label={`编辑任务：${task.title}`}
              onClick={() => openTask(task)}
            >
              <Pencil />
            </Button>
          </div>
        ))}
        <Button
          variant="outline"
          className="add-task-button"
          onClick={() => openTask()}
        >
          <Plus /> 添加学习任务
        </Button>
      </div>
    );
  }

  if (!ready)
    return (
      <main className="loading-planner">
        <Rocket />
        <p>正在打开宇宙计划站…</p>
      </main>
    );
  return (
    <main className={`app-shell ${readOnly ? 'is-readonly' : ''}`}>
      <Tabs value={view} onValueChange={setView} className="app-frame">
        <header className="topbar">
          <div className="brand">
            <span className="brand-mark">
              <Rocket />
            </span>
            <span>
              <strong>宇宙课程表</strong>
            </span>
          </div>
          <TabsList className="view-tabs" aria-label="切换视图">
            <TabsTrigger value="week">
              <CalendarDays /> 周计划
            </TabsTrigger>
            <TabsTrigger value="month">
              <CalendarDays /> 月历
            </TabsTrigger>
            <TabsTrigger value="growth">
              <Map /> 成长地图
            </TabsTrigger>
            <TabsTrigger value="jar">
              <Star /> 星星罐
            </TabsTrigger>
          </TabsList>
          <div className="top-actions">
            {readOnly && <span className="readonly-badge">只读</span>}
            <button
              ref={starTargetRef}
              type="button"
              className={`fuel-pill ${starFlight ? 'is-catching' : ''}`}
              aria-label={`打开星星罐，已经收集${fuel}颗星`}
              onClick={() => setView('jar')}
            >
              <Star className="fill-current" />
              <strong>{fuel}</strong>
              <span>颗星</span>
            </button>
            <Button
              variant="ghost"
              size="icon"
              aria-label="打印本周计划"
              onClick={() => {
                setView('week');
                setWeekendOnly(false);
                requestAnimationFrame(() =>
                  requestAnimationFrame(() => window.print()),
                );
              }}
            >
              <Printer />
            </Button>
            <Button
              variant="outline"
              className="settings-button"
              aria-label="打开计划设置"
              onClick={() => setSettingsOpen(true)}
            >
              <Settings2 />
              <span>设置</span>
            </Button>
          </div>
        </header>
        <TabsContent value="week" className="main-content">
          <section className="week-hero">
            <div className="hero-copy">
              <p className="school-name">星际小学 · 示例课表</p>
              <h1>宇宙课程表</h1>
              <div className="identity">
                <span>
                  小小宇航员：<b>小星</b>
                </span>
                <span>一年级（1）班</span>
                <span>示例课程</span>
              </div>
            </div>
            <Image
              className="space-art"
              src={`${assetBase}/art/space-header.svg`}
              alt="火箭飞向星球的宇宙图案"
              width="280"
              height="105"
            />

            <div className="week-switcher">
              <Button
                variant="ghost"
                size="icon"
                aria-label="上一周"
                onClick={() => setSelectedDate(addDays(selectedDate, -7))}
              >
                <ChevronLeft />
              </Button>
              <strong>
                {dateLabel(weekStart)} — {dateLabel(addDays(weekStart, 6))}
              </strong>
              <Button
                variant="ghost"
                size="icon"
                aria-label="下一周"
                onClick={() => setSelectedDate(addDays(selectedDate, 7))}
              >
                <ChevronRight />
              </Button>
              <span className="week-switcher-actions">
                <Button
                  variant="ghost"
                  size="sm"
                  className="week-action-button"
                  onClick={goToday}
                >
                  今天
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className={`week-action-button ${weekendOnly ? 'is-active' : ''}`}
                  aria-pressed={weekendOnly}
                  onClick={() => {
                    setWeekendOnly(!weekendOnly);
                    if (!weekendOnly && weekdayIndex(selectedDate) < 5)
                      setSelectedDate(addDays(weekStart, 5));
                  }}
                >
                  周末
                </Button>
              </span>
            </div>
          </section>
          <div className="mobile-day-picker" aria-label="选择一天">
            {week.map((day) => (
              <button
                key={day.key}
                className={`${day.calendar.isDayOff ? 'is-day-off' : ''} ${day.calendar.officialWorkday ? 'is-workday' : ''}`}
                aria-pressed={selectedDate === day.key}
                onClick={() => setSelectedDate(day.key)}
              >
                <small>{day.weekday}</small>
                <strong>{day.date}</strong>
                {(day.calendar.schoolScheduleLabel ||
                  day.calendar.holiday ||
                  day.calendar.solarTerm) && (
                  <i>
                    {day.calendar.schoolScheduleLabel ??
                      (day.calendar.holiday
                        ? `${day.calendar.holiday}休`
                        : day.calendar.solarTerm)}
                  </i>
                )}
              </button>
            ))}
          </div>
          <div className="week-layout">
            <section
              className={`calendar-board ${weekendOnly ? 'weekend-board' : ''}`}
              aria-label="本周计划"
            >
              <div className="schedule-scroll">
                <div className="schedule-head-row">
                  <span className="time-head">
                    <b>节次</b>
                    <small>时间</small>
                  </span>
                  {visibleDays.map((day) => (
                    <button
                      key={day.key}
                      type="button"
                      className={`schedule-day-head ${selectedDate === day.key ? 'is-active' : ''} ${day.calendar.isDayOff ? 'is-day-off' : ''} ${day.calendar.officialWorkday ? 'is-workday' : ''}`}
                      onClick={() => setSelectedDate(day.key)}
                    >
                      <span className="day-heading-copy">
                        <strong>{day.weekday}</strong>
                        <small>{day.date}</small>
                      </span>
                      <span className="day-markers">
                        {day.calendar.solarTerm && (
                          <i className="solar-term-marker">
                            {day.calendar.solarTerm}
                          </i>
                        )}
                        <em
                          className={
                            day.calendar.isDayOff
                              ? 'holiday-marker'
                              : day.calendar.officialWorkday
                                ? 'workday-marker'
                                : ''
                          }
                        >
                          {day.calendar.schoolScheduleLabel ??
                            (day.calendar.holiday
                              ? `${day.calendar.holiday}休`
                              : day.calendar.officialWorkday
                                ? '调休上班'
                                : day.key === dateKey(new Date())
                                  ? '今天'
                                  : day.mood)}
                        </em>
                      </span>
                    </button>
                  ))}
                </div>
                <div
                  className="schedule-grid"
                  style={{ height: scheduleHeight }}
                >
                  <div className="lesson-guides" aria-hidden="true">
                    {lessonSlots.map((slot) => (
                      <span
                        key={slot.period}
                        style={{
                          top: minuteToY(toMinutes(slot.start)),
                          height:
                            minuteToY(toMinutes(slot.end)) -
                            minuteToY(toMinutes(slot.start)),
                        }}
                      />
                    ))}
                  </div>
                  <div
                    className="lunch-band"
                    style={{ top: morningHeight, height: lunchHeight }}
                    aria-hidden="true"
                  />
                  <div className="time-axis">
                    {lessonSlots.map((slot) => (
                      <span
                        className="lesson-axis-cell"
                        key={slot.period}
                        style={{
                          top: minuteToY(toMinutes(slot.start)),
                          height:
                            minuteToY(toMinutes(slot.end)) -
                            minuteToY(toMinutes(slot.start)),
                        }}
                      >
                        <b>{slot.period}</b>
                        <small>
                          {slot.start}—{slot.end}
                        </small>
                      </span>
                    ))}
                    <span
                      className="lunch-axis"
                      style={{ top: morningHeight, height: lunchHeight }}
                      aria-hidden="true"
                    />
                    {['16:00', '17:00', '18:00', '19:00'].map((time) => (
                      <span
                        className="evening-tick"
                        key={time}
                        style={{ top: minuteToY(toMinutes(time)) }}
                      >
                        {time}
                      </span>
                    ))}
                  </div>
                  <div className="schedule-days-layer">
                    {visibleDays.map((day) => {
                      const weekend = weekdayIndex(day.key) >= 5;
                      const schoolDay =
                        day.calendar.schoolScheduleIndex !== null;
                      const addTop = schoolDay ? minuteToY(960) : 0;
                      return (
                        <div
                          key={day.key}
                          className={`schedule-day-column ${weekend ? 'is-weekend' : ''} ${day.calendar.isDayOff ? 'is-day-off' : ''} ${day.calendar.officialWorkday ? 'is-workday' : ''} ${selectedDate === day.key ? 'is-active' : ''}`}
                        >
                          {day.calendar.holiday && (
                            <span className="day-off-watermark">
                              {day.calendar.holiday}假期
                            </span>
                          )}
                          <button
                            type="button"
                            className="add-slot"
                            style={{ top: addTop }}
                            aria-label={`为${day.weekday}${schoolDay ? '放学后' : ''}添加安排`}
                            onClick={(event) => {
                              setSelectedDate(day.key);
                              if (event.detail === 0) openPlan(day.key);
                              else
                                openPlan(
                                  day.key,
                                  yToMinute(
                                    addTop +
                                      event.clientY -
                                      event.currentTarget.getBoundingClientRect()
                                        .top,
                                  ),
                                );
                            }}
                          />
                          {dayItems(state, day.key).map((item) => {
                            const eventStyle = {
                              top: minuteToY(toMinutes(item.start)) + 1,
                              height: Math.max(
                                1,
                                minuteToY(toMinutes(item.end)) -
                                  minuteToY(toMinutes(item.start)) -
                                  2,
                              ),
                            };
                            const content = (
                              <strong>
                                {item.emoji && (
                                  <i className="event-emoji">{item.emoji}</i>
                                )}
                                {item.title}
                                {item.cadence === 'weekly' && (
                                  <i className="weekly-plan-mark">每周</i>
                                )}
                              </strong>
                            );
                            if (item.kind === 'school')
                              return (
                                <div
                                  key={item.id}
                                  className={`schedule-event is-course ${subjectClass(item)}`}
                                  style={eventStyle}
                                  title={`${item.start}—${item.end} ${item.title}`}
                                >
                                  {content}
                                </div>
                              );
                            return (
                              <button
                                key={item.id}
                                type="button"
                                className={`schedule-event is-personal-plan plan-palette-${planPalette(item)} ${subjectClass(item)}`}
                                style={eventStyle}
                                onClick={(event) => {
                                  event.stopPropagation();
                                  setSelectedDate(day.key);
                                  openPlan(
                                    day.key,
                                    toMinutes(item.start),
                                    item,
                                  );
                                }}
                                title={`${item.start}—${item.end} ${item.title}`}
                                aria-label={`编辑${day.weekday} ${item.start} ${item.title}`}
                              >
                                {content}
                              </button>
                            );
                          })}
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
              <div className="legend">
                {[
                  ['chinese', '语文'],
                  ['math', '数学'],
                  ['english', '英语'],
                  ['sport', '运动'],
                  ['music', '音乐'],
                  ['art', '艺术'],
                  ['science', '科学'],
                  ['other', '综合'],
                  ['delayed', '延时课'],
                  ['personal', '家庭计划'],
                ].map(([kind, label]) => (
                  <span key={kind}>
                    <i className={`dot subject-${kind}`} />
                    {label}
                  </span>
                ))}
                <span className="add-hint">
                  午间 12:00—14:00 已缩小 · 左右滑动看整周
                </span>
              </div>
            </section>
            <aside className="today-panel">
              <div className="today-heading">
                <div>
                  <p>{activeDay.date}</p>
                  <h2>
                    {activeDay.weekday} ·{' '}
                    {activeCalendar.schoolScheduleLabel ??
                      (activeCalendar.holiday
                        ? `${activeCalendar.holiday}假期`
                        : weekdayIndex(selectedDate) >= 5
                          ? '周末小远征'
                          : activeDay.mood)}
                  </h2>
                  {activeCalendar.solarTerm && (
                    <small className="today-solar-term">
                      今日节气 · {activeCalendar.solarTerm}
                    </small>
                  )}
                </div>
                <span className="planet-badge">
                  <Rocket />
                </span>
              </div>
              <div className="day-timeline">
                {activeItems.length === 0 ? (
                  <div className="empty-state">
                    <CalendarDays />
                    <strong>
                      {activeCalendar.holiday
                        ? `${activeCalendar.holiday}假期`
                        : '暂无安排'}
                    </strong>
                  </div>
                ) : (
                  activeItems.map((item) => (
                    <button
                      className={`timeline-row ${item.kind === 'school' ? 'is-readonly' : ''}`}
                      key={item.id}
                      disabled={item.kind === 'school'}
                      onClick={
                        item.kind === 'school'
                          ? undefined
                          : () =>
                              openPlan(
                                selectedDate,
                                toMinutes(item.start),
                                item,
                              )
                      }
                    >
                      <span>
                        {item.start}
                        <small>{item.end}</small>
                      </span>
                      <i className={subjectClass(item)} />
                      <strong>
                        {item.emoji ? `${item.emoji} ` : ''}
                        {item.title}
                        {item.cadence === 'weekly' && (
                          <i className="weekly-plan-mark">每周</i>
                        )}
                      </strong>
                      {item.kind !== 'school' && <Pencil />}
                    </button>
                  ))
                )}
              </div>
              <div className="focus-box">
                <div className="focus-title">
                  <span>
                    <Sparkles /> 当日学习任务
                  </span>
                  <strong>
                    {completedCount}/{tasks.length}
                  </strong>
                </div>
                <Progress
                  value={
                    tasks.length ? (completedCount / tasks.length) * 100 : 0
                  }
                  className="mission-progress"
                />
                <p>{missionLabel}</p>
                {taskList()}
              </div>
            </aside>
          </div>
        </TabsContent>
        <TabsContent value="growth" className="main-content growth-content">
          <GrowthMap
            classicsProgress={state.classicsProgress}
            onClassicProgressChange={(nodeId, milestoneId, amount) => {
              change(
                {
                  ...state,
                  classicsProgress: {
                    ...state.classicsProgress,
                    [nodeId]: {
                      ...state.classicsProgress[nodeId],
                      [milestoneId]: Math.max(0, amount),
                    },
                  },
                },
                '国学里程碑进度已保存',
              );
            }}
          />
        </TabsContent>
        <TabsContent value="month" className="main-content month-content">
          <section className="month-page">
            <header className="month-header">
              <Button
                variant="ghost"
                size="icon"
                aria-label="上个月"
                onClick={() => moveMonth(-1)}
              >
                <ChevronLeft />
              </Button>
              <h1>{monthTitle}</h1>
              <Button
                variant="ghost"
                size="icon"
                aria-label="下个月"
                onClick={() => moveMonth(1)}
              >
                <ChevronRight />
              </Button>
              <Button variant="outline" size="sm" onClick={goToday}>
                本月
              </Button>
            </header>
            <div className="month-weekdays" aria-hidden="true">
              {schoolWeek.map((day) => (
                <span key={day.key}>{day.weekday}</span>
              ))}
            </div>
            <div className="month-grid">
              {monthDays.map((day) => {
                const dayDate = parseDate(day);
                const calendar = calendarDayInfo(day);
                const personal = dayItems(state, day).filter(
                  (item) => item.kind !== 'school',
                );
                const dayTasks = tasksForDate(state, day);
                const doneTasks = dayTasks.filter((task) => task.done).length;
                const outside = dayDate.getMonth() !== selectedMonth.getMonth();
                const weekend = weekdayIndex(day) >= 5;
                return (
                  <button
                    key={day}
                    type="button"
                    className={`month-day ${outside ? 'is-outside' : ''} ${weekend ? 'is-weekend' : ''} ${calendar.isDayOff ? 'is-day-off' : ''} ${calendar.officialWorkday ? 'is-workday' : ''} ${day === dateKey(new Date()) ? 'is-today' : ''}`}
                    onClick={() => {
                      setSelectedDate(day);
                      setWeekendOnly(false);
                      setView('week');
                    }}
                  >
                    <span className="month-date-line">
                      <span className="month-date">{dayDate.getDate()}</span>
                      {(calendar.schoolScheduleLabel ||
                        calendar.holiday ||
                        calendar.solarTerm) && (
                        <i>
                          {calendar.schoolScheduleLabel ??
                            (calendar.holiday
                              ? `${calendar.holiday}休`
                              : calendar.solarTerm)}
                        </i>
                      )}
                    </span>
                    <span className="month-events">
                      {personal.slice(0, 3).map((item) => (
                        <i
                          className={`plan-palette-${planPalette(item)}`}
                          key={item.id}
                        >
                          {item.emoji && <b>{item.emoji}</b>}
                          {item.title}
                        </i>
                      ))}
                      {personal.length > 3 && <i>＋{personal.length - 3}</i>}
                    </span>
                    {dayTasks.length > 0 && (
                      <span className="month-tasks">
                        <Star /> {doneTasks}/{dayTasks.length}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </section>
        </TabsContent>
        <TabsContent value="jar" className="main-content narrow-content">
          <section className="star-jar-page">
            <header className="jar-page-heading">
              <div>
                <h1>星星罐</h1>
                <p>认真攒下的星星，也可以在商量好的时刻变成小奖励。</p>
              </div>
              <Button onClick={openSpend} disabled={fuel === 0}>
                <Gift /> 兑换奖励
              </Button>
            </header>
            <div className="jar-stage" aria-label={`星星罐里有${fuel}颗星`}>
              <div className="star-jar-lid" />
              <div className="star-jar">
                <div className="jar-shine" />
                <div className="jar-stars" aria-hidden="true">
                  {Array.from({ length: Math.min(fuel, 72) }, (_, index) => (
                    <Star
                      key={index}
                      className={index % 4 === 0 ? 'is-big' : ''}
                    />
                  ))}
                </div>
                {fuel === 0 && (
                  <span className="empty-jar-copy">还没有星星</span>
                )}
              </div>
              <div className="jar-total">
                <strong>{fuel}</strong>
                <span>颗星星</span>
              </div>
            </div>
            <div className="star-balance" aria-label="星星收支">
              <span>
                <small>一共获得</small>
                <strong>{earnedStars}</strong>
              </span>
              <span>
                <small>已经兑换</small>
                <strong>{spentStars}</strong>
              </span>
              <span className="is-available">
                <small>现在可用</small>
                <strong>{fuel}</strong>
              </span>
            </div>
            <section
              className="reward-history"
              aria-labelledby="reward-history-title"
            >
              <div className="reward-history-heading">
                <div>
                  <h2 id="reward-history-title">星星变成了什么</h2>
                  <p>不必先定兑换表，每一次都可以一起商量。</p>
                </div>
              </div>
              {recentSpends.length === 0 ? (
                <div className="reward-history-empty">
                  <Gift />
                  <span>
                    <strong>还没有兑换记录</strong>
                    <small>比如：一起看电影 · 10颗星</small>
                  </span>
                </div>
              ) : (
                <div className="reward-history-list">
                  {recentSpends.map((spend) => (
                    <article className="reward-history-item" key={spend.id}>
                      <span className="reward-gift-mark">
                        <Gift />
                      </span>
                      <span>
                        <strong>{spend.title}</strong>
                        <small>{dateLabel(spend.spentOn)}</small>
                      </span>
                      <b>−{spend.amount} ★</b>
                      <button
                        type="button"
                        aria-label={`退回「${spend.title}」消耗的${spend.amount}颗星`}
                        title="记错了，退回星星"
                        onClick={() => restoreSpend(spend.id, spend.title)}
                      >
                        <RotateCcw />
                      </button>
                    </article>
                  ))}
                </div>
              )}
            </section>
          </section>
        </TabsContent>
        <footer className="save-status" aria-live="polite">
          <span
            className={
              storageMessage.startsWith('已保存在')
                ? 'status-dot'
                : 'status-dot status-warning'
            }
          />
          {storageMessage}
          <button onClick={() => setSettingsOpen(true)}>备份与说明</button>
        </footer>
      </Tabs>
      {starFlight && (
        <div
          key={starFlight.id}
          className="star-celebration"
          aria-hidden="true"
          style={
            {
              '--star-from-x': `${starFlight.startX}px`,
              '--star-from-y': `${starFlight.startY}px`,
              '--star-to-x': `${starFlight.endX}px`,
              '--star-to-y': `${starFlight.endY}px`,
            } as React.CSSProperties
          }
        >
          <span className="burst-flash" />
          <span className="burst-ring" />
          <span className="burst-ring burst-ring-late" />
          {starBurstParticles.map((particle, index) => (
            <i
              key={index}
              className="burst-particle"
              style={
                {
                  '--burst-angle': particle.angle,
                  '--burst-distance': particle.distance,
                  '--burst-color': particle.color,
                  '--burst-delay': particle.delay,
                } as React.CSSProperties
              }
            />
          ))}
          <Star className="flying-star fill-current" />
        </div>
      )}
      {notice && (
        <output className="notice-bar">
          <span>{notice}</span>
          {undo && !readOnly && (
            <button
              onClick={() => {
                storeRef.current?.edit(undo);
                setUndo(null);
                setNotice('已撤销上一步');
              }}
            >
              撤销
            </button>
          )}
          <button aria-label="关闭提示" onClick={() => setNotice('')}>
            ×
          </button>
        </output>
      )}
      <Dialog
        open={!!spendDraft}
        onOpenChange={(open) => {
          if (!open) setSpendDraft(null);
        }}
      >
        <DialogContent className="plan-dialog spend-dialog">
          <DialogHeader>
            <DialogTitle>把星星变成一个小奖励</DialogTitle>
            <DialogDescription>
              奖励和星星数由你们这一次商量，不需要先订兑换表。
            </DialogDescription>
          </DialogHeader>
          {spendDraft && (
            <div className="plan-form">
              <div className="plan-field">
                <Label htmlFor="spend-title">这次换了什么</Label>
                <Input
                  id="spend-title"
                  autoFocus
                  maxLength={60}
                  placeholder="比如：一起看电影"
                  value={spendDraft.title}
                  onChange={(event) =>
                    setSpendDraft({
                      ...spendDraft,
                      title: event.target.value,
                    })
                  }
                />
              </div>
              <div className="spend-fields">
                <div className="plan-field">
                  <Label htmlFor="spend-amount">花掉几颗星</Label>
                  <Input
                    id="spend-amount"
                    type="number"
                    inputMode="numeric"
                    min={1}
                    max={Math.min(fuel, 999)}
                    value={spendDraft.amount}
                    onChange={(event) =>
                      setSpendDraft({
                        ...spendDraft,
                        amount: event.target.value,
                      })
                    }
                  />
                </div>
                <div className="plan-field">
                  <Label htmlFor="spend-date">兑换日期</Label>
                  <Input
                    id="spend-date"
                    type="date"
                    value={spendDraft.spentOn}
                    onChange={(event) =>
                      setSpendDraft({
                        ...spendDraft,
                        spentOn: event.target.value,
                      })
                    }
                  />
                </div>
              </div>
              <div className="spend-preview">
                <Star className="fill-current" />
                <span>
                  <strong>
                    花掉 {Number(spendDraft.amount) || 0} 颗，还剩{' '}
                    {Math.max(0, fuel - (Number(spendDraft.amount) || 0))} 颗
                  </strong>
                  <small>现在罐子里共有 {fuel} 颗星</small>
                </span>
              </div>
              {error && <p className="form-error">{error}</p>}
            </div>
          )}
          <DialogFooter>
            <Button variant="ghost" onClick={() => setSpendDraft(null)}>
              再想想
            </Button>
            <Button onClick={saveSpend}>
              <Gift /> 确认兑换
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog
        open={!!planDraft}
        onOpenChange={(open) => {
          if (!open) setPlanDraft(null);
        }}
      >
        <DialogContent className="plan-dialog">
          <DialogHeader>
            <DialogTitle>
              {planDraft?.editing ? '调整安排' : '添加安排'}
            </DialogTitle>
            <DialogDescription>
              {planDraft?.recurrence === 'weekly'
                ? '修改后会同步到以后每周的同一天。'
                : '设置日期、时间和类型。'}
            </DialogDescription>
          </DialogHeader>
          {planDraft && (
            <form
              id="plan-form"
              className="plan-form"
              onSubmit={(event) => {
                event.preventDefault();
                savePlan();
              }}
            >
              <div className="plan-field">
                <Label htmlFor="plan-title">安排什么</Label>
                <Input
                  id="plan-title"
                  maxLength={60}
                  value={planDraft.item.title}
                  onChange={(event) =>
                    setPlanDraft({
                      ...planDraft,
                      item: { ...planDraft.item, title: event.target.value },
                    })
                  }
                  placeholder="例如：去公园骑车"
                />
              </div>
              <div className="plan-field">
                <span className="field-label">图标</span>
                <div className="emoji-picker" aria-label="选择行程图标">
                  <button
                    type="button"
                    aria-pressed={!planDraft.item.emoji}
                    onClick={() =>
                      setPlanDraft({
                        ...planDraft,
                        item: { ...planDraft.item, emoji: undefined },
                      })
                    }
                  >
                    无
                  </button>
                  {planEmojis.map((emoji) => (
                    <button
                      type="button"
                      key={emoji}
                      aria-label={`选择 ${emoji}`}
                      aria-pressed={planDraft.item.emoji === emoji}
                      onClick={() =>
                        setPlanDraft({
                          ...planDraft,
                          item: { ...planDraft.item, emoji },
                        })
                      }
                    >
                      {emoji}
                    </button>
                  ))}
                </div>
              </div>
              <div className="time-fields">
                <div className="plan-field">
                  <Label htmlFor="plan-date">日期</Label>
                  <Input
                    id="plan-date"
                    type="date"
                    value={planDraft.date}
                    onChange={(event) =>
                      setPlanDraft({ ...planDraft, date: event.target.value })
                    }
                  />
                </div>
                <div className="plan-field">
                  <Label htmlFor="plan-kind">安排类型</Label>
                  <select
                    id="plan-kind"
                    value={planDraft.item.kind}
                    onChange={(event) =>
                      setPlanDraft({
                        ...planDraft,
                        item: {
                          ...planDraft.item,
                          kind: event.target.value as PlanItem['kind'],
                        },
                      })
                    }
                  >
                    <option value="family">家庭安排</option>
                    <option value="habit">学习 / 运动</option>
                    <option value="fun">周末 / 出游</option>
                  </select>
                </div>
              </div>
              <div className="plan-field">
                <Label htmlFor="plan-recurrence">是否重复</Label>
                <select
                  id="plan-recurrence"
                  value={planDraft.recurrence}
                  onChange={(event) =>
                    setPlanDraft({
                      ...planDraft,
                      recurrence: event.target.value as 'once' | 'weekly',
                    })
                  }
                >
                  <option value="once">仅这一天</option>
                  <option value="weekly">每周重复 · 适合兴趣班</option>
                </select>
                <small className="field-help">
                  {planDraft.recurrence === 'weekly'
                    ? validDate(planDraft.date)
                      ? planDraft.recurringId
                        ? `每周${schoolWeek[weekdayIndex(planDraft.date)]?.weekday ?? ''}自动出现，修改会更新整组安排。`
                        : `从${dateLabel(planDraft.date)}起，每周${schoolWeek[weekdayIndex(planDraft.date)]?.weekday ?? ''}自动出现。`
                      : '选择开始日期后，会按对应星期每周自动出现。'
                    : '临时活动或只上一次的课程选这个。'}
                </small>
              </div>
              <div className="time-fields">
                <div className="plan-field">
                  <Label htmlFor="plan-start">开始时间</Label>
                  <Input
                    id="plan-start"
                    type="time"
                    value={planDraft.item.start}
                    onChange={(event) =>
                      setPlanDraft({
                        ...planDraft,
                        item: { ...planDraft.item, start: event.target.value },
                      })
                    }
                  />
                </div>
                <div className="plan-field">
                  <Label htmlFor="plan-end">结束时间</Label>
                  <Input
                    id="plan-end"
                    type="time"
                    value={planDraft.item.end}
                    onChange={(event) =>
                      setPlanDraft({
                        ...planDraft,
                        item: { ...planDraft.item, end: event.target.value },
                      })
                    }
                  />
                </div>
              </div>
              <div className="span-preview">
                <Clock3 />
                <span>
                  <strong>
                    {planDraft.item.start}—{planDraft.item.end}
                  </strong>
                  <small>
                    {planDraft.recurrence === 'weekly'
                      ? '保存后会生成整组每周安排；时间重叠时会提示。'
                      : '支持 08:30—20:00，每次至少 15 分钟；重叠时会提示。'}
                  </small>
                </span>
              </div>
              {error && (
                <p className="form-error" role="alert">
                  {error}
                </p>
              )}
            </form>
          )}
          <DialogFooter>
            {planDraft?.editing && (
              <Button
                variant="ghost"
                className="delete-button"
                onClick={deletePlan}
              >
                <Trash2 />
                {planDraft.recurringId ? '删除每周安排' : '删除'}
              </Button>
            )}
            <Button variant="outline" onClick={() => setPlanDraft(null)}>
              取消
            </Button>
            <Button type="submit" form="plan-form">
              {planDraft?.editing ? '保存调整' : '加入计划'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog
        open={!!taskDraft}
        onOpenChange={(open) => {
          if (!open) setTaskDraft(null);
        }}
      >
        <DialogContent className="plan-dialog">
          <DialogHeader>
            <DialogTitle>
              {taskDraft?.editing ? '调整学习任务' : '添加一个小目标'}
            </DialogTitle>
            <DialogDescription>
              {taskDraft && dateLabel(taskDraft.date)}开始
            </DialogDescription>
          </DialogHeader>
          {taskDraft && (
            <form
              id="task-form"
              className="plan-form"
              onSubmit={(event) => {
                event.preventDefault();
                saveTask();
              }}
            >
              <div className="plan-field">
                <Label htmlFor="task-title">今天想完成什么</Label>
                <Input
                  id="task-title"
                  maxLength={60}
                  value={taskDraft.task.title}
                  onChange={(event) =>
                    setTaskDraft({
                      ...taskDraft,
                      task: { ...taskDraft.task, title: event.target.value },
                    })
                  }
                  placeholder="例如：读完一本绘本"
                />
              </div>
              {taskDraft.task.cadence === 'once' && taskDraft.editing ? (
                <div className="span-preview">
                  <CalendarDays />
                  <span>
                    <strong>仅这一天</strong>
                    <small>可修改名称或删除。</small>
                  </span>
                </div>
              ) : (
                <div className="plan-field">
                  <Label htmlFor="task-cadence">多久出现一次</Label>
                  <select
                    id="task-cadence"
                    value={taskDraft.cadence}
                    onChange={(event) =>
                      setTaskDraft({
                        ...taskDraft,
                        cadence: event.target.value as 'daily' | 'weekly',
                      })
                    }
                  >
                    <option value="daily">日任务 · 每天可完成一次</option>
                    <option value="weekly">周任务 · 每周可完成一次</option>
                  </select>
                </div>
              )}
              {error && (
                <p className="form-error" role="alert">
                  {error}
                </p>
              )}
            </form>
          )}
          <DialogFooter>
            {taskDraft?.editing && (
              <Button
                variant="ghost"
                className="delete-button"
                onClick={() => {
                  if (taskDraft.recurringId) {
                    change(
                      {
                        ...state,
                        recurringTasks: state.recurringTasks.filter(
                          (task) => task.id !== taskDraft.recurringId,
                        ),
                      },
                      '重复任务已删除，已经得到的星星仍会保留',
                    );
                  } else {
                    change(
                      {
                        ...state,
                        tasks: {
                          ...state.tasks,
                          [taskDraft.date]: (
                            state.tasks[taskDraft.date] ?? []
                          ).filter((task) => task.id !== taskDraft.task.id),
                        },
                      },
                      '任务已删除，可撤销',
                    );
                  }
                  setTaskDraft(null);
                }}
              >
                <Trash2 /> 删除
              </Button>
            )}
            <Button variant="outline" onClick={() => setTaskDraft(null)}>
              取消
            </Button>
            <Button type="submit" form="task-form">
              保存任务
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog open={settingsOpen} onOpenChange={setSettingsOpen}>
        <DialogContent className="plan-dialog">
          <DialogHeader>
            <DialogTitle>数据与备份</DialogTitle>
            <DialogDescription>
              公开版 · 本地保存
            </DialogDescription>
          </DialogHeader>
          <div className="settings-copy">
            <p>
              <strong>当前保存方式</strong>
              数据保存在当前浏览器，刷新后保留；不同设备不会同步。
            </p>
            <p>
              <strong>课程与时间</strong>
              课表使用虚构示例。正式课程请在源码的示例配置中调整；节假日和学校调课需自行配置。
            </p>
            <Button
              className="add-task-button"
              variant="outline"
              onClick={exportBackup}
            >
              <Download /> 导出当前计划备份
            </Button>
            <small>当前仅支持导出 JSON。</small>
            <p>
              <strong>添加到主屏幕</strong>
              iPhone / iPad Safari：分享 → 添加到主屏幕。公开版需要联网加载页面。
            </p>
            <p>
              <strong>安装到 Windows 桌面</strong>
              Chrome / Edge：浏览器支持时，可通过菜单添加网页快捷方式。
            </p>
          </div>
          <DialogFooter>
            <Button onClick={() => setSettingsOpen(false)}>知道了</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </main>
  );
}
