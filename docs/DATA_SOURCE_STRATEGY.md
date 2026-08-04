# Mukdang 푸드 팝업 데이터 소스 전략

기준일: 2026-08-04

적용 범위: `jwhtws/product1`의 푸드 팝업 수집 운영

정식 등록부: `data/data-source-registry.json`

## 1. 목적과 변경 통제

이 문서는 Mukdang collector 개발의 단일 기준이다. 등록부에는 공식 운영사·시설·브랜드·공공기관의 출처 후보 114개를 기록했다. 출처 추가, enum 변경, 점수 기준 변경은 등록부 스키마 버전 변경, 근거 기록, 감사 스크립트와 테스트 변경을 한 커밋에서 함께 수행한다. 운영 중 발견한 URL을 collector에 곧바로 넣지 않는다.

`active`는 현재 코드와 실행 명령이 실제로 연결된 출처에만 사용한다. 출처의 존재는 알지만 이벤트 구조, robots 또는 이용조건, 자동 수집 가능성을 확인하지 않은 경우 `unverified`다. `lastVerifiedAt: null`과 빈 `verificationEvidence`는 미검증을 명시한 것이며 자동 수집 승인으로 해석하지 않는다. 이번 조사에서는 신규 collector, 기존 collector, 팝업 데이터, API, SEO, 사용자·관리자 UI를 변경하지 않았다.

## 2. 등록부 구조와 분류

각 source는 고유한 kebab-case `id`, 운영 주체, 공식·행사 URL, 지점·지역, 구현 상태와 수집 방법, 위험·기술 속성, 가용 필드, 현 collector 연결, 검증일과 근거, 점수와 사유를 가진다. 같은 운영사의 지점이 같은 URL/API/공지 구조를 쓰면 한 source의 `branches`로 묶는다. 독립 구조만 별도 source로 관리한다.

허용 enum은 감사 스크립트가 강제한다.

- `sourceType`: `department_store`, `outlet`, `shopping_mall`, `popup_venue`, `brand_newsroom`, `brand_official_site`, `official_blog`, `press_release`, `local_government`, `festival`, `user_submission`, `social_official`, `other`
- `collectionMethod`: `official_api`, `html`, `sitemap`, `rss`, `json_embedded`, `manual_review`, `user_submission`, `unsupported`, `unverified`
- `implementationStatus`: `active`, `partial`, `broken`, `planned`, `manual`, `unverified`, `excluded`

현재 구성은 백화점·아울렛 20, 쇼핑몰 28, 팝업 전문 공간·핵심 장소 20, 식음료 브랜드 공식 출처 31, 축제·지자체 15개다. 후보 URL의 자동화 적합성을 확인하지 않은 항목은 의도적으로 `unverified`이며 개발 전에 다시 검증한다.

## 3. 현재 구현 상태

공통 실행은 `npm run data:refresh-popups`이다. GitHub Actions `.github/workflows/food-popup-refresh.yml`이 매일 실행하며 수동 `scope`로 운영사별 부분 실행을 지원한다. `scripts/refresh-food-popups.mjs`가 수집, 식품·팝업 판정, 정규화, 기존 데이터 병합, 품질 검증과 실행 보고를 담당한다. 롯데 상세 파서는 `scripts/lib/lotte-popup-collector.mjs`, 실행 계측은 `scripts/lib/popup-run-report.mjs`에 분리되어 있다. collector별 독립 fixture 테스트는 없고 실행 보고 모듈 테스트만 존재한다.

