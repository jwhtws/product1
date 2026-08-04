# Batch 1 Collector Hardening

기준일: 2026-08-04. 범위는 기존 active 12개 source와 partial 공통 sitemap adapter다. 신규 출처, 출력 schema, UI는 변경하지 않았다.

## 연결 현황

| sourceId | 실제 함수 / 파일 | 실행 명령 | 공식 목록·상세 URL | 방식 | fixture / parser / dispatch | 상태·계측 | 현재 위험 |
|---|---|---|---|---|---|---|---|
| hyundai-department-outlet | `collectHyundai` / `scripts/refresh-food-popups.mjs` | `npm run data:refresh-hyundai` | ehyundai `search/result.do` / `SN_0201000.do` | JSON+HTML | O/O/O | 4상태·report O | 검색어별 다중 요청, 상세 HTML 변경 |
| lotte-department-outlet-mall | `collectCuratedOfficial`→`collectLottePopups` / `scripts/lib/lotte-popup-collector.mjs` | `npm run data:refresh-lotte` | lotteshopping 검색 / `shpgnewsDetail` | HTML+curated 공식 URL | O/O/O | 4상태·report O | curated seed 의존, 검색-상세 연결 |
| shinsegae-department-store | `collectShinsegae`, `collectShinsegaeShoppingNews` / refresh script | `npm run data:refresh-shinsegae` | `shopping/event/list.do`, `shopping/ajaxList.do` / `shopping/view.do` | HTML+JSON | O/O/O | 4상태·report O | 두 목록 구조, 상세 throttling |
| galleria-department-store | `collectGalleria` / refresh script | `npm run data:refresh-galleria` | 지점별 `shopping-news` 목록/상세 | HTML | O/O/O | 4상태·report O | 일부 확인 일정 보완값, 지점 markup |
| ak-plaza | `collectAkPlaza` / refresh script | `npm run data:refresh-akplaza` | `board/event/list?store=` / 동일 목록 링크 | HTML | O/O/O | 4상태·report O | 지점별 DOM 변경 |
| eland-retail | `collectElandRetail` (`collectNc`) / refresh script | `npm run data:refresh-eland` | `store01.do`, `event` / `smart_shopping_02.do` | HTML | O/O/O | 4상태·report O | 지점 index와 상세 결합 |
| starfield | `collectStarfield` / refresh script | `npm run data:refresh-starfield` | `/api/{branch}/event/eventList.do` / `/eventBenefit/events/{id}` | API | O/O/O | 4상태·report O | 지점별 부분 실패, 수원 층별안내 보완 |
| ipark-mall | `collectOfficialHtmlFeeds` / refresh script | `npm run data:refresh-ipark` | `hdc-iparkmall.com/event` / 이벤트 링크 | HTML | O/O/O | 4상태·report O | 범용 card 탐색 |
| emart-traders | `collectOfficialHtmlFeeds` / refresh script | `npm run data:refresh-emart` | emart event/notice / 이벤트 링크 | HTML | O/O/O | 4상태·report O | 여러 feed 구조 |
| lotte-mart | `collectOfficialHtmlFeeds` / refresh script | `npm run data:refresh-lottemart` | `event_list.asp` / 이벤트 링크 | HTML | O/O/O | 4상태·report O | 영문 경로·범용 parser |
| homeplus | `collectOfficialHtmlFeeds` / refresh script | `npm run data:refresh-homeplus` | `Hyper_Notice.aspx` / 공지 링크 | HTML | O/O/O | 4상태·report O | ASP 목록 구조 |
| lotte-official-blog | `collectLotteOfficialBlog` / refresh script | `npm run data:refresh-lotte` | `blog.lotte.co.kr/feed/` / RSS item link | RSS | O/O/O | 4상태·report O | 자연어 월·일 기간과 장소 추출 |
| times-square | `collectFromOfficialSitemaps` / refresh script | `npm run data:refresh-malls` | 허용 도메인 robots/sitemap / 공식 상세 | sitemap+HTML | O/O/O | 4상태·report O, **partial 유지** | source별 실응답 검증과 robots evidence 부족 |

`O/O/O`는 sanitized fixture 파일, source 전용 parser 계약 테스트, scope dispatch 테스트가 모두 있음을 뜻한다. fixture metadata에 공식 URL, 2026-08-04 수집 기준일, 정제 여부를 기록했다. 각 파일은 valid list/detail, empty, malformed, expired, non-food, non-popup sale, duplicate 사례를 포함한다.

