# Mukdang product1 서비스 전수 감사

- 감사 대상: `jwhtws/product1` 사용자 서비스만 해당
- 제외 대상: `product2`, `product2-admin`, 관리자 UI 일체
- 감사 기준 시각: 2026-08-04 UTC
- 기준 브랜치/커밋: `main`, 감사 시작 시 `bbabde51d8fb5a6942fccacc0e3391fa6398fe9f`
- 방법: 저장소 정적 분석, 데이터 93건 전수 검사, `mukdang.com`/`product1-84t.pages.dev` HTTP 및 실제 브라우저 검사, GitHub Actions/Cloudflare Pages 읽기 전용 조회, 기존 테스트 실행
- 제한: Cloudflare 대시보드의 빌드 명령·환경변수 값·브랜치 정책, D1/KV 운영 데이터, Search Console, 실제 사용자 분석 데이터는 권한 화면에서 수동 확인이 필요하다. 비밀값은 출력하지 않았다.

## 1. Executive Summary

Mukdang은 정적 데이터와 Pages Functions를 결합한 실제 동작 서비스이며, 푸드 팝업 93건의 필수 필드·공식 링크·날짜·중복 계약은 양호하다. 팝업 검색, 필터, 상세, 공식 링크, 지도, 공유는 320px부터 데스크톱까지 동작했고 Functions/D1도 라이브에서 정상 응답했다. 개별 팝업 SEO 페이지 93개는 고유 title/canonical, description, Open Graph, Event JSON-LD, sitemap을 갖춘다.

그러나 현재 상태를 출시 준비 완료로 판정할 수는 없다. 가장 큰 문제는 데이터 생성과 실제 Cloudflare Pages 배포가 분리돼 있다는 점이다. `main`과 GitHub의 Pages 배포는 최신인데, 사용자 앱이 고정 참조하는 `product1-84t.pages.dev/data/popups.json`은 더 오래된 배포를 제공한다. Cloudflare Pages 프로젝트는 Git Provider가 `No`이고 최신 production source도 `a809e42`로, 감사 시작 커밋 `bbabde51` 및 최신 팝업 데이터 커밋과 다르다. 즉 수집 성공이 사용자 반영을 보장하지 않는다.

첫 화면도 맛집 메시지·메타데이터와 푸드 팝업 기본 탭이 충돌한다. 팝업에는 저장/최근 본 기능이 없고, 분석은 식당 검색·저장·목록 정도만 기록한다. 가입 화면은 약관·개인정보 처리방침 동의를 선언하지만 실제 문서 링크가 없으며, 익명 활동 이벤트와 리뷰 helpful 쓰기는 별도 rate limit 없이 D1에 기록된다. E2E 18개 중 8개가 실패했지만 CI는 `npm run check`만 실행해 이를 배포 전에 차단하지 않는다.

### 출시 판정

- **P0 Blocker 1건**: 핵심 팝업 데이터 배포 자동화/일관성 부재.
- **Critical 3건**: 개인정보·약관 고지 부재, soft-404, 무인증 쓰기 남용 방어 부재.
- **권고**: P0와 Critical의 운영·법무·보안 완료 기준을 충족한 뒤 공개 성장 캠페인 또는 유료 제휴를 시작한다.

## 2. 현재 아키텍처

### 주요 구성

| 구분 | 파일/경로 | 역할 |
|---|---|---|
| 사용자 진입 | `index.html` | 메타데이터, 검색/필터/모달/문의 기본 DOM |
| 사용자 UI | `app.js`, `styles.css`, `js/api.js`, `js/site-plan.js` | 검색, 팝업/맛집 렌더링, 인증, 리뷰, 저장, 반응형 UI |
| 팝업 운영 데이터 | `data/popups.json` | 사용자 화면과 SEO 생성의 기준 데이터 |
| 팝업 보조 데이터 | `data/curated-popups.json`, `data/popup-venues.json`, `data/popup-coverage.json` | 수동 공식 일정, 시설 원장, 수집 범위 |
| 팝업 수집 | `scripts/refresh-food-popups.mjs` | 유통사 수집, 정규화, 필터, 병합, 중복 제거, 급감 보호 |
| 롯데 수집 | `scripts/lib/lotte-popup-collector.mjs` | 롯데 공식 결과 상세 수집 |
| 실행 보고서 | `scripts/lib/popup-run-report.mjs` | 실행·출처별 발견/수락/제외/오류 보고 |
| SEO 생성 | `scripts/build-seo-pages.mjs` | 팝업/식당 상세·집합 페이지와 sitemap 생성 |
| Functions | `functions/api/**`, `functions/_lib/auth.js` | 인증, D1 리뷰/사용자 데이터/활동, 장소 검색, 사진, VWorld |
| DB | `schema.sql`, `migrations/**` | D1 사용자·리뷰·활동·설정 스키마 |
| Cloudflare | `wrangler.toml`, `_headers`, `.assetsignore` | Pages 출력, D1/KV binding, 보안/캐시 헤더, 배포 제외 |
| 테스트 | `scripts/validate-project.mjs`, `tests/search.spec.js` | 코드·데이터 계약과 Playwright E2E |
| 자동화 | `.github/workflows/*.yml` | 코드 검사, 팝업 갱신, 식당 갱신 |

### 데이터 흐름

```text
유통사 공식 API / HTML / sitemap / 공식 상세
  → scripts/refresh-food-popups.mjs
  → 식품·팝업·날짜 필터 / 정규화 / 이전 데이터 병합 / 중복 제거 / 급감 보호
  → data/popups.json + data/popup-coverage.json + 실행 보고서
  → scripts/build-seo-pages.mjs
  → food-popups/**/index.html + sitemap.xml
  → GitHub Actions가 main에 커밋
  → [현재 단절] 수동 Cloudflare Pages production 배포
  → product1-84t.pages.dev/data/popups.json
  → app.js가 이 절대 URL을 no-store로 로드
  → mukdang.com 사용자 카드·모달

사용자 인증/리뷰/저장/활동
  → /api/* Pages Functions
  → Cloudflare D1 + REVIEW_PHOTOS KV
```