| collectorId / source | 운영사·대상 | 방식·URL 구조 | 페이지·날짜 | 이미지·장소·메뉴 | 부분 실행 | 테스트·보고 |
|---|---|---|---|---|---|---|
| `hyundai-department-outlet` / 현대백화점·아울렛 | 현대백화점그룹, 전 지점 | 공식 검색 JSON + 상세 HTML, ehyundai 쇼핑뉴스 | 최대 50 page, `EVNT_STRT_DT/END_DT` | 목록·상세 이미지, 지점명, 상세 가격 메뉴 | `data:refresh-hyundai` | 전용 테스트 없음, 공통 최근 실행 보고 포함 |
| `lotte-department-outlet-mall` / 롯데백화점·아울렛·몰 | 롯데쇼핑 전 지점 | 공식 쇼핑뉴스 HTML과 curated 공식 URL | 목록 순회/상세, 공식 기간 파싱 | 대표·상세 이미지, 지점·주소, 상세 메뉴 | `data:refresh-lotte` | 전용 테스트 없음, 공통 보고 포함 |
| `shinsegae-department-store` | 신세계 13개 점 | 공식 event HTML + 지점별 shopping JSON | 지점별 목록, ISO 날짜 | 공식 이미지·도로주소·상세 가격 메뉴 | `data:refresh-shinsegae` | 전용 테스트 없음, 공통 보고 포함 |
| `starfield` | 스타필드 4, 시티 3, 코엑스몰 | 공식 event API; 수원 공식 층별안내 보완 | API `totalPageCount`, 공식 날짜 | API 이미지·시설명; 메뉴·가격 없음 | `data:refresh-starfield` | 전용 테스트 없음, 공통 보고 포함 |
| `galleria-department-store` | 갤러리아 5개 점 | 공식 쇼핑뉴스 HTML; 확인된 공식 일정 보완 | 목록 링크, 본문 기간 파싱 | OG/본문 이미지·지점·일부 공식 메뉴 | `data:refresh-galleria` | 전용 테스트 없음, 공통 보고 포함 |
| `ak-plaza` | AK플라자·AK& 10개 코드 | 공식 이벤트 HTML | 지점별 목록, 본문 기간 | 썸네일·지점; 메뉴 없음 | `data:refresh-akplaza` | 전용 테스트 없음, 공통 보고 포함 |
| `eland-retail` | NC·뉴코아·2001 | 공식 지점/쇼핑뉴스 HTML | 지점 목록과 이벤트 상세, 기간 | 공식 이미지·지점; 메뉴 없음 | `data:refresh-eland` | 전용 테스트 없음, 공통 보고 포함 |
| `ipark-mall` | 아이파크몰 용산 | 공식 이벤트 HTML | 단일 feed, 본문 기간 | OG 이미지·시설명; 메뉴 없음 | `data:refresh-ipark` | 전용 테스트 없음, 공통 보고 포함 |
| `emart-traders` | 이마트·트레이더스 | 공식 이벤트/공지 HTML | feed별 목록, 본문 기간 | OG 이미지·전점 표기; 메뉴 없음 | `data:refresh-emart` | 전용 테스트 없음, 공통 보고 포함 |
| `lotte-mart` | 롯데마트 | 공식 행사 HTML | 단일 feed, 본문 기간 | OG 이미지·전점 표기; 메뉴 없음 | `data:refresh-lottemart` | 전용 테스트 없음, 공통 보고 포함 |
| `homeplus` | 홈플러스 | 공식 공지 HTML | 단일 feed, 본문 기간 | OG 이미지·전점 표기; 메뉴 없음 | `data:refresh-homeplus` | 전용 테스트 없음, 공통 보고 포함 |
| `times-square` / 공통 사이트맵 adapter | 타임스퀘어 외 허용된 공식 도메인 | robots의 sitemap → 공식 상세 HTML | sitemap 후보 최대치, 본문 기간 | OG 이미지·본문 시설명; 메뉴 없음 | `data:refresh-malls` | `partial`; 전용 테스트 없음, 공통 보고 포함 |
| `lotte-official-blog` | 롯데 공식 블로그 | 공식 RSS | RSS item, 본문 월·일 범위 | 장소 추출; 대표 이미지·메뉴 없음 | `data:refresh-lotte` | 전용 테스트 없음, 공통 보고 포함 |

`scripts/refresh-popup-venues.mjs`는 `data/popup-venues.json`의 장소 레지스트리 생성 로직이며 팝업 이벤트 source collector로 세지 않는다. 기존 `data/popups.json`의 `sources`와 공통 run report는 최근 실행 결과를 보존한다. 이 문서 작업은 어느 실행 명령도 호출하지 않아 수집 결과를 바꾸지 않는다.

## 4. 우선순위 점수

`priorityScore`는 아래 7개 항목의 합계이며 100점 만점이다.

| 항목 | 최대 | 판단 기준 |
|---|---:|---|
| 푸드 팝업 관련성 | 30 | 팝업 기간·브랜드·장소를 직접 제공하는 정도 |
| 예상 등록량 | 20 | 지속적으로 발견할 수 있는 후보량 |
| 공식 출처 신뢰도 | 15 | 운영사·브랜드·공공기관의 1차 출처 여부 |
| 수집 안정성 | 15 | 구조·식별자·날짜·페이지 처리의 안정성 |
| 유지보수 용이성 | 10 | 공개 API/구조화 데이터 우선, 브라우저 의존 감점 |
| 지역 다양성 | 5 | 비수도권 또는 전국 운영 기여 |
| 미커버 기여 | 5 | 현재 collector가 놓치는 유형·권역 기여 |

등급은 S 75점 이상, A 60~74, B 40~59, C 39점 이하이다. `priorityReason`에 항목별 점수를 고정 기록한다. 법적 위험 `high` 또는 `robotsStatus: disallowed`는 점수와 무관하게 자동 수집에서 제외하고 `manual_review` 또는 `unsupported`로만 둔다. 점수는 개발 순서를 정할 뿐 자동 수집 허가를 뜻하지 않는다.

