// Vercel 서버리스 배포 점검: 진입점·라우팅·시간대·쿠키·요청 크기. DB가 필요한 항목은 DATABASE_URL이 있을 때만.
const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('http');
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const vercel = JSON.parse(fs.readFileSync(path.join(ROOT, 'vercel.json'), 'utf8'));

// Vercel처럼 정적 파일 없이 함수(api/index.js)만 띄운다
async function withFunction(fn) {
  const handler = require('../api/index.js');
  const server = http.createServer((req, res) => handler(req, res));
  await new Promise((r) => server.listen(0, r));
  try {
    return await fn(`http://127.0.0.1:${server.address().port}`);
  } finally {
    server.close();
  }
}

test('vercel.json: public 정적 배포, /api/* → api/index.js, 함수 지역은 DB(싱가포르) 근처', () => {
  assert.equal(vercel.outputDirectory, 'public');
  assert.deepEqual(vercel.rewrites, [{ source: '/api/(.*)', destination: '/api' }]);
  assert.deepEqual(vercel.regions, ['sin1']);
  assert.ok(fs.existsSync(path.join(ROOT, 'public', 'index.html')));
  assert.ok(fs.existsSync(path.join(ROOT, 'public', 'login.html')));
  assert.equal(typeof require('../api/index.js'), 'function'); // (req, res) 핸들러
});

test('함수만으로 /api/* 처리: 상태 확인 200, 로그인 필요 401, 없는 API 404 (모두 JSON)', async () => {
  await withFunction(async (base) => {
    const health = await fetch(`${base}/api/health`);
    assert.deepEqual([health.status, await health.json()], [200, { ok: true }]);
    for (const p of ['/api/me', '/api/home', '/api/workouts/today', '/api/calendar?month=2026-10', '/api/stats']) {
      const r = await fetch(base + p);
      assert.equal(r.status, 401, p);
      assert.deepEqual(await r.json(), { error: '로그인이 필요합니다.' });
    }
    const login = await fetch(`${base}/api/nope`, { method: 'POST' });
    assert.equal(login.status, 401); // 로그인 전에는 없는 API도 401 (존재 여부를 알리지 않음)
    const unknown = await fetch(`${base}/api/login`, { method: 'GET' });
    assert.equal(unknown.status, 401);
  });
});

test('비로그인 화면 이동은 정적 화면의 스크립트가 처리 (shell.js가 /api/me 401이면 로그인 화면으로)', () => {
  const shell = fs.readFileSync(path.join(ROOT, 'public/js/shell.js'), 'utf8');
  assert.match(shell, /r\.status === 401[\s\S]*location\.replace\('\/login\.html'\)/);
  for (const page of ['index.html', 'add.html', 'records.html', 'multi.html']) {
    const html = fs.readFileSync(path.join(ROOT, 'public', page), 'utf8');
    assert.match(html, /data-auth="pending"/, page); // 로그인 확인 전에는 내용을 숨김
    assert.match(html, /\/js\/shell\.js/, page);
  }
});

test('사진 요청 크기: 브라우저 축소 결과와 서버 한도(2MB)가 Vercel 요청 한도(4.5MB)보다 작음', () => {
  const photos = require('../lib/photos');
  const VERCEL_LIMIT = 4.5 * 1024 * 1024;
  assert.ok(photos.MAX_BYTES < VERCEL_LIMIT);
  const add = fs.readFileSync(path.join(ROOT, 'public/js/add.js'), 'utf8');
  assert.match(add, /PHOTO_MAX_BYTES = 2 \* 1024 \* 1024/);
  assert.match(add, /PHOTO_MAX_SIDE = 1280/);
  assert.match(add, /'image\/jpeg', quality/);
});

