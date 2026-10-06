import test from 'node:test';
import assert from 'node:assert/strict';
import { calendarDayInfo, hasSchoolSchedule } from '../lib/school-calendar.ts';
import { addDays, dayItems, emptyState, schoolWeek, tasksForDate } from '../lib/planner.ts';

// Verified against the 2026 State Council notice and HKO calendar linked in
// lib/school-calendar.ts. No private school calendar is included in these cases.
const holidayCases = [
  ['元旦', '2026-01-01', 3],
  ['春节', '2026-02-15', 9],
  ['清明', '2026-04-04', 3],
  ['劳动节', '2026-05-01', 5],
  ['端午', '2026-06-19', 3],
  ['中秋', '2026-09-25', 3],
  ['国庆', '2026-10-01', 7],
];

test('all 2026 national holidays suppress school lessons, including October 1–7', () => {
  const state = emptyState();
  for (const [name, start, length] of holidayCases) {
    for (let offset = 0; offset < length; offset++) {
      const date = addDays(start, offset);
      const info = calendarDayInfo(date);
      assert.equal(info.holiday, name, date);
      assert.equal(info.isDayOff, true, date);
      assert.equal(info.schoolScheduleIndex, null, date);
      assert.equal(hasSchoolSchedule(date), false, date);
      assert.deepEqual(dayItems(state, date), [], date);
    }
  }
});

test('October 8 resumes ordinary Thursday lessons and marks Cold Dew', () => {
  const info = calendarDayInfo('2026-10-08');
  assert.equal(info.holiday, undefined);
  assert.equal(info.isDayOff, false);
  assert.equal(info.officialWorkday, false);
  assert.equal(info.schoolScheduleIndex, 3);
  assert.equal(info.solarTerm, '寒露');
  assert.equal(hasSchoolSchedule('2026-10-08'), true);
  assert.deepEqual(
    dayItems(emptyState(), '2026-10-08').map((item) => item.title),
    schoolWeek[3].items.map((item) => item.title),
  );
});

test('six national make-up workdays are marked without inventing school overrides', () => {
  for (const date of [
    '2026-01-04', '2026-02-14', '2026-02-28',
    '2026-05-09', '2026-09-20', '2026-10-10',
  ]) {
    const info = calendarDayInfo(date);
    assert.equal(info.officialWorkday, true, date);
    assert.equal(info.schoolScheduleLabel, '调休上班', date);
    assert.equal(info.schoolScheduleIndex, null, date);
    assert.equal(hasSchoolSchedule(date), false, date);
    assert.deepEqual(dayItems(emptyState(), date), [], date);
  }
});

test('ordinary weekends have no school lessons or make-up workday marker', () => {
  for (const date of ['2026-10-17', '2026-10-18']) {
    const info = calendarDayInfo(date);
    assert.equal(info.holiday, undefined);
    assert.equal(info.officialWorkday, false);
    assert.equal(info.schoolScheduleLabel, undefined);
    assert.equal(hasSchoolSchedule(date), false);
    assert.deepEqual(dayItems(emptyState(), date), []);
  }
});

test('all 24 solar terms match the HKO 2026 calendar', () => {
  const expected = [
    ['2026-01-05', '小寒'], ['2026-01-20', '大寒'],
    ['2026-02-04', '立春'], ['2026-02-18', '雨水'],
    ['2026-03-05', '惊蛰'], ['2026-03-20', '春分'],
    ['2026-04-05', '清明'], ['2026-04-20', '谷雨'],
    ['2026-05-05', '立夏'], ['2026-05-21', '小满'],
    ['2026-06-05', '芒种'], ['2026-06-21', '夏至'],
    ['2026-07-07', '小暑'], ['2026-07-23', '大暑'],
    ['2026-08-07', '立秋'], ['2026-08-23', '处暑'],
    ['2026-09-07', '白露'], ['2026-09-23', '秋分'],
    ['2026-10-08', '寒露'], ['2026-10-23', '霜降'],
    ['2026-11-07', '立冬'], ['2026-11-22', '小雪'],
    ['2026-12-07', '大雪'], ['2026-12-22', '冬至'],
  ];
  const actual = [];
  for (let date = '2026-01-01'; date <= '2026-12-31'; date = addDays(date, 1)) {
    const term = calendarDayInfo(date).solarTerm;
    if (term) actual.push([date, term]);
  }
  assert.deepEqual(actual, expected);
});

test('2027 has no prefilled holidays or make-up workdays', () => {
  for (let date = '2027-01-01'; date <= '2027-12-31'; date = addDays(date, 1)) {
    const info = calendarDayInfo(date);
    assert.equal(info.holiday, undefined, date);
    assert.equal(info.officialWorkday, false, date);
    assert.equal(info.schoolScheduleLabel, undefined, date);
  }
});

test('personal plans and daily tasks remain available during holidays and make-up days', () => {
  const state = emptyState();
  state.recurringTasks = [{
    id: 'daily-reading', title: '阅读', cadence: 'daily',
    createdOn: '2026-10-01', active: true,
  }];
  for (const date of ['2026-10-03', '2026-10-10']) {
    const plan = { id: `walk-${date}`, title: '散步', start: '09:00', end: '09:30', kind: 'family' };
    state.days[date] = [plan];
    state.tasks[date] = [{ id: `once-${date}`, title: '观察星空', done: false, cadence: 'once' }];
    assert.deepEqual(dayItems(state, date), [plan]);
    assert.deepEqual(
      new Set(tasksForDate(state, date).map((task) => task.title)),
      new Set(['观察星空', '阅读']),
    );
  }
});
