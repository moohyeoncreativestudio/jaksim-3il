// 한국 시간(Asia/Seoul) 기준 날짜 계산. 앱의 모든 날짜는 이 파일의 함수로 구한다.
// 날짜는 'YYYY-MM-DD', 월은 'YYYY-MM' 문자열로 주고받는다.
// "현재 시각"은 항상 인자(now: Date)로 받아 테스트에서 주입할 수 있게 한다.
// 한국은 서머타임이 없으므로 UTC+9 고정 오프셋으로 계산한다.

const DAY_MS = 24 * 60 * 60 * 1000;
const KST_OFFSET_MS = 9 * 60 * 60 * 1000;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const MONTH_RE = /^\d{4}-\d{2}$/;

const pad2 = (n) => String(n).padStart(2, '0');

function toInstant(value) {
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) throw new TypeError(`올바르지 않은 시각: ${value}`);
  return d;
}

// 시각(Date, ISO 문자열, ms) → 한국 날짜 'YYYY-MM-DD'
function toSeoulDate(instant) {
  return new Date(toInstant(instant).getTime() + KST_OFFSET_MS).toISOString().slice(0, 10);
}

// 시각 → 한국 시각 'HH:MM' (예: "18:42 업로드")
function toSeoulTime(instant) {
  return new Date(toInstant(instant).getTime() + KST_OFFSET_MS).toISOString().slice(11, 16);
}

function today(now = new Date()) {
  return toSeoulDate(now);
}

function isValidDate(s) {
  if (typeof s !== 'string' || !DATE_RE.test(s)) return false;
  const d = new Date(`${s}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}

function isValidMonth(s) {
  if (typeof s !== 'string' || !MONTH_RE.test(s)) return false;
  const m = Number(s.slice(5, 7));
  return m >= 1 && m <= 12;
}

function parseDate(ymd) {
  if (!isValidDate(ymd)) throw new TypeError(`올바르지 않은 날짜: ${ymd}`);
  return new Date(`${ymd}T00:00:00Z`);
}

const formatDate = (d) => d.toISOString().slice(0, 10);

function addDays(ymd, n) {
  return formatDate(new Date(parseDate(ymd).getTime() + n * DAY_MS));
}

// b - a (일)
function diffDays(a, b) {
  return Math.round((parseDate(b) - parseDate(a)) / DAY_MS);
}

// 1=월 … 7=일
function weekday(ymd) {
  return parseDate(ymd).getUTCDay() || 7;
}

// start~end(포함) 날짜 목록
function eachDay(start, end) {
  const days = [];
  for (let d = start; d <= end; d = addDays(d, 1)) days.push(d);
  return days;
}

function daysInMonth(year, month) {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

const monthOf = (ymd) => ymd.slice(0, 7);

function splitMonth(ym) {
  if (!isValidMonth(ym)) throw new TypeError(`올바르지 않은 월: ${ym}`);
  return { year: Number(ym.slice(0, 4)), month: Number(ym.slice(5, 7)) };
}

function addMonths(ym, n) {
  const { year, month } = splitMonth(ym);
  const idx = year * 12 + (month - 1) + n;
  return `${Math.floor(idx / 12)}-${pad2((idx % 12) + 1)}`;
}

// 해당 월의 1일~마지막 날
function monthRange(ym) {
  const { year, month } = splitMonth(ym);
  return { start: `${ym}-01`, end: `${ym}-${pad2(daysInMonth(year, month))}` };
}

// 날짜가 속한 주(월요일~일요일)
function weekRange(ymd) {
  const start = addDays(ymd, 1 - weekday(ymd));
  return { start, end: addDays(start, 6) };
}

function thisWeek(now = new Date()) {
  return weekRange(today(now));
}

// 이번 달 정보. daysLeft는 오늘 이후 남은 날 수("D-11 TO GO")
function thisMonth(now = new Date()) {
  const t = today(now);
  const ym = monthOf(t);
  const { start, end } = monthRange(ym);
  const day = Number(t.slice(8, 10));
  const total = Number(end.slice(8, 10));
  return { ym, start, end, today: t, day, daysInMonth: total, daysLeft: total - day };
}

// 월간 비교 기간.
// - 진행 중: 이번 달 1일~N일 vs 지난달 1일~min(N, 지난달 마지막 날)
// - 이번 달 마지막 날이거나 이미 끝난 달: 두 달 전체 비교(final = true)
// ym을 생략하면 이번 달 기준.
function comparisonPeriods(now = new Date(), ym) {
  const current = thisMonth(now);
  const target = ym ?? current.ym;
  if (target > current.ym) throw new RangeError('미래의 달은 비교할 수 없습니다.');
  const prevYm = addMonths(target, -1);
  const cur = monthRange(target);
  const prev = monthRange(prevYm);

  const final = target < current.ym || current.day === current.daysInMonth;
  if (final) {
    return { final: true, current: { ym: target, ...cur }, previous: { ym: prevYm, ...prev } };
  }
  const prevLastDay = Number(prev.end.slice(8, 10));
  const n = Math.min(current.day, prevLastDay);
  return {
    final: false,
    current: { ym: target, start: cur.start, end: current.today },
    previous: { ym: prevYm, start: prev.start, end: `${prevYm}-${pad2(n)}` },
  };
}

// 최근 count주(이번 주 포함, 오래된 순). label은 그 주 월요일 "10/12"
function recentWeeks(now = new Date(), count = 12) {
  const { start: thisMonday } = thisWeek(now);
  const weeks = [];
  for (let i = count - 1; i >= 0; i -= 1) {
    const start = addDays(thisMonday, -7 * i);
    weeks.push({
      start,
      end: addDays(start, 6),
      label: `${Number(start.slice(5, 7))}/${Number(start.slice(8, 10))}`,
      inProgress: i === 0,
    });
  }
  return weeks;
}

// 최근 count개월(이번 달 포함, 오래된 순). label은 "5월"
function recentMonths(now = new Date(), count = 6) {
  const { ym: thisYm } = thisMonth(now);
  const months = [];
  for (let i = count - 1; i >= 0; i -= 1) {
    const ym = addMonths(thisYm, -i);
    months.push({ ym, ...monthRange(ym), label: `${Number(ym.slice(5, 7))}월`, inProgress: i === 0 });
  }
  return months;
}

module.exports = {
  toSeoulDate,
  toSeoulTime,
  today,
  isValidDate,
  isValidMonth,
  parseDate,
  addDays,
  diffDays,
  weekday,
  eachDay,
  daysInMonth,
  monthOf,
  addMonths,
  monthRange,
  weekRange,
  thisWeek,
  thisMonth,
  comparisonPeriods,
  recentWeeks,
  recentMonths,
};