### 환경변수·비밀값

- 코드가 참조하는 비밀/설정: `SESSION_SECRET`, `RESEND_API_KEY`, `EMAIL_FROM`, `GOOGLE_PLACES_API_KEY`, `NAVER_CLIENT_ID`, `NAVER_CLIENT_SECRET`, `VWORLD_API_KEY`, `VWORLD_DOMAIN`, Actions의 `DATA_GO_KR_SERVICE_KEY`.
- 저장소 검색에서 평문 비밀값은 발견하지 않았다. `wrangler.toml`에는 공개 식별자인 D1/KV ID만 있다.
- 세션 쿠키는 `HttpOnly; Secure; SameSite=Strict`; 비밀번호는 PBKDF2-SHA256 100,000회; 이메일 코드는 HMAC 저장이다.
- Cloudflare Secret 실제 설정 여부와 rotation 일자는 운영자가 수동 확인해야 한다.

## 3. 실제 배포 상태

### 확인 결과

| 항목 | 결과 | 판정 |
|---|---|---|
| 라이브 HTML/app.js | 로컬과 SHA-256 일치, HTTP 200 | 정상 |
| 라이브 Functions | `/api/auth/me`, `/api/reviews`, `/api/events` 모두 200 | 정상 |
| Cloudflare 프로젝트 | `product1`, 도메인 `product1-84t.pages.dev`, `mukdang.com`, Git Provider `No` | 위험 |
| Cloudflare 최신 production | source `a809e42`, 감사 시점 약 11시간 전 | main 미연결 |
| GitHub Pages workflow | 최신 push에 성공 | Cloudflare production 반영 증거 아님 |
| 팝업 데이터 | 저장소 `2026-08-03T22:31:41Z`, Pages feed `2026-08-03T04:50:17Z` | 불일치 |
| 캐시 | HTML/data `max-age=0`, app.js `max-age=14400`; 앱은 Pages feed에 timestamp+`no-store` | 브라우저 캐시 원인 아님 |
| 서비스 워커 | 없음 | stale 원인 아님 |
| 404 | 임의 미존재 URL이 메인 HTML과 HTTP 200 반환 | soft-404 |
| 최근 Actions | 코드 품질·팝업 갱신 성공, 식당 정기 검증 실패 | 일부 장애 |
| 식당 갱신 실패 원인 | `DATA_GO_KR_SERVICE_KEY` Actions Secret 미설정 | 운영 조치 필요 |

앱은 상대 경로가 아니라 `https://product1-84t.pages.dev/data/popups.json`을 직접 읽는다. 따라서 `mukdang.com`의 HTML 배포와 Cloudflare Pages 정적 데이터 배포가 다르면 한 화면에서 서로 다른 릴리스가 합쳐진다. 현재 팝업 ID 93개는 같지만 feed의 `updatedAt`과 저장된 상태 집계가 오래됐다. 클라이언트가 날짜 상태를 재계산해 화면 수치는 78/0/15로 보이므로 장애가 숨겨진다.

### 운영자가 수동 확인해야 할 항목

1. Cloudflare Pages `product1`의 production branch, direct upload 주체, build command, output directory가 실제로 무엇인지 확인한다.
2. `mukdang.com` DNS/Custom Domain이 Cloudflare Pages와 GitHub Pages 중 어느 정적 origin을 사용하도록 구성됐는지 확인한다.
3. `main` push 후 Cloudflare deployment를 만드는 공식 단일 경로와 실패 알림을 지정한다.
4. Functions bindings(D1 `DB`, KV `REVIEW_PHOTOS`) 및 모든 Secret의 production/preview 분리를 확인한다.
5. Cloudflare Web Analytics를 사용할지 결정하고, 사용한다면 CSP nonce/hash 또는 허용 origin을 보안 검토 후 설정한다.
6. 배포 후 commit SHA와 `data/popups.json.updatedAt`을 확인하는 smoke check를 운영 절차에 넣는다.

## 4. 핵심 사용자 여정

### A. 신규 방문자

| 단계 | 정상 동작 | 혼란·이탈 위험 | 모바일/오류 |
|---|---|---|---|
| 메인 접속 | 320~1280px 로드, 가로 스크롤 없음 | H1은 “광고 말고, 진짜 맛집”, 기본 탭은 푸드 팝업이라 목적 충돌 | CSP 콘솔 오류와 외부 폰트 404성 오류 |
| 목적 이해 | 식당/푸드 팝업 탭 제공 | meta/title/hero/인기 문구는 맛집, 실제 첫 목록은 팝업 | 첫 인지 비용 큼 |
| 진행 팝업 탐색 | 93건 요약, 첫 24개, 상태 배지 | 오늘 종료/이번 주 종료/인기 전용 UI 없음 | 320px 정상 |
| 지역/카테고리 | 음식·지역·장소·정렬 필터 | 모바일에서는 필터 버튼을 한 번 더 열어야 함 | 기존 모바일 테스트 통과 |
| 카드/상세 | 카드·이름 클릭으로 모달, 공식 SEO URL은 보조 | 일반 클릭이 고유 URL로 이동하지 않아 공유/뒤로가기 의미가 약함 | 모달 스크롤 초기화 정상 |
| 지도/공식 링크 | 네이버·Google·공식 링크 존재 | 클릭 계측 없음 | 외부 링크 새 창 정상 |
| 저장/공유 | 공유 존재 | **팝업 저장 없음**, 저장 목록은 맛집 전용 | 재방문 동기 부족 |

### B. 검색 사용자

