const test = require('node:test');
const assert = require('node:assert/strict');
const date = require('../lib/date');

// 한국 시각으로 현재 시각을 만든다
const kst = (s) => new Date(`${s}+09:00`);

test('UTC 서버에서도 한국 날짜 기준으로 오늘을 구한다', () => {
  assert.equal(date.today(new Date('2026-10-27T15:30:00Z')), '2026-10-28'); // KST 00:30
  assert.equal(date.today(new Date('2026-10-28T14:59:59Z')), '2026-10-28'); // KST 23:59
  assert.equal(date.today(new Date('2026-10-28T15:00:00Z')), '2026-10-29');
  assert.equal(date.toSeoulTime('2026-10-28T09:42:00Z'), '18:42');
});

test('날짜 더하기·빼기와 요일', () => {
  assert.equal(date.addDays('2026-10-31', 1), '2026-11-01');
  assert.equal(date.addDays('2026-03-01', -1), '2026-02-28');
  assert.equal(date.addDays('2028-03-01', -1), '2028-02-29');
  assert.equal(date.diffDays('2026-09-30', '2026-10-02'), 2);
  assert.equal(date.weekday('2026-09-28'), 1); // 월
  assert.equal(date.weekday('2026-10-04'), 7); // 일
  assert.equal(date.isValidDate('2026-02-30'), false);
  assert.equal(date.addMonths('2026-01', -1), '2025-12');
  assert.equal(date.addMonths('2026-11', 2), '2027-01');
});

test('이번 주는 월요일~일요일', () => {
  assert.deepEqual(date.thisWeek(kst('2026-10-01T09:00:00')), { start: '2026-09-28', end: '2026-10-04' });
  assert.deepEqual(date.thisWeek(kst('2026-10-04T23:00:00')), { start: '2026-09-28', end: '2026-10-04' });
  assert.deepEqual(date.thisWeek(kst('2026-10-05T00:10:00')), { start: '2026-10-05', end: '2026-10-11' });
});

test('이번 달 1일·마지막 날·남은 날', () => {
  const m = date.thisMonth(kst('2026-10-20T12:00:00'));
  assert.equal(m.start, '2026-10-01');
  assert.equal(m.end, '2026-10-31');
  assert.equal(m.today, '2026-10-20');
  assert.equal(m.daysLeft, 11); // D-11 TO GO
  assert.equal(date.thisMonth(kst('2026-10-31T12:00:00')).daysLeft, 0);
  assert.equal(date.thisMonth(kst('2028-02-10T12:00:00')).end, '2028-02-29');
});

test('월간 비교 기간: 10/20 → 10/1~10/20 vs 9/1~9/20', () => {
  const p = date.comparisonPeriods(kst('2026-10-20T12:00:00'));
  assert.equal(p.final, false);
  assert.deepEqual([p.current.start, p.current.end], ['2026-10-01', '2026-10-20']);
  assert.deepEqual([p.previous.start, p.previous.end], ['2026-09-01', '2026-09-20']);
});

test('월간 비교 기간: 3/30 → 지난달 마지막 날(2/28, 윤년 2/29)까지', () => {
  const p = date.comparisonPeriods(kst('2026-03-30T12:00:00'));
  assert.equal(p.final, false);
  assert.deepEqual([p.current.start, p.current.end], ['2026-03-01', '2026-03-30']);
  assert.deepEqual([p.previous.start, p.previous.end], ['2026-02-01', '2026-02-28']);

  const leap = date.comparisonPeriods(kst('2028-03-30T12:00:00'));
  assert.deepEqual([leap.previous.start, leap.previous.end], ['2028-02-01', '2028-02-29']);
});

test('월간 비교 기간: 마지막 날(10/31)은 최종 비교 9/1~9/30', () => {
  const p = date.comparisonPeriods(kst('2026-10-31T12:00:00'));
  assert.equal(p.final, true);
  assert.deepEqual([p.current.start, p.current.end], ['2026-10-01', '2026-10-31']);
  assert.deepEqual([p.previous.start, p.previous.end], ['2026-09-01', '2026-09-30']);
});

test('월간 비교 기간: 이미 끝난 달은 최종 비교, 미래 달은 오류', () => {
  const p = date.comparisonPeriods(kst('2026-10-20T12:00:00'), '2026-09');
  assert.equal(p.final, true);
  assert.deepEqual([p.current.start, p.current.end], ['2026-09-01', '2026-09-30']);
  assert.deepEqual([p.previous.start, p.previous.end], ['2026-08-01', '2026-08-31']);
  assert.throws(() => date.comparisonPeriods(kst('2026-10-20T12:00:00'), '2026-11'), RangeError);
});

test('최근 12주 구간 목록', () => {
  const weeks = date.recentWeeks(kst('2026-10-07T12:00:00'));
  assert.equal(weeks.length, 12);
  assert.deepEqual(weeks[11], { start: '2026-10-05', end: '2026-10-11', label: '10/5', inProgress: true });
  assert.deepEqual(weeks[10], { start: '2026-09-28', end: '2026-10-04', label: '9/28', inProgress: false });
  assert.equal(weeks[0].start, '2026-07-20');
  assert.ok(weeks.every((w) => date.weekday(w.start) === 1 && date.weekday(w.end) === 7));
});

test('최근 6개월 구간 목록 (연도 경계 포함)', () => {
  const months = date.recentMonths(kst('2026-02-10T12:00:00'));
  assert.deepEqual(
    months.map((m) => m.label),
    ['9월', '10월', '11월', '12월', '1월', '2월'],
  );
  assert.deepEqual(months[0], { ym: '2025-09', start: '2025-09-01', end: '2025-09-30', label: '9월', inProgress: false });
  assert.equal(months[5].end, '2026-02-28');
  assert.equal(months[5].inProgress, true);
});
