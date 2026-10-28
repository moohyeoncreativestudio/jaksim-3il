// 인증샷 API를 실제 DB·Vercel Blob으로 확인한다. 환경변수가 없으면 건너뛴다 (npm run test:db).
const test = require('node:test');
const assert = require('node:assert/strict');

const skip = !(process.env.DATABASE_URL && process.env.BLOB_READ_WRITE_TOKEN) && 'DATABASE_URL·BLOB_READ_WRITE_TOKEN이 없어 건너뜀';

// 1×1 JPEG (형식 확인용 실제 JPEG 바이트)
const JPEG = Buffer.from(
  '/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/wAALCAABAAEBAREA/8QAFAABAAAAAAAAAAAAAAAAAAAACf/EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAD8AKp//2Q==',
  'base64',
);

test('인증샷 API: 업로드·점수·조회 권한·삭제', { skip }, async (t) => {
  const app = require('../lib/app');
  const { db } = require('../lib/db');
  const blob = require('@vercel/blob');
  const server = app.listen(0);
  const base = `http://127.0.0.1:${server.address().port}`;
  const suffix = `${Date.now()}`.slice(-8);
  const names = [`phoa${suffix}`, `phob${suffix}`];
  t.after(async () => {
    const sql = await db();
    // 남은 Blob 파일을 먼저 지우고 계정을 지운다 (DB 행은 CASCADE)
    const rows = await sql`SELECT p.blob_url FROM photos p JOIN users u ON u.id = p.user_id WHERE u.username = ANY(${names})`;
    if (rows.length) await blob.del(rows.map((r) => r.blob_url));
    await sql`DELETE FROM users WHERE username = ANY(${names})`;
    server.close();
  });

  const call = async (cookie, method, path, body, type) => {
    const res = await fetch(base + path, {
      method,
      headers: { ...(cookie ? { cookie } : {}), ...(type ? { 'content-type': type } : body ? { 'content-type': 'application/json' } : {}) },
      body: body === undefined ? undefined : Buffer.isBuffer(body) ? body : JSON.stringify(body),
    });
    const isJson = (res.headers.get('content-type') || '').includes('json');
    return { status: res.status, headers: res.headers, data: isJson ? await res.json() : Buffer.from(await res.arrayBuffer()), cookie: res.headers.getSetCookie()[0]?.split(';')[0] };
  };
  const signup = async (username) =>
    (await call(null, 'POST', '/api/signup', { username, password: 'password123', passwordConfirm: 'password123' })).cookie;
  const A = await signup(names[0]);
  const B = await signup(names[1]);
  let photoId;

  await t.test('로그인하지 않으면 업로드·조회 401', async () => {
    assert.equal((await call(null, 'POST', '/api/photos', JPEG, 'image/jpeg')).status, 401);
    assert.equal((await call(null, 'GET', '/api/photos/1/image')).status, 401);
  });

  await t.test('운동 기록 없이 사진만 올리면 사진은 저장되지만 점수 미반영', async () => {
    const r = await call(A, 'POST', '/api/photos', JPEG, 'image/jpeg');
    assert.equal(r.status, 201);
    assert.equal(r.data.photos.length, 1);
    assert.deepEqual([r.data.day.worked, r.data.day.photo, r.data.day.total], [false, 0, 0]);
    photoId = r.data.photos[0].id;
    assert.equal(r.data.photos[0].imageUrl, `/api/photos/${photoId}/image`);
    assert.ok(!JSON.stringify(r.data).includes('blob.vercel-storage'), '응답에 Blob 주소가 없어야 함');
  });

  await t.test('운동을 기록하면 인증샷 +1 반영 (운동 점수 게이지는 20점 상한 그대로)', async () => {
    const r = await call(A, 'POST', '/api/workouts', { type: 'strength', sets: 6 });
    assert.deepEqual([r.data.exercise, r.data.day.photo, r.data.day.total], [6, 1, 7]);
    const big = await call(A, 'POST', '/api/workouts', { type: 'cardio', activity: '복싱', minutes: 60, intensity: 3 });
    assert.deepEqual([big.data.exercise, big.data.day.photo, big.data.day.total], [20, 1, 21]);
    // 두 번째 사진을 올려도 인증샷은 1점
    const second = await call(A, 'POST', '/api/photos', JPEG, 'image/jpeg');
    assert.deepEqual([second.data.photos.length, second.data.day.photo, second.data.day.total], [2, 1, 21]);
  });

  await t.test('Blob은 비공개: 저장된 주소로 바로 열 수 없음', async () => {
    const sql = await db();
    const [row] = await sql`SELECT blob_url FROM photos WHERE id = ${photoId}`;
    assert.match(row.blob_url, /\.private\.blob\.vercel-storage\.com\/photos\/[0-9a-f]{32}-/);
    assert.equal((await fetch(row.blob_url)).status, 403);
  });

  await t.test('본인은 API로 사진을 받을 수 있음', async () => {
    const r = await call(A, 'GET', `/api/photos/${photoId}/image`);
    assert.equal(r.status, 200);
    assert.equal(r.headers.get('content-type'), 'image/jpeg');
    assert.ok(r.data.equals(JPEG));
    assert.equal(r.headers.get('cache-control'), 'no-store'); // 브라우저 캐시에 남기지 않음
  });

  await t.test('다른 사용자는 내 사진을 받거나 지울 수 없고 목록에도 없음', async () => {
    assert.equal((await call(B, 'GET', `/api/photos/${photoId}/image`)).status, 404);
    assert.equal((await call(B, 'DELETE', `/api/photos/${photoId}`)).status, 404);
    const today = await call(B, 'GET', '/api/workouts/today');
    assert.deepEqual([today.data.photos.length, today.data.day.photo], [0, 0]);
  });

  await t.test('이미지가 아닌 파일·2MB 초과는 거부', async () => {
    const text = await call(A, 'POST', '/api/photos', Buffer.from('this is not an image, just text!'), 'image/jpeg');
    assert.equal(text.status, 400);
    const gif = await call(A, 'POST', '/api/photos', Buffer.from('GIF89a\x01\x00\x01\x00\x00\x00\x00;'), 'image/gif');
    assert.equal(gif.status, 400);
    const huge = Buffer.concat([JPEG.subarray(0, 4), Buffer.alloc(2 * 1024 * 1024)]);
    const big = await call(A, 'POST', '/api/photos', huge, 'image/jpeg');
    assert.equal(big.status, 413);
    assert.equal(big.data.error, '사진은 2MB 이하만 올릴 수 있어요.');
  });

  await t.test('사진 삭제: Blob도 지워지고 점수 재계산, 지난 날짜 사진은 403', async () => {
    const sql = await db();
    const [{ blob_url: url }] = await sql`SELECT blob_url FROM photos WHERE id = ${photoId}`;
    const r = await call(A, 'DELETE', `/api/photos/${photoId}`);
    assert.equal(r.status, 200);
    assert.deepEqual([r.data.photos.length, r.data.day.photo], [1, 1]); // 한 장 남아 있으면 그대로 +1
    assert.equal(await blob.head(url).catch(() => null), null, 'Blob 파일도 삭제');
    const last = r.data.photos[0].id;
    const r2 = await call(A, 'DELETE', `/api/photos/${last}`);
    assert.deepEqual([r2.data.photos.length, r2.data.day.photo, r2.data.day.total], [0, 0, 20]);

    const date = require('../lib/date');
    const [{ id: userId }] = await sql`SELECT id FROM users WHERE username = ${names[0]}`;
    const [{ id: oldId }] = await sql`
      INSERT INTO photos (user_id, done_on, blob_url) VALUES (${userId}, ${date.addDays(date.today(), -1)}::date, 'https://example.invalid/x.jpg') RETURNING id`;
    assert.equal((await call(A, 'DELETE', `/api/photos/${oldId}`)).status, 403);
    await sql`DELETE FROM photos WHERE id = ${oldId}`;
  });
});
