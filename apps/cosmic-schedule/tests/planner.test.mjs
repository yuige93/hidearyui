import test from 'node:test';
import assert from 'node:assert/strict';
import {
  addDays, mondayOf, dayItems, schoolWeek, emptyState, readState,
  planError, starCount, tasksForDate,
} from '../lib/planner.ts';

test('week navigation spans month/year boundaries', () => {
  assert.equal(mondayOf('2027-01-01'), '2026-12-28');
  assert.equal(addDays('2026-12-31', 1), '2027-01-01');
});

test('fictional classes are on weekdays only, with no overlapping lesson slots', () => {
  assert.equal(schoolWeek.length, 7);
  for (let day = 0; day < 5; day++) {
    const classes = dayItems(emptyState(), addDays('2026-10-12', day));
    assert.equal(classes.length, 6);
    classes.forEach((item, i) => assert.equal(planError(item, classes.slice(0, i)), ''));
  }
  assert.equal(dayItems(emptyState(), '2026-10-17').length, 0);
});

test('personal arrangements remain date-specific and reject time conflicts', () => {
  const state = emptyState();
  const item = { id: 'walk', title: '散步', start: '17:00', end: '17:30', kind: 'fun' };
  state.days['2026-10-12'] = [item];
  assert.equal(dayItems(state, '2026-10-13').some((v) => v.id === 'walk'), false);
  assert.match(planError({ ...item, start: '17:15', end: '17:45' }, [item]), /重叠/);
  assert.equal(planError({ ...item, start: '17:30', end: '18:00' }, [item]), '');
});

test('weekly arrangements recur from their creation date', () => {
  const state = emptyState();
  state.recurringPlans = [{ id: 'read', title: '阅读', start: '17:00', end: '17:30', kind: 'habit', weekday: 0, createdOn: '2026-10-12', active: true }];
  assert.equal(dayItems(state, '2026-10-05').some((v) => v.sourceId === 'read'), false);
  assert.equal(dayItems(state, '2026-10-19').some((v) => v.sourceId === 'read'), true);
});

test('daily task completions and reward spends determine available stars', () => {
  const state = emptyState();
  state.recurringTasks = [{ id: 'read', title: '阅读', cadence: 'daily', createdOn: '2026-10-06', active: true }];
  state.taskCompletions['read:2026-10-06'] = { taskId: 'read', title: '阅读', completedAt: '2026-10-06' };
  assert.equal(tasksForDate(state, '2026-10-06')[0].done, true);
  assert.equal(tasksForDate(state, '2026-10-07')[0].done, false);
  assert.equal(starCount(state), 1);
  state.starSpends = [{ id: 'reward', title: '一起看电影', amount: 1, spentOn: '2026-10-06' }];
  assert.equal(starCount(state), 0);
  assert.deepEqual(readState(JSON.stringify(state)), state);
});
