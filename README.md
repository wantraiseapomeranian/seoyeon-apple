# 서연의 숫자정원

합이 10인 직사각형을 드래그해서 지우는 120초 웹게임입니다.
React + TypeScript + Vite, Cloudflare Workers + Hono, D1을 사용합니다.

## 로컬 실행

Node.js 24 LTS 권장. 프로젝트 루트에서 실행합니다.

```powershell
npm ci
npm run db:local
npm run dev
```

기본 주소: http://127.0.0.1:5173
로컬 D1 데이터는 `.wrangler/state`에 저장됩니다. 실제 Cloudflare 계정 없이 플레이와 랭킹까지 실행할 수 있습니다.
Windows 제한 환경에서 Wrangler 로그 경로 오류가 생기면 실행 전에 다음을 설정합니다.

```powershell
$env:WRANGLER_LOG_PATH = Join-Path (Get-Location) '.wrangler/logs'
```

## 검증

```powershell
npm test
npm run build
npm run test:e2e
```

- Vitest: 결정적 보드 생성, 점수/콤보 경계, 입력 검증, KST 기간, 닉네임 정책.
- Miniflare: 실제 Workers 런타임과 임시 D1에 실제 SQL 마이그레이션 적용. 쿠키 식별, 권한, 재제출, 동시 제출, 트랜잭션 롤백, 랭킹 트리거, 속도 제한 검증.
- Playwright: 설치된 Microsoft Edge를 사용. 실제 120초 한 판을 진행하므로 약 2~3분 소요. 마우스, 터치, 키보드, 모바일 폭, 모션 감소 및 랭킹/재방문 검증. Edge가 없는 환경은 Playwright 브라우저를 설치한 뒤 `playwright.config.ts`의 `channel`을 환경에 맞게 변경합니다.
- `artifacts/`에 화면 캡처, 실패 시 `test-results/`에 진단 자료가 남습니다.

## 프로젝트 구조

```text
shared/game.ts           브라우저·서버 공통 게임 엔진
shared/contracts.ts      API 응답 타입
src/                     시작·플레이·결과·랭킹 화면
worker/index.ts          인증, API, 검증, 랭킹, 정리 작업
worker/config.ts         단계 사진 및 공개 설정
worker/policy.ts         닉네임 및 랭킹 기간 정책
migrations/              D1 스키마와 랭킹 트리거
 tests/                  룰·통합·브라우저 테스트
```

## 사진 연결

현재는 실제 사진 대신 CSS로 만든 단계 안내 카드가 표시됩니다. 제공받은 `C:\Users\1\seoyeon-apple` 폴더는 확인 당시 비어 있었습니다.

1. 선정한 사진을 `public/photos/`에 넣습니다. 예: `baby.webp`, `kid.webp`, `debut.webp`, `growth.webp`, `now.webp`.
2. `worker/config.ts`의 각 단계 `image`를 `/photos/baby.webp` 같은 **같은 출처의 경로**로 설정합니다.
3. 세로형 구도를 권장하며 `object-fit: cover`로 표시합니다. `null` 또는 로딩 실패이면 안내 카드가 표시됩니다.
4. 다시 빌드하면 적용됩니다. 이미지 도메인을 별도로 쓰려면 `public/_headers`의 CSP `img-src`도 해당 출처에 한정해 수정해야 합니다.

사진 선정·실측 밸런싱은 아직 진행하지 않았습니다. 성장 단계 컷은 현재 0 / 40 / 90 / 140 / 180점이며, 최고점 200점을 가정한 임시 기준입니다.

## Cloudflare 배포 준비

현재 **로컬 구현/검증만 완료**한 상태입니다. Cloudflare 리소스 생성 및 배포는 수행하지 않았습니다.
`wrangler.jsonc`의 0으로 채워진 database_id는 로컬 개발용 식별자입니다.
실제 운영 배포를 진행할 때 별도 Worker/D1과 게임 전용 서브도메인을 사용합니다.

```powershell
npx wrangler login
npx wrangler d1 create seoyeon-game
```

반환된 실제 database_id를 `wrangler.jsonc`에 입력한 후, 해당 계정/DB가 맞는지 확인하고 실행합니다.

```powershell
npm run db:remote
npm run deploy
```

도메인은 Cloudflare Dashboard의 Worker → Settings → Domains & Routes에서 연결합니다.
기존 서연모음 서비스의 코드나 Cloudflare 리소스는 수정하지 않았습니다.

## 정책과 한계

- 인증은 서버가 발급한 무작위 256비트 비밀 토큰입니다. DB에는 SHA-256 해시만 저장합니다. HTTPS에서는 `__Host-`/HttpOnly/Secure/SameSite=Strict 쿠키를 사용합니다.
- 쿠키 삭제·다른 브라우저·다른 기기는 다른 플레이어입니다. 공개 player_id로 계정을 복구하지 않습니다.
- 닉네임은 설정/변경 후 24시간 동안 변경할 수 없습니다. 기본 금칙어/예약어 목록은 `worker/policy.ts`에서 관리합니다. 모든 변형 표현을 탐지하는 전문 필터는 아닙니다.
- 타일은 17열 × 10행. 이동/셔플 없이 빈칸이 유지됩니다. 실패 드래그는 제출 로그에 넣지 않으며 콤보를 끊지 않습니다.
- 입력은 `0 <= t < 120000`, 성공 시각은 엄격히 증가. 정확히 2400ms 차이면 콤보 유지.
- 새 게임 시작 시 같은 플레이어의 이전 게임은 무효화됩니다. 새로고침 시 진행 중 게임 복구는 지원하지 않습니다.
- 제출 기한은 서버 시작 후 150초(플레이 120초 + 전송 유예 30초)입니다. 유예 중 입력은 인정하지 않습니다.
- 정상 종료 전 제출은 전체 클리어에만 허용합니다. 서버 시각보다 미래인 액션은 거절합니다.
- 클라이언트 점수는 사용하지 않습니다. 서버가 seed와 세션에 저장한 규칙으로 다시 계산합니다.
- 로그 재생은 사람이 실제로 해당 시각에 입력했다는 증명이 아닙니다. 적법한 로그를 만드는 봇이나 시각 조작을 완전히 차단하지 못합니다.
- 10회 이상 성공 중 80ms 미만 간격이 70% 초과하면 검토 플래그로 저장하고 랭킹 반영을 보류합니다. 운영자 검토 UI는 포함하지 않았습니다.
- 전체/주간/오늘 랭킹은 플레이어별 최고점 1개, 점수 내림차순 → 달성 시각 오름차순. 밀리초까지 같은 경우 player_id로 순서를 안정화합니다.
- 한국 시간 일간/월요일 시작 주간. 게임 시작 시점의 기간에 귀속, 달성 시각은 최초 서버 제출 시각입니다. 결과 화면 순위는 개인 전체 최고 기록 기준입니다.
- 서버 설정을 바꿀 때 규칙 version을 올리고 배포합니다. 진행 중 세션은 저장된 규칙을 사용합니다. 보드 생성/점수 알고리즘 자체를 바꾸면 기존 버전의 재생 코드도 유지해야 합니다.
- 매일 KST 03:17에 만료된 rate-limit 버킷 정리, 세션 만료 처리, 7일 지난 미완료 세션 정리를 실행합니다. 결과와 검증 로그는 유지합니다.

상세 구조와 작업 상태는 `docs/ARCHITECTURE.md`, `docs/PLAN.md`를 참고하세요.
