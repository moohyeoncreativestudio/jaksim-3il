const test = require('node:test');
const assert = require('node:assert/strict');
const workouts = require('../lib/workouts');

const cardio = (minutes, intensity, id) => ({ id, type: 'cardio', activity: '러닝', minutes, intensity, created_at: '2026-10-28T22:30:00Z' });
const strength = (sets, id) => ({ id, type: 'strength', sets, body_parts: '하체,등', created_at: '2026-10-28T22:30:00Z' });

test('유산소 기록 검증: 종목 필수, 20자 이하, 시간 1~600, 강도 1~3', () => {
  assert.deepEqual(workouts.parseWorkout({ type: 'cardio', activity: ' 러닝 ', minutes: 40, intensity: 2 }).value,
    { type: 'cardio', activity: '러닝', minutes: 40, intensity: 2, sets: null, body_parts: null, memo: null });
  assert.equal(workouts.parseWorkout({ type: 'cardio', activity: '  ', minutes: 40, intensity: 2 }).field, 'activity');
  assert.equal(workouts.parseWorkout({ type: 'cardio', activity: '가'.repeat(21), minutes: 40, intensity: 2 }).field, 'activity');
  assert.ok(workouts.parseWorkout({ type: 'cardio', activity: '가'.repeat(20), minutes: 40, intensity: 2 }).value);
  assert.equal(workouts.parseWorkout({ type: 'cardio', activity: '러닝', minutes: 0, intensity: 2 }).field, 'minutes');
  assert.equal(workouts.parseWorkout({ type: 'cardio', activity: '러닝', minutes: 601, intensity: 2 }).field, 'minutes');
  assert.equal(workouts.parseWorkout({ type: 'cardio', activity: '러닝', minutes: 30.5, intensity: 2 }).field, 'minutes');
  assert.equal(workouts.parseWorkout({ type: 'cardio', activity: '러닝', minutes: 30, intensity: 4 }).field, 'intensity');
  assert.equal(workouts.parseWorkout({ type: 'yoga' }).field, 'type');
  assert.equal(workouts.parseWorkout(undefined).field, 'type');
});

test('근력 기록 검증: 세트 1~100, 부위는 6가지 중 중복 없이, 메모 100자 이하', () => {
  assert.deepEqual(workouts.parseWorkout({ type: 'strength', sets: 6, bodyParts: ['등', '하체'], memo: ' 스쿼트 ' }).value,
    { type: 'strength', activity: null, minutes: null, intensity: null, sets: 6, body_parts: '하체,등', memo: '스쿼트' });
  assert.deepEqual(workouts.parseWorkout({ type: 'strength', sets: 1 }).value.body_parts, null);
  assert.equal(workouts.parseWorkout({ type: 'strength', sets: 1, memo: '' }).value.memo, null);
  assert.equal(workouts.parseWorkout({ type: 'strength', sets: 0 }).field, 'sets');
  assert.equal(workouts.parseWorkout({ type: 'strength', sets: 101 }).field, 'sets');
  assert.equal(workouts.parseWorkout({ type: 'strength', sets: 5, bodyParts: ['엉덩이'] }).field, 'bodyParts');
  assert.equal(workouts.parseWorkout({ type: 'strength', sets: 5, bodyParts: ['팔', '팔'] }).field, 'bodyParts');
  assert.equal(workouts.parseWorkout({ type: 'strength', sets: 5, bodyParts: '팔' }).field, 'bodyParts');
  assert.equal(workouts.parseWorkout({ type: 'strength', sets: 5, memo: 'a'.repeat(101) }).field, 'memo');
});

test('예상 점수: 근력 6세트 후 러닝 40분 강도 2 → +8.9, 오늘 14.9 / 20', () => {
  const p = workouts.previewScore([strength(6, 1)], { type: 'cardio', minutes: 40, intensity: 2 });
  assert.deepEqual(p, { recordScore: 8.9, before: 6, after: 14.9, atCap: false, max: 20 });
});

test('예상 점수: 이미 20점이면 상한 도달, 수정 중인 기록은 빼고 계산', () => {
  const rows = [cardio(60, 3, 1), strength(6, 2)];
  const capped = workouts.previewScore(rows, { type: 'strength', sets: 3 });
  assert.equal(capped.atCap, true);
  assert.equal(capped.after, 20);
  const editing = workouts.previewScore(rows, { type: 'cardio', minutes: 10, intensity: 1 }, 1);
  assert.deepEqual([editing.recordScore, editing.before, editing.after, editing.atCap], [1.1, 6, 7.1, false]);
});

test('오늘 요약: 상한 적용 점수, 남은 점수, 기록별 원래 점수와 시각', () => {
  const s = workouts.todaySummary('2026-10-29', [strength(6, 1), cardio(40, 2, 2)]);
  assert.equal(s.exercise, 14.9);
  assert.equal(s.remaining, 5.1);
  assert.deepEqual(s.workouts.map((w) => w.score), [6, 8.9]);
  assert.equal(s.workouts[0].timeLabel, '오전 07:30');
  assert.deepEqual(s.workouts[0].bodyParts, ['하체', '등']);
  const full = workouts.todaySummary('2026-10-29', [cardio(60, 3, 1), strength(25, 2)]);
  assert.deepEqual([full.exercise, full.remaining, full.capped], [20, 0, true]);
  assert.equal(workouts.koreanTime('2026-10-28T09:42:00Z'), '오후 06:42');
  assert.equal(workouts.koreanTime('2026-10-28T15:05:00Z'), '오전 12:05');
});