| 흐름 | 판정 | 관찰 |
|---|---|---|
| 브랜드명 | 정상 | “현대” 검색 39건, 첫 24건 표시 |
| 장소명 | 정상 | `venue`, `address`, `region` 포함 부분 일치 |
| 지역명 | 정상 | 검색과 별도 지역 필터 모두 가능 |
| 결과 없음 | 정상 | 빈 상태 문구 제공 |
| 오타 | 보완 필요 | 팝업은 단순 정규화 substring이며 유사어/오타 교정 없음 |
| 필터 초기화 | 정상 | 팝업 전용 초기화 제공 |
| 맛집 검색 | 기능은 존재 | 기본 탭이 팝업인데 E2E 5개가 식당 탭 전환 없이 검색해 실패; 테스트와 실제 UX 계약 불일치 |

### C. 재방문 사용자

- 최근 본 팝업: 없음.
- 저장한 팝업: 없음. 로컬/서버 저장은 `name|address` 식당 ID 중심이다.
- 종료된 저장 팝업: 해당 개념 없음.
- 비로그인 맛집 저장: localStorage에 저장 가능.
- 로그인 맛집 저장: D1 `user_data`로 동기화되지만 로그인 전 localStorage 저장을 계정으로 병합하는 코드가 없다.
- 팝업 리뷰: 로그인 사용자 D1 리뷰를 사용할 수 있으나 팝업 고유 ID와 식당 ID가 동일 테이블에 혼재한다. 관리자/분석 분리 여부는 수동 확인이 필요하다.

## 5. 서비스 정체성

- 핵심 가치가 한 문장으로 명확한가: **아니오**. hero는 맛집 리뷰, 기본 검색 모드는 푸드 팝업이다.
- 맛집과 팝업이 경쟁하는가: **그렇다**. 같은 hero·검색·그리드·저장/리뷰 모델을 공유하지만 기능 완성도가 서로 다르다.
- 푸드 팝업 전문 서비스로 인식되는가: 기본 탭과 데이터는 그렇지만 `<title>`, description, OG, H1, footer는 맛집 서비스로 인식시킨다.
- 주요 CTA: 검색 버튼이지만 빈 검색에서는 둘러보기가 이미 가능해 CTA 의미가 약하다.
- 검색 없이 탐색: 가능. 24개 카드와 필터·페이지네이션 제공.
- 오늘 종료/이번 주 종료/신규/인기/지역별: 정렬 일부와 SEO `this-week`, 지역 페이지는 있으나 메인에서 명시적인 탐색 CTA가 없다. 인기 팝업은 없다.
- 복잡도: 메뉴 자체는 작지만 맛집 인증·리뷰·저장과 팝업 탐색이 한 화면에서 다른 규칙으로 작동한다.

**구현하지 않은 권고안:** 서비스의 1순위 정체성을 결정하고 title/hero/CTA/기본 탭을 일치시킨다. 팝업 중심이면 “오늘 갈 수 있는 공식 푸드 팝업” 같은 단일 문장, 진행/이번 주 종료/신규/지역 quick links, 팝업 저장을 우선한다. 맛집은 별도 명시적 탭으로 유지한다.

## 6. 데이터 품질

### 전수 검사 결과

| 지표 | 값 |
|---|---:|
| 전체 | 93 |
| 진행 중 / 예정 / 종료 | 78 / 0 / 15 |
| ID·이름·장소·주소·시작일 누락 | 각 0 |
| 종료일 누락 | 1 (종료일 미정 계약) |
| 공식 URL·sourceName 누락 | 각 0 |
| 날짜 형식 오류 / 역전 | 0 / 0 |
| 정규화 identity 중복 후보 | 0그룹 |
| 대표 이미지 누락 | 8 (8.6%) |
| officialImageUrls 보유 | 85 (91.4%) |
| 메뉴 보유 | 82 (88.2%) |
| 가격 포함 메뉴 보유 | 70 (75.3%) |
| 위도·경도 | 0 (0%) |
| `sourceItemId` | 0 (0%); 현재 공식 ID는 주로 `id`에 포함 |
| `firstSeenAt` / `lastSeenAt` | 93 / 93 |
| `lastCheckedAt` | 0; `lastVerifiedAt`을 대신 사용 |
| confidence/reviewStatus | 0 / 0 |
| 공식 이미지 URL 실측 | 고유 291개 중 291개 HTTP 200/206 |

필수 계약은 좋지만 “공식 ID”, “마지막 확인”, “신뢰/검토 상태” 필드 명세가 요청 관점과 다르거나 없다. `lastSeenAt`과 `lastVerifiedAt`의 의미를 문서화하고, 운영자가 검토한 수동 데이터와 자동 수집 데이터의 신뢰도를 구분해야 한다. 이미지 8건은 UI가 fallback/미공개 상태를 표시하므로 데이터 오류는 아니지만 전환율에는 영향을 준다.

기존 운영 데이터는 수정하지 않았으며 별도 자동 수정 파일도 만들지 않았다. 이 절이 읽기 전용 `data-audit` 결과다.

## 7. 수집 시스템

### 공통 기능

- 지원 출처: 현대, 신세계, 스타필드, 갤러리아, AK플라자, NC·뉴코아, 아이파크몰, 이마트·트레이더스, 롯데마트, 홈플러스, 공식 쇼핑몰/마트 sitemap, 롯데 블로그, 롯데백화점/아울렛/몰.
- 방식: JSON API, HTML, sitemap, RSS, 수동 공식 일정 보강.
- 페이지네이션: 현대 최대 50페이지/검색어, 스타필드 API page count, sitemap/HTML별 제한.
- 네트워크: 20~25초 timeout, 최대 3회 재시도, curl bounded fallback.
- 오류 격리: collector 단위 `Promise` 결과 격리, 일부 지점 단위 경고, `--strict`에서는 전체 반영 중단.
- 판별: 팝업/food 키워드, non-human-food 제외, 날짜 정규화, 2년 이전 종료 제외.
- 병합: 공식 ID 우선 이전 데이터 보존, identity 기반 중복 제거, 공식 source grade 우선.
- 부분 실행: `--retailer`; 다른 출처 데이터/상태 보존.
- 전체 실행: Actions 예약, `--strict`, SEO 재생성, check 후 커밋.
- 실행 보고서: 실행/출처별 발견·반환·제외·중복·오류 및 비밀 마스킹.
- 급감 감지: 유지 대상 대비 20% 이상 감소 시 쓰기 중단.
- 관리자 수정값 보호: 별도 관리자 override 계층은 없다. 이전 행 병합은 일부 필드를 보존하지만 collector 새 값이 덮어쓴다. product2는 이번 감사에서 확인하지 않았다.

