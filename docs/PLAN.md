# 구현 상태

## 합의한 범위

2026-09-15 명세 v0.1 기반. React/TypeScript/Vite, Workers/Hono/D1, 정적 사진 자산.
기존 프로젝트는 Cloudflare 사용 조건만 공유하며 별도 게임으로 구현한다.
최초 구현 범위에는 원격 배포가 없었으며, 2026-10-04 사용자 승인으로 Cloudflare 배포와 필요한 설정 변경·commit/push를 진행했다.

## 완료

- P0: 17×10 보드, 마우스·터치·키보드 선택, 합 10 제거, 120초.
- P1: 결정적 seed 생성, 24개 이상 초기 유효 영역, 점수/보너스/콤보/통계.
- P2: 반응형 시작·게임·결과 화면, 5단계 카드, 타이머 경고, 모션 감소 지원. 실제 사진은 미연결.
- P3: 브라우저 쿠키 식별, nickname#tag, 24시간 이름 변경 제한 및 기본 필터.
- P4: 서버 로그 재생, 세션 소유권/만료, 원자적 제출, 재시도 응답, IP/플레이어 제한, 검토 플래그.
- P5: 전체/주간/오늘 랭킹, TOP 5, 순위/상위 %, 개인 최고점, 동점 정책.
- 개발 문서, SQL 마이그레이션, 빌드/테스트/로컬 실행 스크립트.
- Cloudflare Worker `seoyeon-apple`, D1 `seoyeon-game` 연결 및 초기 마이그레이션 적용, 기본 도메인 배포.

## 남은 제품 작업

- 실제 성장 사진 5장 선정/연결. 제공 경로는 확인 당시 비어 있음.
- P6: 실제 사용자 20~50판 이상으로 유효 조합 수/단계 점수 컷/봇 플래그 임계값 실측.
- 운영 닉네임 필터 목록 보강 및 검토 플래그 운영 절차 확정.

## 배포 경로

- 운영 주소: https://seoyeon-apple.seoyeon-archive.workers.dev/
- GitHub 저장소: `wantraiseapomeranian/seoyeon-apple`, 운영 브랜치: `codex/initial-game`.
- Cloudflare Workers and Pages GitHub 앱에 이 저장소 접근을 허용했으며, 운영 브랜치 push를 Workers Builds가 자동으로 빌드·배포한다.
- 빌드 명령: `npm run build`, 배포 명령: `npx wrangler deploy`, 루트 경로: `/`, 감시 경로: `*`.
- 배포 결과는 Workers Builds의 커밋 SHA 및 성공 상태와 GitHub check에서 확인한다.

## 검증 기록

- `npm test`: 룰/정책 12개, 실제 Workers + D1 통합 10개, 총 22개 통과.
- `npm run build`: TypeScript 검사 및 클라이언트/Worker 프로덕션 번들 통과.
- `npm run test:e2e`: 실제 120초 게임·검증 점수·3개 랭킹·재방문, 모바일 터치/취소/모션 감소, 키보드 선택 3개 통과.
- PC 보드 높이 조정 후 모바일/키보드 회귀 검사 및 최종 빌드를 별도로 수행.

실제 사진 및 밸런싱이 남아 있으므로 문서의 전체 V1 완료로 표시하지 않는다.