test('서버 시간대(TZ)가 달라도 한국 날짜·점수가 같음 (TZ 환경변수에 기대지 않음)', () => {
  const code = `
    const date = require('./lib/date'); const score = require('./lib/score');
    const instants = ['2026-10-28T14:50:00Z', '2026-10-28T15:10:00Z', '2026-10-04T14:59:59Z', '2026-10-04T15:00:00Z', '2026-10-31T00:00:00Z'];
    const w = [{ done_on: '2026-10-30', type: 'strength', sets: 3 }, { done_on: '2026-10-31', type: 'strength', sets: 3 }, { done_on: '2026-11-01', type: 'cardio', minutes: 40, intensity: 2 }];
    console.log(JSON.stringify({
      today: instants.map((i) => date.today(new Date(i))),
      week: date.thisWeek(new Date('2026-10-04T15:00:00Z')),
      compare: date.comparisonPeriods(new Date('2026-10-31T00:00:00Z')),
      time: date.toSeoulTime('2026-10-28T09:42:00Z'),
      day: score.dailyScores('2026-11-01', '2026-11-01', w, [])[0].total,
    }));`;
  const run = (TZ) => execFileSync(process.execPath, ['-e', code], { cwd: ROOT, env: { ...process.env, TZ } }).toString().trim();
  const utc = run('UTC');
  for (const tz of ['Asia/Seoul', 'America/Los_Angeles', 'Pacific/Kiritimati', 'Pacific/Pago_Pago']) assert.equal(run(tz), utc, tz);
  const r = JSON.parse(utc);
  assert.deepEqual(r.today, ['2026-10-28', '2026-10-29', '2026-10-04', '2026-10-05', '2026-10-31']);
  assert.deepEqual(r.week, { start: '2026-10-05', end: '2026-10-11' });
  assert.equal(r.compare.final, true);
  assert.equal(r.time, '18:42');
  assert.equal(r.day, 10.9);
});

test('배포 환경 쿠키에 Secure: NODE_ENV=production 또는 HTTPS(x-forwarded-proto)', () => {
  const code = `
    process.env.SESSION_SECRET = 'x'.repeat(40);
    const auth = require('./lib/auth');
    console.log(JSON.stringify([auth.cookieOptions({ headers: {} }, false).secure, auth.cookieOptions({ headers: {} }, true).secure]));`;
  const run = (NODE_ENV) => JSON.parse(execFileSync(process.execPath, ['-e', code], { cwd: ROOT, env: { ...process.env, NODE_ENV } }).toString());
  assert.deepEqual(run('production'), [true, true]); // Vercel은 NODE_ENV=production으로 실행
  assert.deepEqual(run('development'), [false, false]); // 로컬 http에서는 Secure 없이
  const auth = require('../lib/auth');
  assert.equal(auth.cookieOptions({ headers: { 'x-forwarded-proto': 'https' } }).secure, true); // Vercel은 HTTPS 요청에 이 헤더를 붙임
});

const skip = !process.env.DATABASE_URL && 'DATABASE_URL이 없어 건너뜀 (npm run test:db)';

test('[DB] HTTPS 배포 요청의 로그인 쿠키에 Secure·HttpOnly·SameSite=Lax', { skip }, async (t) => {
  const { db } = require('../lib/db');
  const username = `srvl${Date.now()}`.slice(0, 20);
  t.after(async () => (await db())`DELETE FROM users WHERE username = ${username}`);
  await withFunction(async (base) => {
    const signup = await fetch(`${base}/api/signup`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-forwarded-proto': 'https' },
      body: JSON.stringify({ username, password: 'password123', passwordConfirm: 'password123' }),
    });
    const cookie = signup.headers.getSetCookie()[0];
    assert.match(cookie, /; Secure/);
    assert.match(cookie, /HttpOnly/);
    assert.match(cookie, /SameSite=Lax/);
    const logout = await fetch(`${base}/api/logout`, { method: 'POST', headers: { 'x-forwarded-proto': 'https' } });
    assert.match(logout.headers.getSetCookie()[0], /jaksim_session=;.*Secure/);
  });
});

test('[DB] DB 클라이언트는 요청마다 새로 만들지 않고 재사용, 스키마 확인은 한 번', { skip }, async () => {
  const dbmod = require('../lib/db');
  const a = await dbmod.db();
  const b = await dbmod.db();
  assert.equal(a, b); // 같은 neon 클라이언트 (모듈이 살아 있는 동안 재사용)
  // 첫 요청 이후에는 스키마 확인(CREATE TABLE IF NOT EXISTS)을 다시 보내지 않는다: DB로 가는 HTTP 요청 수를 센다
  const realFetch = globalThis.fetch;
  let requests = 0;
  globalThis.fetch = (...args) => { requests += 1; return realFetch(...args); };
  try {
    await dbmod.ensureSchema();
    await dbmod.db();
    assert.equal(requests, 0);
    await (await dbmod.db())`SELECT 1`;
    assert.equal(requests, 1); // 실제 쿼리 한 번만
  } finally {
    globalThis.fetch = realFetch;
  }
});
