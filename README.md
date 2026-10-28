# 작심삼일 (JAKSIM-3IL)

운동(유산소 / 근력)을 기록하면 정해진 규칙으로 하루 점수가 매겨지고, 이번 달 누적 점수가 지난달 같은 기간보다 높아졌는지 보여주는 개인 운동 기록 웹앱입니다.
연속으로 운동하면 3일째부터 보너스가 붙습니다. "작심삼일을 넘겨라."

여러 사람이 각자 계정으로 쓰고, 각자 자기 기록만 봅니다.

## 점수 규칙 요약

하루 점수 = 운동 점수 + 연속 보너스 + 인증샷 (하루 최대 **23점**)

| 항목 | 규칙 | 하루 최대 |
|---|---|---|
| 운동 점수 | 유산소 `분 × 강도(1~3) ÷ 9` + 근력 `세트 수 × 1`. 하루 기록을 모두 합친 뒤 20점 상한 | 20 |
| 연속 보너스 | 연속 1일차 0, 2일차 +1, 3일차부터 +2. 하루라도 쉬면 다시 1일차. 월이 바뀌어도 이어짐 | 2 |
| 인증샷 | 운동한 날 인증 사진을 1장 이상 올리면 +1 (여러 장이어도 1점). 촬영 또는 앨범에서 선택 | 1 |

- 운동 기록이 1건이라도 있는 날이 "운동한 날"입니다. 기록이 없는 날은 사진이 있어도 0점입니다.
- 월간 비교는 같은 기간끼리 합니다 (예: 10월 20일 → 10/1~10/20 vs 9/1~9/20). 그 달 마지막 날부터는 두 달 전체를 비교합니다.
- 날짜는 모두 한국 시간 기준이고 서버가 정합니다. 운동 기록과 사진은 오늘 것만 추가·수정·삭제할 수 있습니다.

전체 규칙은 [CLAUDE.md](CLAUDE.md)에 있습니다.

## 화면

| 화면 | 내용 |
|---|---|
| 로그인 / 회원가입 | 아이디 + 비밀번호, 30일 자동 로그인 |
| 홈 | 이번 달 누적 점수와 지난달 같은 기간 대비, 연속 배너, 요약 3칸, 이번 주 흐름, 오늘 점수 |
| 운동 추가 | 유산소(종목·시간·강도) / 근력(부위·세트·메모), 인증샷(촬영 또는 앨범), 오늘 완료한 운동 |
| 기록 | 월 캘린더(운동한 날·쉰 날·점수 농도), 날짜 상세, 주차별·월별 점수 추이 그래프 |
| 멀티 | COMING SOON (이번 버전에서는 구현하지 않음) |

하단 탭 바: 홈 / 운동 추가 / 기록 / 멀티. 화면 디자인 기준은 `stitch/` 폴더입니다.

## 기술 구성

- 화면: HTML, CSS, JavaScript (프레임워크 없음), 그래프는 SVG 직접 그리기
- 서버: Node.js 20 이상 + Express 5 (Vercel 서버리스 함수 `api/index.js`)
- DB: Neon PostgreSQL (`@neondatabase/serverless`)
- 사진: Vercel Blob (비공개 저장소)
- 테스트: Node 내장 `node:test`

```
api/index.js        Vercel 서버리스 진입점 (lib/app.js를 내보냄)
lib/app.js          Express 앱, 모든 API 라우트
lib/db.js           Neon 연결, 테이블 자동 생성
lib/auth.js         회원가입·로그인, 서명 쿠키
lib/date.js         한국 시간 기준 날짜 계산
lib/score.js        점수 계산 (순수 함수)
lib/home.js, records.js, workouts.js, photos.js   화면별 데이터 조립·검증
public/             화면 (Vercel 정적 배포 폴더)
scripts/            예시 데이터 스크립트 (로컬 전용)
test/               node:test 테스트
```

## 로컬 실행

```bash
npm install
cp .env.example .env     # 아래 환경변수를 채운다
npm run dev              # http://localhost:3000 (코드를 바꾸면 자동 재시작)
```

### 환경변수

| 이름 | 설명 |
|---|---|
| `DATABASE_URL` | Neon 연결 문자열 (Neon 대시보드 > Connect) |
| `SESSION_SECRET` | 쿠키 서명용 긴 랜덤 문자열 (32자 이상). 예: `node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"` |
| `BLOB_READ_WRITE_TOKEN` | Vercel Blob 토큰 (Vercel 프로젝트 > Storage > Blob) |

`.env`는 Git에 올리지 않습니다. 테이블은 첫 요청 때 자동으로 만들어집니다.

### 테스트

```bash
npm test          # DB 없이 도는 테스트 (DB가 필요한 테스트는 건너뜀)
npm run test:db   # .env의 실제 DB·Blob까지 사용하는 전체 테스트 (테스트 계정은 끝나면 지움)
```