### 출처별 등급

| 출처 | 방식 | 등급 | 근거/보완점 |
|---|---|---|---|
| 현대 | 공식 JSON 검색 + 상세 HTML | 안정 | 페이지네이션·상세·실제 191 후보 계측 가능; 검색어 중복 7건 감지 |
| 신세계 | 이벤트 HTML + 지점 JSON + 상세 | 보완 필요 | 마크업 대체 파서가 필요하고 detail throttling 재시도 존재 |
| 스타필드 | 지점별 JSON + 수원 수동 공식 일정 | 보완 필요 | 지점 오류를 경고 후 삼키며 수원 정적 일정의 만료 관리 필요 |
| 갤러리아 | HTML + 수동 공식 일정 | 장애 위험 | 공식 목록 링크 변화에 민감하고 현재 동적 링크 수집이 0일 수 있음 |
| AK플라자 | HTML | 장애 위험 | 한 지점 오류가 collector 전체 실패로 번질 수 있음 |
| NC·뉴코아 | 지점 HTML | 보완 필요 | 지점별 격리 있으나 HTML 정규식 의존 |
| 아이파크/이마트/롯데마트/홈플러스 | 공통 HTML adapter | 장애 위험 | 보수적 정규식, no-result가 정상/파서 장애인지 구분 어려움 |
| 공식 sitemap 묶음 | sitemap + 상세 HTML | 보완 필요 | bounded queue는 있으나 사이트 구조/robots 변경 모니터링 필요 |
| 롯데 공식 블로그 | RSS | 보완 필요 | 제목·본문의 날짜/장소 정규식 의존 |
| 롯데 계열 | curated + 공식 검색/상세 | 보완 필요 | 정교하지만 수동 seed 의존 및 override 정책 불명확 |

실행 보고서가 생성돼도 현재 workflow의 `git add` 목록에는 `data/food-popups/run-report.json`이 없어 artifact/커밋으로 보존되지 않는다. 이전 실행 대비 수치 추세 분석도 아직 없다.

## 8. SEO

### 전수 및 샘플 10개

93개 상세 전체에서 title/canonical 중복 0, description/canonical/OG title/JSON-LD/H1 누락 0이었다. OG image 누락 8, Twitter metadata 누락 93, Breadcrumb JSON-LD 누락 93이었다. sitemap은 115 URL이며 팝업 관련 107 URL, non-ASCII URL 0으로 퍼센트 인코딩돼 있다. robots는 상세 페이지를 허용한다.

| 샘플 | 고유 title/canonical | description/OG | JSON-LD | 이미지 | 문제 |
|---|---|---|---|---|---|
| 31건어물&늘봄 | 통과 | 통과 | Event | 있음 | Twitter/Breadcrumb 없음 |
| 3층 다락빵 | 통과 | 통과 | Event | 있음 | 동일 |
| 555크림 | 통과 | 통과 | Event | 있음 | 동일 |
| 강릉길감자 | 통과 | 통과 | Event | 있음 | 동일 |
| 보따리제과점 | 통과 | 통과 | Event | 있음 | 동일 |
| 아페롤 | 통과 | 통과 | Event | 있음 | 동일 |
| 어글리베이커스베이글 | 통과 | 통과 | Event | 있음 | 동일 |
| 우베리상하이모찌 | 통과 | 통과 | Event | 있음 | 동일 |
| TDBD 더데일리브레드 | 통과 | 통과 | Event | 있음 | 동일 |
| 갓구운빵공장 | 통과 | 통과 | Event | 있음 | 동일 |

### 주요 SEO 문제

- 종료된 팝업도 JSON-LD `EventScheduled`로 고정된다. 종료 상태/과거 이벤트 정책이 없다.
- 미존재 URL이 200 메인 페이지를 반환해 대규모 soft-404·중복 신호가 생긴다.
- 상세 페이지는 breadcrumb UI/JSON-LD와 Twitter card가 없다.
- 지역 집합 페이지는 8개, 유통사 4개뿐이며 음식 카테고리/장소별 집합 페이지가 없다.
- 상세 본문은 기간·주소·메뉴 중심으로 얇고 유사 템플릿이다. 메뉴 없는 페이지는 thin content 위험이 더 크다.
- 목록의 일반 클릭은 모달을 열어 canonical 상세 URL 방문을 막는다. 검색엔진 링크는 존재하지만 사용자 내부 링크 신호가 약하다.
- 메인 title/description/OG는 맛집 중심이라 기본 팝업 화면과 불일치한다.
- sitemap 샘플 12개는 모두 HTTP 200이었다.

## 9. 성능

### 측정

