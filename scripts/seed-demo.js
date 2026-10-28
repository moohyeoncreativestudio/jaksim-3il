// 사용법: npm run seed -- <아이디>
// 그 계정에 지난달 1일 ~ 오늘의 예시 기록을 넣는다 (기존 예시 기록은 먼저 지우고 다시 넣는다).
// 사진은 Blob에 올리지 않고 DB에만 예시 주소로 넣는다. 로컬 확인용이며 API·화면에서는 실행할 수 없다.
const { db } = require('../lib/db');
const { DEMO_MEMO, DEMO_PHOTO_PREFIX, buildDemo } = require('./demo-data');

async function main() {
  const username = process.argv[2];
  if (!username) throw new Error('사용법: npm run seed -- <아이디>');
  const sql = await db();
  const [user] = await sql`SELECT id, created_at FROM users WHERE username = ${username}`;
  if (!user) throw new Error(`"${username}" 계정을 찾을 수 없어요.`);

  const demo = buildDemo();
  await sql`DELETE FROM workouts WHERE user_id = ${user.id} AND memo = ${DEMO_MEMO}`;
  await sql`DELETE FROM photos WHERE user_id = ${user.id} AND blob_url LIKE ${DEMO_PHOTO_PREFIX + '%'}`;

  const w = demo.workouts;
  await sql.query(
    `INSERT INTO workouts (user_id, done_on, type, activity, minutes, intensity, sets, body_parts, memo, created_at)
     SELECT $1, d::date, t, a, m, i, s, b, $2,
            ((d || ' 07:30')::timestamp + make_interval(mins => o * 40)) AT TIME ZONE 'Asia/Seoul'
     FROM unnest($3::text[], $4::text[], $5::text[], $6::int[], $7::int[], $8::int[], $9::text[], $10::int[])
          AS x(d, t, a, m, i, s, b, o)`,
    [
      user.id,
      DEMO_MEMO,
      w.map((r) => r.done_on),
      w.map((r) => r.type),
      w.map((r) => (r.type === 'cardio' ? r.activity : null)),
      w.map((r) => (r.type === 'cardio' ? r.minutes : null)),
      w.map((r) => (r.type === 'cardio' ? r.intensity : null)),
      w.map((r) => (r.type === 'strength' ? r.sets : null)),
      w.map((r) => (r.type === 'strength' ? r.bodyParts : null)),
      w.map((r) => r.order),
    ],
  );
  await sql.query(
    `INSERT INTO photos (user_id, done_on, blob_url, created_at)
     SELECT $1, d::date, $2 || n || '.jpg', ((d || ' 18:42')::timestamp) AT TIME ZONE 'Asia/Seoul'
     FROM unnest($3::text[]) WITH ORDINALITY AS x(d, n)`,
    [user.id, DEMO_PHOTO_PREFIX, demo.photos.map((p) => p.done_on)],
  );
  // 가입일이 예시 기간보다 늦으면 화면(그래프·캘린더)에서 가입 전 구간으로 숨겨지므로 가입일을 앞당긴다
  const moved = await sql`
    UPDATE users SET created_at = (${demo.start} || ' 00:00')::timestamp AT TIME ZONE 'Asia/Seoul'
    WHERE id = ${user.id} AND created_at > (${demo.start} || ' 00:00')::timestamp AT TIME ZONE 'Asia/Seoul'
    RETURNING id`;
  console.log(`${username}: ${demo.start} ~ ${demo.today} 예시 운동 ${w.length}건, 사진 ${demo.photos.length}건을 넣었어요.`);
  if (moved.length) console.log(`가입일을 ${demo.start}로 앞당겼어요 (예시 기간이 가입 전으로 숨겨지지 않게).`);
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
