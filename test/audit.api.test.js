// 전체 점검: 보안·쿠키·날짜 경계·점수 일치를 실제 DB로 확인한다. DATABASE_URL이 없으면 건너뛴다 (npm run test:db).
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');

const skip = !process.env.DATABASE_URL && 'DATABASE_URL이 없어 건너뜀 (npm run test:db)';
const kst = (s) => new Date(`${s}+09:00`);

test('전체 점검 API', { skip }, async (t) => {
  const express = require('express');
  const app = require('../lib/app');
  const auth = require('../lib/auth');
  const date = require('../lib/date');
  const score = require('../lib/score');
  const { db } = require('../lib/db');
  // 로컬 dev-server와 같은 구성: public 정적 파일 + API
  const site = express();
  site.disable('x-powered-by'); // dev-server.js와 같게
  site.use(express.static(path.join(__dirname, '..', 'public')));
  site.use(app);
  const server = site.listen(0);
  const base = `http://127.0.0.1:${server.address().port}`;
  const realClock = app.get('clock');
  const suffix = `${Date.now()}`.slice(-8);
  const names = [`auda${suffix}`, `audb${suffix}`, `audc${suffix}`];
  const sql = await db();
  t.after(async () => {
    app.set('clock', realClock);
    await sql`DELETE FROM users WHERE username = ANY(${names})`;
    server.close();
  });
  const call = async (cookie, method, p, body) => {
    const res = await fetch(base + p, {
      method,
      redirect: 'manual',
      headers: { ...(cookie ? { cookie } : {}), ...(body ? { 'content-type': 'application/json' } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    });
    const raw = await res.text();
    let data = raw;
    try { data = JSON.parse(raw); } catch {}
    return { status: res.status, data, raw, headers: res.headers };
  };
  const signup = async (u) => {
    const res = await fetch(`${base}/api/signup`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ username: u, password: 'password123', passwordConfirm: 'password123' }) });
    return res.headers.getSetCookie()[0].split(';')[0];
  };
  const A = await signup(names[0]);
  const B = await signup(names[1]);
  const C = await signup(names[2]);
  const idOf = async (u) => (await sql`SELECT id FROM users WHERE username = ${u}`)[0].id;
  const aId = await idOf(names[0]);

  // A: 지난달 1일 ~ 오늘 기록 (가입일을 앞당기고 직접 입력) + 사진 행
  const today = date.today();
  const start = `${date.addMonths(date.monthOf(today), -1)}-01`;
  await sql`UPDATE users SET created_at = (${start} || ' 00:00')::timestamp AT TIME ZONE 'Asia/Seoul' WHERE id = ${aId}`;
  for (let d = start, i = 0; d <= today; d = date.addDays(d, 1), i += 1) {
    if (i % 5 === 3) continue;
    await sql`INSERT INTO workouts (user_id, done_on, type, activity, minutes, intensity) VALUES (${aId}, ${d}::date, 'cardio', '러닝', ${20 + (i % 7) * 10}, ${1 + (i % 3)})`;
    if (i % 2 === 0) await sql`INSERT INTO photos (user_id, done_on, blob_url) VALUES (${aId}, ${d}::date, 'https://demo.invalid/a.jpg')`;
  }
  const [aWorkout] = await sql`SELECT id FROM workouts WHERE user_id = ${aId} ORDER BY done_on DESC LIMIT 1`;
  const [aPhoto] = await sql`SELECT id FROM photos WHERE user_id = ${aId} LIMIT 1`;

  await t.test('[보안] B는 어떤 API로도 A의 기록·사진·점수·캘린더·통계를 볼 수 없음', async () => {
    const leaks = [];
    for (const p of ['/api/me', '/api/workouts/today', '/api/home', '/api/calendar', '/api/stats']) {
      const r = await call(B, 'GET', p);
      assert.equal(r.status, 200, p);
      if (r.raw.includes(names[0]) || r.raw.includes('demo.invalid') || r.raw.includes('blob.vercel-storage')) leaks.push(p);
    }
    assert.deepEqual(leaks, []);
    const home = (await call(B, 'GET', '/api/home')).data;
    const cal = (await call(B, 'GET', '/api/calendar')).data;
    const stats = (await call(B, 'GET', '/api/stats')).data;
    assert.deepEqual([home.month.total, cal.summary.total, stats.monthly.points.reduce((s, p) => s + p.total, 0)], [0, 0, 0]);
    assert.equal((await call(B, 'GET', `/api/calendar?month=${date.monthOf(start)}`)).status, 400); // B 가입 전 달
    assert.equal((await call(B, 'GET', `/api/photos/${aPhoto.id}/image`)).status, 404);
  });

  await t.test('[보안] 남의 기록·사진은 수정·삭제 불가 (404, 존재 여부도 숨김)', async () => {
    assert.equal((await call(B, 'PUT', `/api/workouts/${aWorkout.id}`, { type: 'strength', sets: 100 })).status, 404);
    assert.equal((await call(B, 'DELETE', `/api/workouts/${aWorkout.id}`)).status, 404);
    assert.equal((await call(B, 'DELETE', `/api/photos/${aPhoto.id}`)).status, 404);
    assert.equal((await call(B, 'POST', '/api/workouts/preview', { type: 'strength', sets: 1, editingId: aWorkout.id })).data.before, 0);
    const [still] = await sql`SELECT type FROM workouts WHERE id = ${aWorkout.id}`;
    assert.equal(still.type, 'cardio');
  });

  await t.test('[보안] 쿠키 조작·만료·없음은 401, 응답에 내부 정보 없음', async () => {
    const token = A.split('=')[1];
    const [v, id, exp, sig] = token.split('.');
    const cases = {
      없음: null,
      '서명 조작': `jaksim_session=${v}.${id}.${exp}.${sig.slice(0, -2)}xx`,
      '다른 사용자 id': `jaksim_session=${v}.${await idOf(names[1])}.${exp}.${sig}`,
      '만료 연장': `jaksim_session=${v}.${id}.${Number(exp) + 1e9}.${sig}`,
      '만료된 토큰': `jaksim_session=${auth.createToken(aId, -1000)}`,
      '쓰레기 값': 'jaksim_session=hello',
    };
    for (const [name, cookie] of Object.entries(cases)) {
      for (const p of ['/api/me', '/api/home', '/api/calendar', '/api/workouts/today']) {
        const r = await call(cookie, 'GET', p);
        assert.equal(r.status, 401, `${name} ${p}`);
        assert.deepEqual(r.data, { error: '로그인이 필요합니다.' });
      }
    }
    const bad = await call(A, 'POST', '/api/workouts', undefined);
    assert.equal(bad.status, 400);
    assert.equal((await call(null, 'GET', '/api/me')).headers.get('x-powered-by'), null);
  });

  await t.test('[보안] 지워진 계정의 토큰: 조회는 비어 있거나 401, 저장은 401 (500 아님)', async () => {
    const ghost = `jaksim_session=${auth.createToken(2147480000, 60_000)}`;
    assert.equal((await call(ghost, 'GET', '/api/me')).status, 401);
    assert.equal((await call(ghost, 'GET', '/api/home')).status, 401);
    assert.equal((await call(ghost, 'GET', '/api/calendar')).status, 401);
    assert.equal((await call(ghost, 'POST', '/api/workouts', { type: 'strength', sets: 1 })).status, 401);
    assert.deepEqual((await call(ghost, 'GET', '/api/workouts/today')).data.workouts, []);
  });

  await t.test('[보안] 자동 로그인 미체크는 세션 쿠키, 체크는 30일', async () => {
    const login = async (remember) => (await fetch(`${base}/api/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ username: names[2], password: 'password123', remember }) })).headers.getSetCookie()[0];
    const session = await login(false);
    assert.doesNotMatch(session, /Max-Age|Expires/i);
    assert.match(session, /HttpOnly/);
    assert.match(session, /SameSite=Lax/);
    assert.match(await login(true), /Max-Age=2592000/);
  });

  await t.test('[보안] .env·스크립트·소스는 웹으로 열 수 없고 예시 데이터 기능은 API에 없음', async () => {
    for (const p of ['/.env', '/.env.example', '/scripts/seed-demo.js', '/scripts/clear-demo.js', '/lib/db.js', '/package.json', '/CLAUDE.md']) {
      assert.equal((await call(null, 'GET', p)).status, 404, p);
    }
    for (const p of ['/api/seed', '/api/seed-demo', '/api/clear-demo']) {
      assert.equal((await call(A, 'POST', p, {})).status, 404, p);
    }
  });

  await t.test('[날짜] 한국 23:50 기록은 그날, 00:10 기록은 다음 날 / 지난 날짜는 수정·삭제 불가 / 보낸 날짜는 무시', async () => {
    const cId = await idOf(names[2]);
    await sql`UPDATE users SET created_at = '2026-01-01T00:00:00Z' WHERE id = ${cId}`;
    app.set('clock', () => kst('2026-03-30T23:50:00'));
    const r1 = await call(C, 'POST', '/api/workouts', { type: 'strength', sets: 3, done_on: '2020-01-01', date: '2020-01-01' });
    assert.equal(r1.data.date, '2026-03-30');
    app.set('clock', () => kst('2026-03-31T00:10:00'));
    const r2 = await call(C, 'POST', '/api/workouts', { type: 'strength', sets: 4 });
    assert.equal(r2.data.date, '2026-03-31');
    assert.deepEqual(r2.data.workouts.map((w) => w.sets), [4]); // 어제 기록은 오늘 목록에 없음
    const rows = await sql`SELECT done_on::text AS d, sets FROM workouts WHERE user_id = ${cId} ORDER BY id`;
    assert.deepEqual(rows.map((r) => [r.d, r.sets]), [['2026-03-30', 3], ['2026-03-31', 4]]);
    const yesterdayId = r1.data.workouts[0].id;
    assert.equal((await call(C, 'PUT', `/api/workouts/${yesterdayId}`, { type: 'strength', sets: 9 })).status, 403);
    assert.equal((await call(C, 'DELETE', `/api/workouts/${yesterdayId}`)).status, 403);
    // 3/31 비교는 2월 전체, 월이 바뀌어도(3/30→3/31) 연속 보너스 +1
    const home = (await call(C, 'GET', '/api/home')).data;
    assert.equal(home.month.comparison.previousLabel, '2월 1~28일 0점');
    assert.equal(home.todayScore.streakBonus, 1);
    app.set('clock', realClock);
  });

  await t.test('[점수 일치] 홈·운동 추가·캘린더·날짜 상세·그래프가 같은 값', async () => {
    const [home, add, cal, stats] = await Promise.all(['/api/home', '/api/workouts/today', '/api/calendar', '/api/stats'].map(async (p) => (await call(A, 'GET', p)).data));
    const cell = cal.weeks.flat().find((c) => c.date === today);
    const detail = cal.details[today];
    // 오늘
    assert.equal(add.exercise, home.todayScore.exercise);
    assert.equal(detail.breakdown.exercise, home.todayScore.exercise);
    assert.deepEqual([cell.total, detail.total, add.day.total], [home.todayScore.total, home.todayScore.total, home.todayScore.total]);
    assert.equal(detail.breakdown.streakBonus, home.todayScore.streakBonus);
    // 이번 달
    const daySum = score.round1(cal.weeks.flat().filter((c) => c.clickable).reduce((s, c) => s + c.total, 0));
    const monthPoint = stats.monthly.points.find((p) => p.inProgress);
    assert.deepEqual([daySum, monthPoint.total, home.month.total], [cal.summary.total, cal.summary.total, cal.summary.total]);
    assert.equal(home.stats.workedDays, cal.summary.workedDays);
    // 모든 날짜의 상세 합계 = 칸 점수
    for (const c of cal.weeks.flat().filter((x) => x.clickable)) assert.equal(cal.details[c.date].total, c.total, c.date);
    // 이번 주 = 캘린더 일별 합 (지난달에 걸치면 지난달 캘린더도 사용)
    const prev = (await call(A, 'GET', `/api/calendar?month=${date.addMonths(date.monthOf(today), -1)}`)).data;
    const totals = new Map([...prev.weeks.flat(), ...cal.weeks.flat()].filter((c) => c.clickable).map((c) => [c.date, c.total]));
    const week = stats.weekly.points.at(-1);
    let s = 0;
    for (let d = week.start; d <= today; d = date.addDays(d, 1)) s += totals.get(d) ?? 0;
    assert.equal(week.total, score.round1(s));
    // 지난달 = 월별 그래프
    assert.equal(stats.monthly.points.find((p) => p.ym === prev.ym).total, prev.summary.total);
  });
});
