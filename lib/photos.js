// 인증샷: 형식 확인, Blob 경로 생성, 화면용 변환 (순수 함수, DB·Blob 접근 없음)
const crypto = require('crypto');
const date = require('./date');

const MAX_BYTES = 2 * 1024 * 1024; // 2MB
const MAX_PER_DAY = 5;

// 파일 앞부분(매직 바이트)으로 형식을 판단한다. 브라우저가 보낸 Content-Type은 믿지 않는다.
function detectImageType(buf) {
  if (!Buffer.isBuffer(buf) || buf.length < 12) return null;
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return { mime: 'image/jpeg', ext: 'jpg' };
  if (buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return { mime: 'image/png', ext: 'png' };
  if (buf.toString('ascii', 0, 4) === 'RIFF' && buf.toString('ascii', 8, 12) === 'WEBP') return { mime: 'image/webp', ext: 'webp' };
  return null;
}

// 추측할 수 없는 경로: 128비트 난수. 사용자 id·날짜·원래 파일 이름을 넣지 않는다.
function randomPath(ext) {
  return `photos/${crypto.randomBytes(16).toString('hex')}.${ext}`;
}

// DB 행 → 화면용. Blob 주소(blob_url)는 내보내지 않고 본인 확인을 거치는 API 주소만 준다.
function toItem(row) {
  return {
    id: row.id,
    timeLabel: date.toSeoulTime(row.created_at),
    imageUrl: `/api/photos/${row.id}/image`,
  };
}

module.exports = { MAX_BYTES, MAX_PER_DAY, detectImageType, randomPath, toItem };