## 5. 자동 수집 정책

자동 수집 후보로 허용하는 범위는 공식 공개 API, 공식 이벤트·뉴스·공지 페이지, 접근 제한이 없는 공식 HTML·JSON·RSS, robots와 이용조건에서 명백한 금지가 확인되지 않은 출처다. 개발 착수 전 공식 운영 주체, 이벤트 URL, robots, 이용조건, 인증·CAPTCHA, JS 의존, 페이지네이션을 한 번 더 확인하고 `verificationEvidence`와 `lastVerifiedAt`을 갱신한다.

다음은 자동 수집에서 제외하거나 수동 검토한다.

- 로그인 필수, CAPTCHA 또는 명시적 robots 금지
- 개인 계정 SNS와 비공식 블로그
- 출처 불명 재가공 콘텐츠와 타 플랫폼 데이터의 무단 재배포
- 연락처·개인정보 중심 페이지
- 폐점, 운영 종료, 소유권 또는 공식성 미확인 페이지

SNS는 공식 브랜드 계정만 후보가 될 수 있다. 이 단계에서 SNS 자동 crawler는 구현하지 않으며 `manual_review` 또는 `unverified`만 허용한다. robots가 `unknown`인 항목도 자동 수집 승인이 아니다. 네트워크 요청은 개발 시 일회성 검증과 합리적 주기로 제한하고 감사 스크립트에서는 수행하지 않는다.

## 6. 구현 로드맵

### 상태별 운영표

| 구분 | 출처 |
|---|---|
| 현재 active | 현대, 롯데, 신세계, 갤러리아, AK, 이랜드, 스타필드, 아이파크몰, 이마트·트레이더스, 롯데마트, 홈플러스, 롯데 공식 블로그 |
| partial/broken 보완 | 타임스퀘어/공식 sitemap adapter(`partial`); 현재 `broken` 없음 |
| 다음 S등급 | 신세계사이먼, 모다·마리오·LF스퀘어, IFC·스퀘어원·트리플스트리트·엔터식스·커먼그라운드·두타·롯데월드몰·코엑스 일정 |
| 그다음 A등급 | 지역 쇼핑몰, 브랜드 뉴스룸, 지자체·축제 포털 중 검증 완료 항목 |
| 수동·제보 | 스위트스팟, 아모레성수, 하우스도산; 향후 브랜드 직접 등록·사용자 제보 |
| 제외 | 태평백화점, 세이백화점, W몰: 현재 운영·접근 상태 확인 전 자동화 금지 |

### Batch 1 — 현재 active collector 보완

상태: **2026-08-04 완료**. 구현·검증 상세는 `docs/BATCH1_COLLECTOR_HARDENING.md`를 따른다. Times Square 공통 sitemap adapter는 안전장치와 fixture 검증을 완료했지만 실운영 근거 부족으로 `partial`을 유지한다.

- 출처: 12개 active source와 공통 sitemap adapter
- 난이도: 중
- 기여: 신규 건수보다 누락·오탐 감소와 운영 가시성 향상
- 형태: fixture 기반 parser test, source별 성공/발견/승인/거절 계측, 오류 격리
- 완료 기준: 전용 테스트, 90일 검증 주기, 최근 성공 보고, 빈 결과와 실패 구분, 부분 실행 회귀 테스트

### Batch 2 — 미구현 S등급 백화점·복합몰

- 출처: 신세계사이먼, 세이브존, 모다, 마리오, LF스퀘어, 동아, M백화점, 타임스퀘어, IFC몰, 스퀘어원, 트리플스트리트, 엔터식스, 커먼그라운드, 두타몰, 센트럴시티·파미에, 롯데월드몰, 코엑스 일정
- 난이도: 중~상; 먼저 공식성·운영 여부·robots를 검증
- 기여: 수도권 핵심몰과 대구·강원·부산 권역 보강
- 형태: 공개 API 우선, 없으면 운영사별 HTML/JSON adapter
- 완료 기준: 검증 근거, robots/약관 기록, pagination/date fixture, 이미지·장소 필드, 부분 실행, run report

### Batch 3 — S/A등급 팝업 전문 공간

- 출처: 스위트스팟, 스페이스 와디즈, LCDC, S-Factory, Layer41, 언더스탠드에비뉴, DDP, 코사이어티, 피치스 도원, 무신사 엠프티, 벡스코
- 난이도: 상; 대관 정보와 실제 공개 이벤트를 구분해야 함
- 기여: 성수·서울 핵심 팝업과 부산 행사 보강
- 형태: 공식 일정 adapter 또는 검수 queue; SNS만 있는 곳은 manual
- 완료 기준: 음식/팝업 판정 근거, 기간·장소 필수, 중복 방지, 비공개 대관 제외, fixture test