- 원본 크기: `app.js` 90.9KB, `styles.css` 43.7KB, `data/popups.json` 183KB, `data/food-search.json` 216KB.
- 390px 브라우저 CDP 측정(감사 네트워크 환경): DOMContentLoaded 234ms, load 235ms, resource 45개, transfer 약 70KB, decoded 약 257KB, task duration 약 596ms, JS heap 약 1.46MB, DOM node 1,621개.
- 첫 팝업 화면은 24개 카드 이미지 URL을 CSS background로 즉시 요청한다. `<img loading=lazy>`는 상세 갤러리에만 있다.
- 공식 이미지 고유 URL 291개는 감사 시 모두 응답했지만 브라우저 동시 실행에서 신세계 이미지 일부 connection reset이 관찰됐다.
- 로컬 AI fallback PNG 5개가 각 2.2~2.5MB로 매우 크다. fallback 노출 시 모바일 비용이 크다.
- app.js는 UI·검색·인증·리뷰·지도·분석을 한 파일에서 실행한다. 초기 팝업 화면에서도 맛집 데이터와 API 인기 검색/리뷰를 함께 요청한다.
- 팝업 JSON은 93건 전체를 한 번에 로드한다. 현재 183KB라 수용 가능하지만 성장 시 pagination/분할 기준이 필요하다.
- app.js는 4시간 캐시인데 정적 version 문자열 수동 갱신 방식이다. 팝업 feed는 no-store timestamp로 매번 183KB를 재다운로드한다.
- 이벤트 리스너는 render마다 새 DOM에 연결되므로 즉시 누수 증거는 없지만 단일 파일의 재렌더/비동기 요청 취소 정책은 없다.

Lighthouse CLI는 설치돼 있지 않고 lockfile도 없어 패키지를 추가하지 않았다. 대신 실제 Chromium의 Navigation Timing/CDP Performance와 리소스 요청을 사용했다. 정식 출시 전 운영 환경에서 Lighthouse mobile 3회 중앙값과 Core Web Vitals RUM을 별도로 수집해야 한다.

## 10. 모바일·접근성

### 반응형 결과

| 폭 | 가로 스크롤 | 팝업 카드/검색/모달 | 판정 |
|---:|---|---|---|
| 320 | 없음 | 정상 | 통과 |
| 375 | 없음 | 정상 | 통과 |
| 390 | 없음 | 정상 | 통과 |
| 768 | 없음 | 정상 | 통과 |
| 1280 | 없음 | 정상 | 통과 |

### 접근성/사용성 문제

- 카드 전체가 `tabindex=0`이고 Enter는 지원하지만 Space 활성화가 없으며 중첩된 `<a>`와 이중 상호작용 의미가 충돌한다.
- 모달은 role/aria-modal/label을 갖지만 열 때 초점 이동, focus trap, 닫은 뒤 trigger로 초점 복원이 없다.
- 닫힌 모달은 HTML에 항상 존재하며 `hidden`/`inert` 상태 관리가 명시적이지 않다.
- 전체 focus-visible 체계는 일부 메뉴에만 명시돼 있다.
- 실제 DOM 검사에서 `<img>` alt 누락과 이름 없는 버튼은 0이었으나 카드 이미지는 CSS background라 대체텍스트 자체가 없다.
- 로딩/빈 상태는 텍스트가 있으나 팝업 목록 grid의 `aria-live`가 전체 카드 재삽입을 과도하게 읽을 수 있다.
- 색상 대비는 자동 도구로 수치 검증하지 못했다. muted 9~11px 텍스트가 많아 모바일 저시력 사용자에게 위험하다.
- 터치 영역은 메뉴 토글 44px이지만 일부 quick/button/link는 44px 미만일 수 있다.
- 회원 탈퇴가 `prompt`/`confirm`에 의존해 스타일·접근성·오류 안내가 일관되지 않다.

## 11. 보안

### 양호한 점

- 평문 API key/token/cookie 값은 추적 파일에서 발견되지 않았다.
- 세션 쿠키 플래그, HMAC 서명, PBKDF2, 로그인/가입/이메일 코드 제한, parameterized D1 query, 이미지 magic-byte/2MB 검사가 있다.
- `innerHTML` 사용은 많지만 외부 데이터 출력 대부분 `escapeHtml`을 거친다. JSON-LD도 `<`를 escape한다.
- 외부 링크는 대체로 `noopener`; Places photo key는 정규식 검증; 쓰기 API는 cross-origin browser Origin을 차단한다.
- `_headers`에 CSP, frame deny, nosniff, referrer, permissions policy가 있다.

### 위험

- `/api/events` POST는 비로그인 허용, global/IP rate limit 없음. D1 spam과 분석 오염 가능.
- `/api/reviews/:id/helpful` POST도 비로그인·중복 방지·rate limit 없음. 지표 조작 가능.
- CSRF token은 없지만 SameSite=Strict와 Origin 검사가 일반 브라우저 cross-site 쓰기를 방어한다. Origin 없는 자동화 요청에 대한 별도 정책은 없다.
- `functions/api/building.js`는 upstream 오류 메시지 `detail`을 클라이언트에 반환한다. 현재 비밀은 없지만 내부 공급자 정보 노출 가능.
- CSP가 `'unsafe-inline'`을 허용하고 Cloudflare analytics beacon은 반대로 허용 목록에 없어 차단된다. nonce/hash 기반으로 정리해야 한다.
- 모든 정적 경로가 SPA fallback 200이어서 숨겨야 할 경로가 실수로 공개될 위험을 탐지하기 어렵다.
- `node_modules` 187개 파일과 `test-results/.last-run.json` 1개가 이미 Git에 추적돼 있다. `.gitignore`만으로 제거되지 않으며 저장소 pack은 약 202MB다.
- lockfile이 없어 `npm audit`이 `ENOLOCK`으로 실패했다. `package.json`에는 dependencies/devDependencies도 없는데 Playwright는 추적된 node_modules에 의존한다. 재현성·공급망 검증이 없다.
- 공개 source map은 발견되지 않았다.

## 12. 분석·성장·수익화

### 이벤트 측정 가능 여부

