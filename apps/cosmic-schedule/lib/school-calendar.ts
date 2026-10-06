export type CalendarDayInfo = {
  holiday?: string;
  solarTerm?: string;
  officialWorkday: boolean;
  schoolScheduleIndex: number | null;
  schoolScheduleLabel?: string;
  isDayOff: boolean;
};

// Example calendar only. Configure holidays and school-specific changes here.
export function calendarDayInfo(value: string): CalendarDayInfo {
  const weekday = (new Date(`${value}T12:00:00`).getDay() + 6) % 7;
  return { officialWorkday: false, schoolScheduleIndex: weekday < 5 ? weekday : null, isDayOff: false };
}
export function hasSchoolSchedule(value: string) {
  return calendarDayInfo(value).schoolScheduleIndex !== null;
}