### Batch 4 — A등급 브랜드 공식 사이트·뉴스룸

- 출처: 등록부의 식품·음료 브랜드 공식 사이트/뉴스룸 30개
- 난이도: 중~상; 팝업 비율이 낮고 공지 형태가 다양함
- 기여: 유통 시설 공지보다 빠른 브랜드 직접 발표 발견
- 형태: RSS/sitemap/newsroom discovery 후 공식 상세 검수
- 완료 기준: 브랜드 공식성, 팝업 장소·기간을 모두 제공한 항목만 승인, 홍보 기사 오탐 fixture, source별 수율 측정

### Batch 5 — 지자체·축제·공식 보도자료

- 출처: 한국관광공사 축제·TourAPI, 서울·부산·대구·대전·광주·제주·경기·강원·전북·전남·충남·경북 공식 관광 포털
- 난이도: 중; 축제와 단기 푸드 팝업의 경계 정의 필요
- 기여: 비수도권과 공공 주최 음식 행사 보강
- 형태: 공개 API 우선, 공식 목록 HTML 보완, 후보 검수
- 완료 기준: 푸드 팝업 정의 충족, 행사 기간·주소·주최기관, API 이용조건 준수, 지역 중복 제거

### Batch 6 — 브랜드 직접 등록·사용자 제보

- 출처: 검증된 브랜드 담당자 등록과 사용자 제보
- 난이도: 상; 신원·권리·스팸·개인정보 처리 필요
- 기여: 공식 웹 공지가 없는 소규모·지역 팝업
- 형태: 제출 → 검증 → 승인 workflow; 자동 게시 금지
- 완료 기준: 출처 동의, 필수 필드·이미지 권리 확인, 개인정보 최소화, 감사 이력, 중복·허위 신고 처리

Batch 순서는 고정한다. 앞 Batch의 완료 기준이 충족되기 전 다음 Batch를 대량 구현하지 않는다.

## 7. 커버리지 모델

전국의 실제 전체 팝업 수를 알 수 없으므로 `coverageScore`를 “전국 전체 대비 비율”로 표현하지 않는다. 아래는 내부 운영 지표다.

- `registeredSources`: 등록부 source 수
- `activeAutomatedSources`: active이며 자동 collectionMethod인 source 수
- `activeManualSources`: manual/user_submission 운영 source 수
- `verifiedSources`: 검증일과 evidence가 모두 있는 source 수
- `sourcesWithRecentSuccess`: 운영 기간 내 최근 성공 보고가 있는 source 수
- `branchesCovered`: active/verified source의 고유 branch 수
- `regionsCovered`: 최근 성공 source가 포함한 고유 region 수
- `discoveredItemsBySource`: source가 발견한 원시 후보 수
- `acceptedItemsBySource`: 정규화·품질 검사를 통과한 수
- `sourceCompletenessRate`: 필수 운영 필드가 채워진 active source / active source
- `fieldCompletenessRate`: 승인 item의 필수 필드 채움 수 / 전체 필수 필드 수
- `staleSourceRate`: 90일 넘게 검증되지 않은 운영 source / 운영 source
- `failedSourceRate`: 관측 기간 실패 source / 실행 source

내부 `coverageScore`는 검증·최근 성공·branch·region·source/field completeness를 가중 정규화하고 stale/failed를 감점하는 추세 지표로만 쓴다. 분모와 가중치를 보고서에 함께 저장하며 외부 시장 점유율로 전환하지 않는다. source별 `discovered`와 `accepted`를 함께 보아 수집량이 많은 오탐 source가 과대평가되지 않게 한다.

## 8. 감사와 변경 절차

`npm run audit:data-sources`는 파일 정합성만 검사하며 운영 사이트에 요청하지 않는다. 필수 필드, id·URL·enum, 점수/등급, collector 파일, active evidence, 90일 경과, 위험 정책을 검사하고 sourceType·priority·status 집계를 출력한다.

출처를 active로 전환하는 pull request에는 다음이 모두 필요하다.

1. 공식 운영 주체와 이벤트 URL 근거
2. robots·이용조건·인증·JS·pagination 검토
3. 실제 collector/test 파일과 부분 실행 명령
4. 날짜·이미지·장소·메뉴/가격 가용성 기록
5. 성공·빈 결과·실패를 구분하는 실행 보고
6. 등록부, 전략 문서, 감사 테스트의 동시 갱신

등록부는 자동 수집 허용 목록이 아니라 조사·의사결정의 원장이다. `unverified`, `manual`, `excluded` 항목을 collector 입력으로 임의 사용해서는 안 된다.