### 예시 데이터

화면을 확인할 때 쓰는 로컬 전용 스크립트입니다. API나 화면에서는 실행할 수 없습니다.

```bash
npm run seed -- <아이디>               # 지난달 1일 ~ 오늘 예시 기록
npm run seed -- <아이디> --months 6    # 6개월 전 1일 ~ 오늘
npm run clear-demo -- <아이디>          # 예시 기록만 지우고 가입일을 원래대로
```

- 휴식일, 연속 구간, 20점 상한에 걸리는 날, 사진만 있는 날이 섞여 들어갑니다.
- 예시 사진은 Blob에 올리지 않고 DB에만 가짜 주소로 넣습니다. 그래서 화면에는 썸네일 대신 카메라 아이콘이 보입니다.
- 예시 운동 기록에는 메모 `[예시] seed-demo`가 붙습니다. `clear-demo`는 이 표시가 있는 기록만 지우고, 직접 입력한 기록은 남깁니다.
- `seed`는 가입일을 예시 시작일로 바꿉니다. 원래 가입일은 `scripts/.demo-signup.json`(Git 제외)에 보관했다가 `clear-demo`가 되돌립니다.

## Vercel 배포

1. **Neon**: 프로젝트를 만들고 연결 문자열을 준비합니다. 현재 DB는 `ap-southeast-1`(싱가포르)에 있습니다.
2. **Vercel 프로젝트**: Vercel에서 이 GitHub 저장소를 Import 합니다.
   - Framework Preset: **Other**. 빌드 설정은 `vercel.json`을 따릅니다 (빌드 명령 없음, 정적 폴더 `public`).
   - 함수 지역은 `vercel.json`의 `"regions": ["sin1"]`(싱가포르)입니다. DB와 같은 지역이라 쿼리가 빠릅니다. DB 지역을 바꾸면 이 값도 맞춰 주세요.
3. **Blob**: Vercel 프로젝트 > Storage > Blob 저장소를 **Private**로 만들어 이 프로젝트에 연결합니다. 연결하면 `BLOB_READ_WRITE_TOKEN`이 자동으로 등록됩니다.
4. **환경변수**: Settings > Environment Variables에 `DATABASE_URL`, `SESSION_SECRET`을 Production(필요하면 Preview도)에 등록합니다. `SESSION_SECRET`은 로컬과 다른 새 값을 권장합니다.
5. **배포**: `main` 브랜치에 push하면 자동으로 배포됩니다.
6. **배포 후 확인**: 회원가입 → 운동 추가 → 사진 업로드 → 홈·기록 숫자 확인. 개발자 도구에서 로그인 쿠키에 `Secure; HttpOnly; SameSite=Lax`가 붙었는지 봅니다.

동작 방식:
- `public/`은 정적 파일로 배포됩니다.
- `/api/*` 요청은 `api/index.js` 함수 하나(Express 앱)가 처리합니다.
- 로그인하지 않은 상태로 다른 화면에 들어오면, 화면 스크립트가 `/api/me` 401을 받고 로그인 화면으로 보냅니다.
- 서버(UTC)의 시간대 설정과 상관없이 날짜는 `lib/date.js`가 한국 시간으로 계산합니다.

## 알려진 한계

- **IP 단위 요청 횟수 제한이 없습니다.**
  - 로그인은 계정별로 5회 실패하면 10분 잠기지만, 같은 IP에서 여러 아이디를 돌아가며 시도하거나 회원가입을 대량으로 하는 것은 막지 않습니다.
  - 서버리스 환경에서 제대로 하려면 공유 저장소(DB 테이블 등)가 필요해서 이번 버전에서는 구현하지 않았습니다.
- **아이디 찾기·비밀번호 재설정이 없습니다.** 누르면 "준비 중이에요" 안내만 나옵니다.
- **멀티(친구와 함께하기)는 구현하지 않았습니다.** COMING SOON 화면만 있습니다.
- **`npm audit`에 high 4건이 표시됩니다.**
  - 원인은 `@vercel/blob → @vercel/oidc → @vercel/cli-config → zod@4.1.11` 경로입니다. `@vercel/cli-config`가 최신 버전에서도 `zod`를 `4.1.11`로 고정해 두어서, `@vercel/blob`을 최신(2.8.2)으로 써도 수정된 `zod`(4.6.6 이상)로 올라가지 않습니다.
  - npm이 제시하는 해결책은 `@vercel/blob@2.4.0`으로 내리는 것(`npm audit fix --force`)인데, 메이저 다운그레이드라 비공개 저장 기능이 보장되지 않아 적용하지 않았습니다.
  - 이 `zod`는 Vercel CLI 설정 파일을 읽을 때만 쓰이고, 사용자 입력은 거치지 않습니다. 상위 패키지가 고정을 풀면 업데이트합니다.