| 이벤트 | 현재 | 비고 |
|---|---|---|
| 메인 방문 | 불가 | Cloudflare beacon이 CSP로 차단 |
| 카드 노출 | 불가 | 이벤트 없음 |
| 카드 클릭 | 불가 | 이벤트 없음 |
| 검색 | 일부 | 식당 검색만 D1 `search`; 팝업 검색은 기록하지 않음 |
| 필터 | 불가 | 이벤트 없음 |
| 저장 | 일부 | 맛집 save만 기록; 팝업 저장 없음 |
| 공유 | 불가 | 이벤트 없음 |
| 지도 클릭 | 불가 | 이벤트 없음 |
| 공식 링크 클릭 | 불가 | 이벤트 없음 |
| 팝업 등록 제출 | 기능 없음 | 고객 문의로 대체 불가 |
| 광고 문의 | Formspree 전송만 | 자체 전환 이벤트/DB 없음 |
| 재방문 | 불가 | 익명 cohort/consent 체계 없음 |

### 사업 기능

- 브랜드 무료 등록: 없음.
- 오류 제보: 일반 고객 문의에서 식당 정보 수정은 가능하지만 팝업 전용 제보·대상 ID 자동 첨부 없음.
- 광고·제휴 문의: footer Formspree 폼 존재.
- sponsored/recommendation field: 팝업 데이터에 없음.
- 스폰서 노출 위치: 없음.
- 노출·클릭·브랜드 성과 보고: 없음.
- 개인정보 동의: 가입 문구만 있고 문서/버전/동의 기록 없음.
- 문의 저장 위치: 외부 Formspree. 보존기간, 처리자, DPA/개인정보 고지가 저장소에 없음.

수익화 전에 이벤트 taxonomy, consent/legal basis, 팝업 식별자, 노출·클릭의 중복 제거, sponsored 명시 정책, 브랜드 제출/검수 SLA가 먼저 필요하다. 단순 광고 슬롯 추가는 측정과 신뢰 기반이 없어 권장하지 않는다.

## 13. 테스트·저장소 상태

### 실행 결과

| 명령 | 결과 |
|---|---|
| `npm run check` | 통과: 코드 33개와 데이터 계약 |
| `node --test scripts/lib/popup-run-report.test.mjs` | 통과 |
| `TEST_BASE_URL=https://mukdang.com/ npm test` | 실패: Playwright 18개 중 10 통과, 8 실패; 별도 node test 8 통과 |
| `npm audit --omit=dev` | 실행 불가: lockfile 없음 (`ENOLOCK`) |
| `npm outdated` | 선언 dependency가 없어 유효한 결과 없음 |
| `npm run build` | script 없음; Pages output은 저장소 루트 `.` |

E2E 실패 중 맛집 검색 5개는 기본 모드가 팝업으로 바뀌었는데 테스트가 식당 탭을 선택하지 않아 발생한다. 나머지는 상세 section 순서, 첫 페이지 종료 카드 가정, 롯데 fallback 이미지 가정이 현재 구현과 달라졌다. 즉 다수는 운영 장애보다 **테스트가 제품 계약을 따라가지 못한 문제**다. 그러나 코드 품질 workflow가 E2E를 실행하지 않아 실제 회귀도 배포를 막지 못한다.

### 자동화/저장소

- code-quality: push/PR에서 `npm run check`만 실행.
- food-popup-refresh: 수집→SEO→check→commit. Cloudflare deploy 단계 없음; 실행 보고서 보존 없음.
- restaurant-data-validation: Secret 누락으로 최근 실패.
- 실패 시 팝업/식당 workflow는 이슈를 생성한다.
- lockfile 없음, dependencies 선언 없음, 추적 node_modules 존재.
- `.gitignore`는 `node_modules`와 CSV만 포함하며 `.wrangler`, `test-results`, audit/report runtime 파일을 충분히 제외하지 않는다.
- `.assetsignore`는 대용량 CSV/node_modules/scripts/tests 등을 배포에서 제외하지만 backup popup JSON 등 운영 불필요 산출물은 남을 수 있다.
- `ARCHITECTURE.md`는 “배포 완료는 live 확인”을 말하지만 이를 자동화한 smoke check가 없다.

## 14. 문제 우선순위

