import type { PlanItem } from '../lib/planner.ts';

type DayPlan = {
  key: string;
  weekday: string;
  date: string;
  mood: string;
  items: Omit<PlanItem, 'id'>[];
};

// These six slots and subjects are invented examples, not a real child's timetable.
const slots = [
  ['08:45', '09:25'], ['09:35', '10:15'], ['10:30', '11:10'],
  ['11:20', '12:00'], ['14:20', '15:00'], ['15:20', '16:00'],
];
const subjects = [
  ['语文', '数学', '科学', '体育', '美术', '音乐'],
  ['数学', '英语', '语文', '科学', '音乐', '体育'],
  ['科学', '语文', '数学', '美术', '英语', '体育'],
  ['英语', '数学', '体育', '音乐', '语文', '科学'],
  ['美术', '科学', '英语', '语文', '体育', '数学'],
];
const keys = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
const weekdays = ['周一', '周二', '周三', '周四', '周五', '周六', '周日'];
const moods = ['启航', '探索', '补给', '加速', '抵达', '远征', '规划'];
export const schoolWeek: DayPlan[] = keys.map((key, weekday) => ({
  key, weekday: weekdays[weekday], date: '', mood: moods[weekday],
  items: (subjects[weekday] ?? []).map((title, slot) => ({
    start: slots[slot][0], end: slots[slot][1], title, kind: 'school',
  })),
}));
