// 사용법: npm run seed -- <아이디> [--months N]
// 그 계정에 N개월 전 1일 ~ 오늘의 예시 기록을 넣는다 (기본 N=1: 지난달 1일부터).
// 기존 예시 기록은 먼저 지우고 다시 넣는다. 가입일은 예시 시작일로 바꾸고, 원래 가입일은 clear-demo가 되돌린다.
// 사진은 Blob에 올리지 않고 DB에만 예시 주소로 넣는다. 로컬 확인용이며 API·화면에서는 실행할 수 없다.
const { db } = require('../lib/db');
const { DEMO_MEMO, DEMO_PHOTO_PREFIX, buildDemo, readBackup, writeBackup } = require('./demo-data');

function parseArgs(argv) {
  const usage = '사용법: npm run seed -- <아이디> [--months N]  (N: 1~24, 기본 1)';
  let username = null;
  let months = 1;
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === '--months') {
      months = Number(argv[(i += 1)]);
      if (!Number.isInteger(months) || months < 1 || months > 24) throw new Error(usage);
    } else if (!username && !argv[i].startsWith('--')) {
      username = argv[i];
    } else {
      throw new Error(usage);
    }
  }
  if (!username) throw new Error(usage);
  return { username, months };
}

async function main() {
  const { username, months } = parseArgs(process.argv.slice(2));
  const sql = await db();
  const [user] = await sql`SELECT id, created_at FROM users WHERE username = ${username}`;
  if (!user) throw new Error(`"${username}" 계정을 찾을 수 없어요.`);

  const demo = buildDemo(new Date(), months);
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
  // 가입일을 예시 시작일로 바꾼다 (가입 전 구간은 캘린더·그래프에서 숨겨지므로). 원래 가입일은 처음 한 번만 보관한다.
  const backup = readBackup();
  if (!backup[username]) {
    backup[username] = new Date(user.created_at).toISOString();
    writeBackup(backup);
  }
  await sql`UPDATE users SET created_at = (${demo.start} || ' 00:00')::timestamp AT TIME ZONE 'Asia/Seoul' WHERE id = ${user.id}`;
  console.log(`${username}: ${demo.start} ~ ${demo.today} 예시 운동 ${w.length}건, 사진 ${demo.photos.length}건을 넣었어요.`);
  console.log(`가입일을 ${demo.start}로 바꿨어요. clear-demo로 원래 가입일(${backup[username]})로 되돌릴 수 있어요.`);
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
