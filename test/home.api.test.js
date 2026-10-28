// 홈 API를 실제 DB로 확인한다. DATABASE_URL이 없으면 건너뛴다 (npm run test:db).
const test = require('node:test');
const assert = require('node:assert/strict');

const skip = !process.env.DATABASE_URL && 'DATABASE_URL이 없어 건너뜀 (npm run test:db)';

test('홈 API: 신규 사용자, 기록 반영, 사용자 간 분리', { skip }, async (t) => {
  const app = require('../lib/app');
  const { db } = require('../lib/db');
  const date = require('../lib/date');
  const server = app.listen(0);
  const base = `http://127.0.0.1:${server.address().port}`;
  const suffix = `${Date.now()}`.slice(-8);
  const names = [`homa${suffix}`, `homb${suffix}`];
  t.after(async () => {
    const sql = await db();
    await sql`DELETE FROM users WHERE username = ANY(${names})`;
    server.close();
  });
  const call = async (cookie, method, path, body) => {
    const res = await fetch(base + path, {
      method,
      headers: { ...(cookie ? { cookie } : {}), ...(body ? { 'content-type': 'application/json' } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    });
    return { status: res.status, data: await res.json(), cookie: res.headers.getSetCookie()[0]?.split(';')[0] };
  };
  const signup = async (u) => (await call(null, 'POST', '/api/signup', { username: u, password: 'password123', passwordConfirm: 'password123' })).cookie;
  const A = await signup(names[0]);
  const B = await signup(names[1]);
  const today = date.today();

  await t.test('로그인하지 않으면 401', async () => {
    assert.equal((await call(null, 'GET', '/api/home')).status, 401);
  });

  await t.test('신규 사용자: 모두 0, 오늘 작심하면 1일차 시작', async () => {
    const h = (await call(A, 'GET', '/api/home')).data;
    assert.equal(h.today, today);
    assert.equal(h.username, names[0]);
    assert.equal(h.month.total, 0);
    assert.equal(h.month.comparison.headline, '이번 달이 첫 기록이에요');
    assert.equal(h.streak.banner.title, '오늘 작심하면 1일차 시작!');
    assert.deepEqual([h.stats.workedDays, h.stats.photoDays, h.todayScore.total], [0, 0, 0]);
    assert.equal(h.week.days.find((d) => d.isToday).status, 'today');
  });

  await t.test('어제·그제 기록 + 오늘 기록 → 연속 3일, 오늘 연속 보너스 +2', async () => {
    const sql = await db();
    const [{ id }] = await sql`SELECT id FROM users WHERE username = ${names[0]}`;
    // 가입 전 날짜 기록은 정상 경로로 생길 수 없으므로 테스트용으로 가입일을 앞당기고 직접 넣는다
    await sql`UPDATE users SET created_at = now() - interval '10 days' WHERE id = ${id}`;
    for (const k of [2, 1]) {
      await sql`INSERT INTO workouts (user_id, done_on, type, sets) VALUES (${id}, ${date.addDays(today, -k)}::date, 'strength', 5)`;
    }
    await call(A, 'POST', '/api/workouts', { type: 'cardio', activity: '러닝', minutes: 40, intensity: 2 });
    const h = (await call(A, 'GET', '/api/home')).data;
    assert.deepEqual([h.streak.current, h.streak.longest, h.streak.recordBreaking], [3, 3, true]);
    assert.equal(h.streak.banner.title, '작심삼일 돌파! 3일째');
    assert.deepEqual([h.todayScore.exercise, h.todayScore.streakBonus, h.todayScore.photo, h.todayScore.total], [8.9, 2, 0, 10.9]);
    assert.equal(h.week.days.find((d) => d.isToday).status, 'today-done');
  });

  await t.test('다른 사용자의 기록은 내 홈에 섞이지 않음', async () => {
    const h = (await call(B, 'GET', '/api/home')).data;
    assert.equal(h.username, names[1]);
    assert.deepEqual([h.month.total, h.streak.current, h.todayScore.total], [0, 0, 0]);
  });

  await t.test('예시 데이터 기능은 API로 접근할 수 없음', async () => {
    for (const p of ['/api/seed', '/api/seed-demo', '/api/clear-demo']) {
      assert.equal((await call(A, 'POST', p, {})).status, 404);
    }
  });
});