## 결과와 source health

collector 반환 배열은 계속 허용한다. 객체 반환은 `rows`, `stats`, `sourceHealth`를 보존한다. parser 계약 상태는 `success_with_items`, `success_empty`, `source_structure_changed`, `request_failed`로 구분하고 run report에서는 다음으로 정규화한다.

- `healthy`: 요청과 구조가 정상이며 승인 item 존재
- `empty`: 요청·구조는 정상이지만 승인 item 없음
- `degraded`: 결과는 있으나 anomaly 존재
- `failed`: 네트워크/HTTP 요청 실패
- `structure_changed`: 필수 배열·selector가 없거나 차단 구조 감지
- `unverified`: 검증 전 source

report source에는 기존 필드와 함께 `healthStatus`, `healthMessage`, discovered/fetched/accepted/rejected/duplicate/error count, rejectionReasons, 시작·종료, `lastSuccessfulAt`, `consecutiveFailureCount`, `anomalyFlags`가 기록된다. 빈 결과는 실패가 아니다.

## anomaly

source별 최근 최대 7회를 사용해 다음 flag를 만든다: `unexpected_empty`(최근 평균 discovered 10 이상에서 0), `discovered_drop_80`, `accepted_drop_80`, `discovered_spike_300`, `error_rate_50`, `consecutive_failure_3`, `consecutive_empty_3`. 경고는 전체 실행을 중단하지 않는다.

최신 보고서는 `data/food-popups/run-report.json`, 이력은 `data/food-popups/run-history/YYYY-MM-DDTHH-mm-ssZ.json`이다. 30일을 넘거나 최신 30개 밖인 파일은 정리한다. 현재 workflow의 commit 대상에는 `data/food-popups`가 없으므로 이력은 CI artifact 성격이며 매일 Git에 커밋하지 않는다. 저장소 크기와 운영 필요가 확인되기 전 이 정책을 유지한다.

## 네트워크 정책

공통 wrapper는 15초 기본 timeout(호출부 최대 20초), retry 최대 2회, 408/425/429/5xx만 retry, 지수 backoff, 100ms 요청 간격, 명시적 User-Agent, Content-Length 8MiB 제한과 차단/로그인 문구 감지를 제공한다. 오류에는 origin과 상태만 남기며 query token·쿠키·Authorization은 run-report sanitizer가 제거한다. 기존 source별 worker concurrency는 유지하되 새 동시 요청을 추가하지 않았다.

## 실패 대응

1. `failed`: 기존 팝업 보존, sanitized error와 연속 실패 기록
2. `structure_changed`: 자동 삭제 금지, fixture와 공식 구조 재확인
3. `empty`: 정상 빈 결과로 기록; 3회 연속 또는 과거 평균 대비 0이면 anomaly
4. `degraded`: 실행은 계속하고 source별 발견/승인/거절 추세 조사
5. scoped 실행에는 선택한 run-report source만 포함하며 선택되지 않은 기존 데이터는 보존

## 데이터 보존 snapshot

작업 전후 `data/popups.json`의 Git blob은 동일하다. 요약은 총 93건, 진행 78, 예정 0, 종료 15, 필수 필드(`id/name/venue/startDate/sourceUrl`) 465/465이며 정렬된 ID 목록 SHA-256은 `ba2d6cce72bdb43ee3595757745d972d3291f0b07dbb53078791e61d69df41f2`다. source별 수는 현대 39, 롯데 30, 신세계 13, 갤러리아 10, 스타필드 수원 1이다. 실제 전체·부분 수집은 실행하지 않았다.

## 완료 체크

- [x] hyundai-department-outlet
- [x] lotte-department-outlet-mall
- [x] shinsegae-department-store
- [x] galleria-department-store
- [x] ak-plaza
- [x] eland-retail
- [x] starfield
- [x] ipark-mall
- [x] emart-traders
- [x] lotte-mart
- [x] homeplus
- [x] lotte-official-blog
- [x] times-square/common sitemap adapter 테스트·보호 보강
- [x] 부분 실행 12 scope 회귀 테스트
- [x] source health, anomaly, run history 테스트
- [x] 기존 `data/popups.json` 무변경 확인

Batch 1의 코드·fixture·회귀 테스트 범위는 완료했다. 다만 times-square는 robots와 공식 실응답의 source별 검증 근거가 부족하므로 등록부 `partial`을 유지한다. 이는 Batch 1 실패가 아니라 명시적으로 보존한 운영 위험이다.
