export type CalendarDayInfo = {
  holiday?: string;
  solarTerm?: string;
  officialWorkday: boolean;
  schoolScheduleIndex: number | null;
  schoolScheduleLabel?: string;
  isDayOff: boolean;
};

type HolidayPeriod = {
  name: string;
  start: string;
  end: string;
};

type SchoolScheduleOverride = {
  scheduleIndex: 0 | 1 | 2 | 3 | 4;
  label: string;
};

// 2026 national holidays: State Council notice, published 2025-11-04.
// https://www.beijing.gov.cn/zhengce/zhengcefagui/202511/t20251104_4258873.html
// Add future years only after their official arrangements are confirmed.
const holidayPeriods: HolidayPeriod[] = [
  { name: '元旦', start: '2026-01-01', end: '2026-01-03' },
  { name: '春节', start: '2026-02-15', end: '2026-02-23' },
  { name: '清明', start: '2026-04-04', end: '2026-04-06' },
  { name: '劳动节', start: '2026-05-01', end: '2026-05-05' },
  { name: '端午', start: '2026-06-19', end: '2026-06-21' },
  { name: '中秋', start: '2026-09-25', end: '2026-09-27' },
  { name: '国庆', start: '2026-10-01', end: '2026-10-07' },
];

const officialWorkdays = new Set([
  '2026-01-04',
  '2026-02-14',
  '2026-02-28',
  '2026-05-09',
  '2026-09-20',
  '2026-10-10',
]);

// Configure confirmed school changes here. National make-up workdays alone
// do not determine whether a school has lessons or which weekday it follows.
const schoolScheduleOverrides: Record<string, SchoolScheduleOverride> = {};

// Hong Kong Observatory's 2026 Gregorian/lunar calendar, Hong Kong time (UTC+8).
// https://www.hko.gov.hk/tc/gts/time/calendar/pdf/files/2026.pdf
const solarTerms: Record<string, string> = {
  '2026-01-05': '小寒',
  '2026-01-20': '大寒',
  '2026-02-04': '立春',
  '2026-02-18': '雨水',
  '2026-03-05': '惊蛰',
  '2026-03-20': '春分',
  '2026-04-05': '清明',
  '2026-04-20': '谷雨',
  '2026-05-05': '立夏',
  '2026-05-21': '小满',
  '2026-06-05': '芒种',
  '2026-06-21': '夏至',
  '2026-07-07': '小暑',
  '2026-07-23': '大暑',
  '2026-08-07': '立秋',
  '2026-08-23': '处暑',
  '2026-09-07': '白露',
  '2026-09-23': '秋分',
  '2026-10-08': '寒露',
  '2026-10-23': '霜降',
  '2026-11-07': '立冬',
  '2026-11-22': '小雪',
  '2026-12-07': '大雪',
  '2026-12-22': '冬至',
};

function weekdayIndex(value: string) {
  return (new Date(`${value}T12:00:00`).getDay() + 6) % 7;
}

export function calendarDayInfo(value: string): CalendarDayInfo {
  const holiday = holidayPeriods.find(
    (period) => value >= period.start && value <= period.end,
  )?.name;
  const officialWorkday = officialWorkdays.has(value);
  const override = schoolScheduleOverrides[value];
  const weekday = weekdayIndex(value);
  const schoolScheduleIndex = override
    ? override.scheduleIndex
    : holiday || weekday >= 5
      ? null
      : weekday;

  return {
    holiday,
    solarTerm: solarTerms[value],
    officialWorkday,
    schoolScheduleIndex,
    schoolScheduleLabel:
      override?.label ?? (officialWorkday ? '调休上班' : undefined),
    isDayOff: Boolean(holiday),
  };
}

export function hasSchoolSchedule(value: string) {
  return calendarDayInfo(value).schoolScheduleIndex !== null;
}
