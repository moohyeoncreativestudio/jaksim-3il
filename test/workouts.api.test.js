// 운동 기록 API를 실제 DB로 확인한다. DATABASE_URL이 없으면 건너뛴다 (npm run test:db).
const test = require('node:test');
const assert = require('node:assert/strict');

const skip = !process.env.DATABASE_URL && 'DATABASE_URL이 없어 건너뜀 (npm run test:db)';

test('운동 기록 API: 추가·조회·수정·삭제와 권한', { skip }, async (t) => {
  const app = require('../lib/app');
  const { db } = require('../lib/db');
  const date = require('../lib/date');
  const server = app.listen(0);
  const base = `http://127.0.0.1:${server.address().port}`;
  const suffix = `${Date.now()}`.slice(-8);
  const names = [`apia${suffix}`, `apib${suffix}`];
  t.after(async () => {
    const sql = await db();
    await sql`DELETE FROM users WHERE username = ANY(${names})`; // 기록은 CASCADE로 함께 삭제
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
  const signup = async (username) =>
    (await call(null, 'POST', '/api/signup', { username, password: 'password123', passwordConfirm: 'password123' })).cookie;
  const A = await signup(names[0]);
  const B = await signup(names[1]);

  await t.test('로그인하지 않으면 401', async () => {
    assert.equal((await call(null, 'GET', '/api/workouts/today')).status, 401);
    assert.equal((await call(null, 'POST', '/api/workouts', { type: 'strength', sets: 1 })).status, 401);
  });

  let strengthId, cardioId, bigId;
  await t.test('근력 6세트 → 러닝 40분 강도 2: 예상 +8.9, 오늘 14.9 / 20', async () => {
    const r1 = await call(A, 'POST', '/api/workouts', { type: 'strength', sets: 6, bodyParts: ['하체'] });
    assert.equal(r1.status, 201);
    assert.equal(r1.data.date, date.today());
    assert.equal(r1.data.exercise, 6);
    strengthId = r1.data.workouts[0].id;

    const p = await call(A, 'POST', '/api/workouts/preview', { type: 'cardio', minutes: 40, intensity: 2 });
    assert.deepEqual([p.data.recordScore, p.data.after], [8.9, 14.9]);

    const r2 = await call(A, 'POST', '/api/workouts', { type: 'cardio', activity: '러닝', minutes: 40, intensity: 2 });
    assert.deepEqual([r2.data.exercise, r2.data.remaining, r2.data.workouts.length], [14.9, 5.1, 2]);
    cardioId = r2.data.workouts[1].id;
    assert.equal(r2.data.workouts[1].score, 8.9);
  });

  await t.test('20점을 넘기면 20 / 20, 남은 점수 0, 다음 예상은 상한 도달', async () => {
    const r = await call(A, 'POST', '/api/workouts', { type: 'cardio', activity: '복싱', minutes: 60, intensity: 3 });
    assert.deepEqual([r.data.exercise, r.data.remaining, r.data.capped], [20, 0, true]);
    bigId = r.data.workouts[2].id;
    const p = await call(A, 'POST', '/api/workouts/preview', { type: 'strength', sets: 3 });
    assert.deepEqual([p.data.atCap, p.data.after], [true, 20]);
  });

  await t.test('수정·삭제하면 점수를 다시 계산', async () => {
    const p = await call(A, 'POST', '/api/workouts/preview', { type: 'cardio', minutes: 10, intensity: 1, editingId: bigId });
    assert.deepEqual([p.data.atCap, p.data.before, p.data.after], [false, 14.9, 16]);
    const r1 = await call(A, 'PUT', `/api/workouts/${bigId}`, { type: 'cardio', activity: '복싱', minutes: 10, intensity: 1 });
    assert.equal(r1.status, 200);
    assert.equal(r1.data.exercise, 16); // 6 + (80 + 10) / 9
    const r2 = await call(A, 'DELETE', `/api/workouts/${strengthId}`);
    assert.equal(r2.status, 200);
    assert.deepEqual([r2.data.exercise, r2.data.workouts.length], [10, 2]);
    // 유산소 기록을 근력으로 바꾸는 수정도 가능
    const r3 = await call(A, 'PUT', `/api/workouts/${cardioId}`, { type: 'strength', sets: 2, bodyParts: ['팔'], memo: '컬' });
    assert.deepEqual(r3.data.workouts.find((w) => w.id === cardioId), {
      ...r3.data.workouts.find((w) => w.id === cardioId), type: 'strength', activity: null, sets: 2, bodyParts: ['팔'], memo: '컬', score: 2,
    });
    assert.equal(r3.data.exercise, 3.1); // 2 + 10/9
  });

  await t.test('다른 사용자의 기록은 조회·수정·삭제할 수 없음', async () => {
    const today = await call(B, 'GET', '/api/workouts/today');
    assert.deepEqual([today.data.workouts.length, today.data.exercise], [0, 0]);
    const put = await call(B, 'PUT', `/api/workouts/${bigId}`, { type: 'strength', sets: 100 });
    assert.equal(put.status, 404);
    const del = await call(B, 'DELETE', `/api/workouts/${bigId}`);
    assert.equal(del.status, 404);
    const preview = await call(B, 'POST', '/api/workouts/preview', { type: 'strength', sets: 1, editingId: bigId });
    assert.equal(preview.data.before, 0); // A의 기록이 B의 계산에 섞이지 않음
    const a = await call(A, 'GET', '/api/workouts/today');
    assert.deepEqual([a.data.workouts.length, a.data.exercise], [2, 3.1]);
  });

  await t.test('지난 날짜 기록은 본인 것이어도 수정·삭제할 수 없음 (403)', async () => {
    const sql = await db();
    const yesterday = date.addDays(date.today(), -1);
    const [{ id: userId }] = await sql`SELECT id FROM users WHERE username = ${names[0]}`;
    const [{ id }] = await sql`
      INSERT INTO workouts (user_id, done_on, type, sets) VALUES (${userId}, ${yesterday}::date, 'strength', 4) RETURNING id`;
    assert.equal((await call(A, 'PUT', `/api/workouts/${id}`, { type: 'strength', sets: 5 })).status, 403);
    assert.equal((await call(A, 'DELETE', `/api/workouts/${id}`)).status, 403);
    assert.equal((await call(B, 'DELETE', `/api/workouts/${id}`)).status, 404);
    const a = await call(A, 'GET', '/api/workouts/today');
    assert.equal(a.data.workouts.length, 2); // 어제 기록은 오늘 목록에 없음
  });

  await t.test('잘못된 입력은 400과 field, 잘못된 id는 404', async () => {
    const r1 = await call(A, 'POST', '/api/workouts', { type: 'cardio', activity: '', minutes: 30, intensity: 2 });
    assert.deepEqual([r1.status, r1.data.field], [400, 'activity']);
    const r2 = await call(A, 'POST', '/api/workouts', { type: 'strength', sets: 5, memo: 'a'.repeat(101) });
    assert.deepEqual([r2.status, r2.data.field], [400, 'memo']);
    assert.equal((await call(A, 'PUT', '/api/workouts/abc', { type: 'strength', sets: 5 })).status, 404);
    assert.equal((await call(A, 'DELETE', '/api/workouts/99999999999')).status, 404);
  });
});