| ID | 영역 | 문제 설명 | 사용자 영향 | 사업 영향 | 기술 위험 | 심각도 | 예상 범위 | 관련 파일/설정 | 권장 해결책 | 완료 기준 |
|---|---|---|---|---|---|---|---|---|---|---|
| DEP-01 | 배포 | main/수집 커밋과 Cloudflare Pages production이 자동 연결되지 않음 | 오래된 팝업 일정 노출 | 핵심 신뢰 훼손 | 릴리스 혼합·무기한 stale | **Blocker** | 중 | `app.js`, workflows, Cloudflare Pages | 단일 production 배포 파이프라인과 SHA/data smoke check | main 커밋 후 정해진 시간 내 Pages source SHA·feed updatedAt 일치, 실패 시 배포 차단/알림 |
| LEG-01 | 개인정보 | 약관·개인정보 문서/링크/동의 기록 없이 계정·리뷰·활동·문의 수집 | 권리·처리방침 불명확 | 법무/제휴 리스크 | 동의 증적 부재 | **Critical** | 중, 법무 포함 | `index.html`, `app.js`, D1, Formspree 설정 | 법무 검토 문서, 명시 링크, 버전 동의/보존·삭제 정책 | 가입 전 문서 열람, 동의 버전 저장, 문의/분석 처리근거 공개 및 법무 승인 |
| SEO-01 | SEO/라우팅 | 미존재 경로가 HTTP 200 메인 HTML | 잘못된 링크도 오류 안내 없음 | 색인 품질·크롤 예산 악화 | soft-404 대량 생성 | **Critical** | 소~중/Cloudflare | Pages routing/404 | 실제 404 페이지와 status, SPA 필요 경로만 fallback | 임의 경로 404, 유효 상세 200, Search Console soft-404 감소 |
| SEC-01 | API | 익명 events/helpful 쓰기 rate limit·중복방지 없음 | 순위/유용성 조작 | 분석·사회적 증거 무가치 | D1 spam/비용 | **Critical** | 중 | `functions/api/events.js`, `reviews/[[path]].js` | IP/session rate limit, idempotency/unique vote, bot 방어 | 반복 요청 429, 한 주체 1표, 부하 테스트·모니터링 통과 |
| IDN-01 | 정체성 | 맛집 hero/meta와 팝업 기본 화면 충돌 | 첫 방문 혼란·이탈 | 포지셔닝 약화 | 콘텐츠 계약 분산 | High | 소~중 | `index.html`, `app.js` | 1순위 가치·CTA·메타·기본 탭 일치 | 5초 사용자 테스트에서 서비스 목적/다음 행동 이해 |
| UX-01 | 팝업 UX | 팝업 저장/최근 본/종료 저장 상태 없음 | 재방문 가치 낮음 | retention 측정 불가 | 식당 저장 모델과 불일치 | High | 중 | `app.js`, user-data/API | 팝업 ID 기반 저장·게스트→계정 병합 설계 | 로그인/비로그인 저장·동기화·종료 표시 E2E 통과 |
| QA-01 | 테스트 | E2E 18개 중 8개 실패, CI에서 E2E 미실행 | 회귀 조기 발견 실패 | 릴리스 신뢰 저하 | 테스트 부패 | High | 중 | `tests/search.spec.js`, workflow | 현재 UX 계약으로 테스트 갱신, smoke subset을 배포 차단에 연결 | live/local 핵심 E2E 100% 통과, 필수 suite가 branch check |
| OPS-01 | 데이터 운영 | 식당 정기 갱신 Secret 누락으로 실패 | 맛집 데이터 노후화 | 서비스 범위 신뢰 하락 | scheduled job 상시 실패 | High | 소/수동 | Actions Secrets | Secret 설정·rotation·성공 알림 | 2회 연속 scheduled 성공, 보고서 최신 |
| ANA-01 | 분석 | beacon CSP 차단, 팝업 핵심 이벤트 없음 | 개선 근거 없음 | 성장/광고 성과 측정 불가 | 분석 오염·맹점 | High | 중 | `_headers`, `app.js`, `/api/events` | consent-aware taxonomy와 server validation | 방문→노출→클릭→지도/공식/공유 funnel 확인, CSP 오류 0 |
| DATA-01 | 데이터 | 좌표/sourceItemId/lastCheckedAt/검토상태 계약 없음 | 거리/지도·신뢰 표시 제한 | 브랜드 보고·품질 SLA 제한 | 필드 의미 혼선 | High | 중 | `data/popups.json`, collector | 필드 사전과 provenance/review 상태 정의 | 전건 source identity, check timestamp, 신뢰 상태 검증 |
| SEO-02 | SEO | 종료 Event도 EventScheduled, breadcrumb/Twitter 없음 | 과거 일정 오해·공유 품질 저하 | rich result/CTR 제한 | 구조화 데이터 부정확 | High | 소~중 | `build-seo-pages.mjs` | 종료 상태/보존 정책, breadcrumb, Twitter meta | 10개 샘플 validator 통과, 종료 schema 정확 |
| PERF-01 | 성능 | 24개 background 이미지 즉시 로드, fallback PNG 2MB+, feed no-store | 모바일 데이터·LCP 악화 | 이탈·검색 성과 저하 | 외부 host 변동 | High | 중 | `app.js`, assets, headers | responsive `<img>`, lazy loading, WebP/AVIF, data ETag | mobile Lighthouse 예산, fallback <200KB, offscreen 요청 억제 |
| A11Y-01 | 접근성 | 모달 focus 이동/trap/복원 없음, 카드 semantics 충돌 | 키보드·보조기기 사용 곤란 | 접근 가능 사용자 축소 | WCAG 미충족 가능 | High | 중 | `index.html`, `app.js`, CSS | dialog focus lifecycle, button/link 역할 정리 | keyboard-only 시나리오·axe critical 0 |
| REP-01 | 수집 운영 | 실행 보고서가 workflow artifact/commit에 보존되지 않음 | 직접 영향 낮음 | 장애 추세 파악 불가 | 실행 후 증거 소실 | Medium | 소 | popup workflow | artifact 30일 보존, 전일 대비 경보 | 모든 실행 report 조회, 급감/오류 threshold 알림 |
| COL-01 | 수집 | HTML 공통 adapter와 갤러리아 등 no-result/파서 장애 구분 약함 | 일부 출처 누락 | 커버리지 과대평가 | 조용한 실패 | Medium | 중 | collectors/report | 최소 기대치·fixture contract test | 출처별 fixture, zero-result anomaly alert |
| PERF-02 | 구조 | 90KB 단일 app.js가 팝업 화면에서도 맛집 API/데이터를 로드 | 초기 작업/복잡도 증가 | 개발 속도 저하 | 회귀 범위 확대 | Medium | 중~대 | `app.js` | 출시 안정 후 모드별 lazy module 계획 | 초기 팝업 경로 불필요 맛집 요청 제거; 번들 예산 |
| REPO-01 | 저장소 | tracked node_modules 187개, lockfile/dependency 선언 없음, pack 202MB | 직접 영향 낮음 | CI/온보딩 비용 | 공급망·재현성 실패 | High | 중 | Git index, package.json | dependencies/lockfile 복구 후 node_modules 추적 해제 | clean clone `npm ci`, check/test 재현, tracked node_modules 0 |
| UX-02 | 발견성 | 오늘/이번 주 종료/신규/인기 quick navigation 부재 | 둘러보기 효율 낮음 | SEO 페이지가 UI 전환으로 연결 안 됨 | 정보 구조 단절 | Medium | 소~중 | `index.html`, `app.js` | 기존 필터/SEO route를 CTA로 노출 | 주요 세그먼트 1탭 접근, 이벤트 측정 가능 |
| SEC-02 | 보안 | CSP unsafe-inline과 analytics 차단이 공존 | 콘솔 오류·분석 누락 | 보안/성장 모두 저해 | XSS 방어 약화 | Medium | 중 | `_headers`, inline script/style | nonce/hash/외부 파일화와 명시적 analytics 정책 | CSP report-only 검증 후 위반 0, unsafe-inline 제거 계획 |
| DATA-02 | 이미지 | 대표 이미지 8건 누락, 외부 host connection reset 관찰 | 카드 품질 불균일 | CTR 저하 | hotlink 가용성 | Medium | 중/저작권 검토 | popup data/assets | 공식 이미지 상태 모니터, 합법적 캐시 정책 | broken 이미지율 목표 이하, 출처/권리 기록 |
| SEO-03 | 콘텐츠 | 상세 템플릿이 얇고 음식/장소 집합 페이지 부족 | 탐색·검색 의도 제한 | organic 성장 제한 | 유사 페이지 품질 | Medium | 중 | SEO generator | 검증된 메뉴/장소/상태 콘텐츠와 집합 IA | thin page 기준 통과, 내부 링크 깊이 개선 |
| SEC-03 | 오류 처리 | VWorld upstream detail을 사용자에게 반환 | 내부 정보 노출 가능 | 낮음 | 공급자 정보 노출 | Low | 소 | `building.js` | request ID만 반환, 상세는 server log | API 5xx 응답에 내부 detail 없음 |

