// 캘린더·통계 API를 실제 DB로 확인한다. DATABASE_URL이 없으면 건너뛴다 (npm run test:db).
const test = require('node:test');
const assert = require('node:assert/strict');

const skip = !process.env.DATABASE_URL && 'DATABASE_URL이 없어 건너뜀 (npm run test:db)';

test('캘린더·통계 API: 기간 제한, 합계 일치, 사용자 간 분리', { skip }, async (t) => {
  const app = require('../lib/app');
  const { db } = require('../lib/db');
  const date = require('../lib/date');
  const score = require('../lib/score');
  const server = app.listen(0);
  const base = `http://127.0.0.1:${server.address().port}`;
  const suffix = `${Date.now()}`.slice(-8);
  const names = [`reca${suffix}`, `recb${suffix}`];
  t.after(async () => {
    const sql = await db();
    await sql`DELETE FROM users WHERE username = ANY(${names})`;
    server.close();
  });
  const call = async (cookie, path) => {
    const res = await fetch(base + path, { headers: cookie ? { cookie } : {} });
    return { status: res.status, data: await res.json() };
  };
  const signup = async (u) => {
    const res = await fetch(`${base}/api/signup`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ username: u, password: 'password123', passwordConfirm: 'password123' }) });
    return res.headers.getSetCookie()[0].split(';')[0];
  };
  const A = await signup(names[0]);
  const B = await signup(names[1]);
  const today = date.today();
  const thisYm = date.monthOf(today);
  const prevYm = date.addMonths(thisYm, -1);

  // A: 가입일을 지난달 1일로 앞당기고 지난달 1일 ~ 오늘 사흘마다 기록 (테스트용 직접 입력)
  const sql = await db();
  const [{ id }] = await sql`SELECT id FROM users WHERE username = ${names[0]}`;
  const start = `${prevYm}-01`;
  await sql`UPDATE users SET created_at = (${start} || ' 00:00')::timestamp AT TIME ZONE 'Asia/Seoul' WHERE id = ${id}`;
  for (let d = start, i = 0; d <= today; d = date.addDays(d, 1), i += 1) {
    if (i % 3 === 2) continue; // 휴식
    await sql`INSERT INTO workouts (user_id, done_on, type, sets) VALUES (${id}, ${d}::date, 'strength', ${5 + (i % 4) * 6})`;
  }
  await sql`INSERT INTO photos (user_id, done_on, blob_url) VALUES (${id}, ${start}::date, 'https://demo.invalid/test.jpg')`;

  await t.test('로그인하지 않으면 401', async () => {
    assert.equal((await call(null, '/api/calendar')).status, 401);
    assert.equal((await call(null, '/api/stats')).status, 401);
  });

  await t.test('기본은 이번 달, 오늘 선택. 가입 전 달·미래 달·잘못된 형식은 400', async () => {
    const r = await call(A, '/api/calendar');
    assert.equal(r.status, 200);
    assert.deepEqual([r.data.ym, r.data.selected, r.data.canPrev, r.data.canNext], [thisYm, today, true, false]);
    assert.equal((await call(A, `/api/calendar?month=${date.addMonths(prevYm, -1)}`)).status, 400);
    assert.equal((await call(A, `/api/calendar?month=${date.addMonths(thisYm, 1)}`)).status, 400);
    assert.equal((await call(A, '/api/calendar?month=2026-1')).status, 400);
    const prev = await call(A, `/api/calendar?month=${prevYm}`);
    assert.deepEqual([prev.status, prev.data.daysLeft, prev.data.selected, prev.data.canPrev, prev.data.canNext], [200, null, null, false, true]);
  });

  await t.test('캘린더 합계 = 월 누적 = 월별 그래프 = 홈 이번 달 누적', async () => {
    const cal = (await call(A, '/api/calendar')).data;
    const stats = (await call(A, '/api/stats')).data;
    const home = (await call(A, '/api/home')).data;
    const sum = score.round1(cal.weeks.flat().filter((c) => c.clickable).reduce((s, c) => s + c.total, 0));
    const month = stats.monthly.points.find((p) => p.ym === thisYm);
    assert.ok(cal.summary.total > 0);
    assert.deepEqual([sum, month.total, home.month.total], [cal.summary.total, cal.summary.total, cal.summary.total]);
    // 지난달도 같은 방식으로 일치
    const prev = (await call(A, `/api/calendar?month=${prevYm}`)).data;
    assert.equal(stats.monthly.points.find((p) => p.ym === prevYm).total, prev.summary.total);
    // 가입 전 달은 그래프에 없음
    assert.equal(stats.monthly.points[0].ym, prevYm);
  });

  await t.test('주간 그래프 값 = 같은 기간 캘린더 일별 점수 합계', async () => {
    const stats = (await call(A, '/api/stats')).data;
    const days = new Map();
    for (const ym of [prevYm, thisYm]) {
      for (const c of (await call(A, `/api/calendar?month=${ym}`)).data.weeks.flat()) if (c.clickable) days.set(c.date, c.total);
    }
    for (const p of stats.weekly.points) {
      let s = 0;
      for (let d = p.start; d <= p.end; d = date.addDays(d, 1)) s += days.get(d) ?? 0;
      if (p.start >= start) assert.equal(p.total, score.round1(s), p.label);
    }
  });

  await t.test('다른 사용자의 기록은 보이지 않음', async () => {
    const cal = (await call(B, '/api/calendar')).data;
    const stats = (await call(B, '/api/stats')).data;
    assert.deepEqual([cal.summary.total, cal.canPrev, Object.keys(cal.details)], [0, false, [today]]);
    assert.deepEqual([stats.monthly.points.length, stats.monthly.points[0].total, stats.weekly.points.length], [1, 0, 1]);
    assert.equal((await call(B, `/api/calendar?month=${prevYm}`)).status, 400); // B는 이번 달 가입
  });
});