## 15. 권장 실행 순서 및 우선순위 백로그

### P0 출시 차단

1. **[DEP-01 · PRODUCT1 only + Cloudflare 수동 설정]** Cloudflare Pages `product1`을 main의 단일 배포 대상으로 연결하고 commit SHA/data timestamp smoke check를 추가한다.
2. **[LEG-01 · PRODUCT1 only + 법무/외부 Formspree 수동 설정]** 약관·개인정보·분석/문의 처리 고지와 동의 증적을 준비한다.
3. **[SEO-01 · PRODUCT1 only + Cloudflare 수동 설정]** 유효 경로 외에는 실제 404를 반환한다.
4. **[SEC-01 · PRODUCT1 only]** 익명 쓰기 API를 제한하고 이벤트/표 중복을 방지한다.

### P1 핵심 UX·데이터 신뢰

1. **[IDN-01 · PRODUCT1 only]** 서비스 정체성, 기본 탭, hero/meta, CTA를 일치시킨다.
2. **[QA-01 · PRODUCT1 only]** 실패한 E2E를 현재 계약으로 고치고 핵심 suite를 배포 차단에 연결한다.
3. **[OPS-01 · PRODUCT1 only + GitHub 수동 설정]** 식당 데이터 Secret을 복구하고 예약 갱신을 확인한다.
4. **[DATA-01 · PRODUCT1 only]** 팝업 provenance/check/review 필드 사전을 정하고 전수 검증한다. 관리자 편집 UI까지 연동할 경우에만 **PRODUCT1 + PRODUCT2** 후속 작업으로 분리한다.
5. **[A11Y-01 · PRODUCT1 only]** 모달과 카드 키보드 접근성을 보완한다.
6. **[PERF-01 · PRODUCT1 only]** 이미지 lazy/responsive/압축과 feed 캐시 정책을 적용한다.

### P2 성장·SEO·운영

1. **[ANA-01 · PRODUCT1 only + Cloudflare 수동 설정]** consent-aware 분석 이벤트와 CSP를 연결한다.
2. **[SEO-02 · PRODUCT1 only]** 종료 Event 상태, breadcrumb, Twitter metadata를 추가한다.
3. **[REP-01 · PRODUCT1 only]** run report artifact와 전일 대비 경보를 추가한다.
4. **[COL-01 · PRODUCT1 only]** 출처별 fixture/zero-result anomaly test를 만든다.
5. **[UX-02 · PRODUCT1 only]** 오늘/이번 주/신규/지역 quick navigation을 기존 route와 연결한다.
6. **[SEO-03 · PRODUCT1 only]** 검증된 데이터 범위에서 카테고리·장소 집합 페이지와 내부 링크를 확장한다.
7. **[DATA-02 · PRODUCT1 only + 이미지 권리 수동 확인]** 이미지 가용성과 권리/캐시 정책을 운영한다.

### P3 수익화

1. **[PRODUCT1 only]** 브랜드 무료 등록/오류 제보 폼에 popup ID, source, 검수 상태, SLA를 정의한다. 관리자 처리 UI가 필요하면 별도 **PRODUCT1 + PRODUCT2** 작업으로 승인받는다.
2. **[PRODUCT1 only]** sponsored 데이터 계약, 명시 라벨, 노출 위치 정책을 설계한다.
3. **[PRODUCT1 only]** impression/click/map/official-link dedupe와 브랜드 성과 보고 지표를 정의한다. 관리자 보고서가 필요하면 **PRODUCT2 only** 후속 작업으로 분리한다.
4. **[Cloudflare/Formspree 수동 설정]** 개인정보 동의·문의 보존·삭제·처리자 계약을 확정한다.

### P4 구조 개선

1. **[REPO-01 · PRODUCT1 only]** dependency 선언/lockfile을 복구하고 tracked node_modules/test artifact를 제거한다.
2. **[PERF-02 · PRODUCT1 only]** 안정화 후 app.js를 모드별 lazy module로 점진 분리한다.
3. **[PRODUCT1 only]** 배포 manifest에 commit SHA, build time, data timestamp를 기록해 운영 진단을 단순화한다.
4. **[PRODUCT1 only]** 맛집과 팝업의 식별자·리뷰·저장 도메인 경계를 문서화한다.

---

### 최종 결론

현재 제품은 “동작하는 베타” 수준이다. 데이터 자체의 필수 품질과 팝업 탐색 UI는 출시 기반이 충분하지만, 자동 수집 결과가 production feed로 이어지는 배포 보장이 없고 법무·쓰기 API·404·E2E gate가 미완성이다. P0/Critical을 먼저 닫고, 그 다음 정체성·저장·분석을 정렬해야 성장/수익화 투자가 낭비되지 않는다.
