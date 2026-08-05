# Batch 3 venue collector validation

검증일: 2026-08-05

기준 커밋: `fa9a1f4d2` (`feat: implement verified batch3 venue collectors`)

데이터 비교 기준: `483568d04:data/popups.json`

## 1. 검증 대상

`docs/BATCH3_SCOPE.md`에 고정된 네 source만 검증했다. scope 밖 source, UI, product2, SEO, 데이터 모델은 대상에서 제외했다.

| sourceId | sourceName | 조치 | collectorFile | parserFile | testFile | fixture 수 | 부분 실행 명령 | registry 상태 | 실제 검증 결과 | 판정 |
| --- | --- | --- | --- | --- | --- | ---: | --- | --- | --- | --- |
| `shinsegae-simon-premium-outlets` | 신세계사이먼 프리미엄 아울렛 | 신규 구현 | `scripts/collectors/batch3-verified-venues.mjs` | `scripts/parsers/batch3-venue-parser.mjs` | `tests/collectors/shinsegae-simon-premium-outlets.test.mjs` | 1 bundle / 8 상태 | `npm run data:refresh-premium-outlets` | active | success_empty | PASS |
| `ifc-mall` | IFC몰 | 신규 구현 | `scripts/collectors/batch3-verified-venues.mjs` | `scripts/parsers/batch3-venue-parser.mjs` | `tests/collectors/ifc-mall.test.mjs` | 1 bundle / 8 상태 | `npm run data:refresh-ifc` | active | success_empty | PASS |
| `doota-mall` | 두타몰 | 신규 구현 | `scripts/collectors/batch3-verified-venues.mjs` | `scripts/parsers/batch3-venue-parser.mjs` | `tests/collectors/doota-mall.test.mjs` | 1 bundle / 8 상태 | `npm run data:refresh-doota` | active | success_empty | PASS |
| `times-square` | 타임스퀘어 | 기존 보완 | `scripts/collectors/times-square-sitemap.mjs` | `scripts/parsers/batch3-venue-parser.mjs` | `tests/collectors/sitemap-adapter.test.mjs` | 1 bundle / 8 상태 | `npm run data:refresh-malls` | partial | structure_changed | PASS WITH WARNINGS |

## 2. 정적 완성도

네 source 모두 collector/parser/fixture/source test가 존재하고 dispatch 및 전체 collector 배열에 연결되어 있다. package 부분 실행 명령과 report source명이 registry `currentCollector`와 일치한다. `collectorFile`, `testFile`, `verificationEvidence` 경로도 유효하다. active 세 source에 누락 구현은 없으며 타임스퀘어는 근거 없이 active로 승격되지 않았다.

Fixture bundle은 source마다 다음 8개 상태를 포함한다.

- valid list 또는 API response와 valid detail
- empty
- expired
- non-food
- non-popup sale
- duplicate source item
- malformed 또는 structure changed

Parser 계약은 title/name, brand, venue, branch, address, startDate, endDate, sourceUrl, imageUrl, sourceItemId, category를 검사한다. popup/food/expired/date/duplicate/structure 필터를 각각 rejection reason으로 검증하며 구조 변경 payload는 정상 row로 통과하지 않는다.

## 3. 실제 부분 실행

출력과 report는 `/tmp/batch3-validation-*`에 격리했다. 각 공식 source를 한 번씩만 실행했으며 로그인, CAPTCHA, 차단 우회는 사용하지 않았다.

| source | discovered | fetched | accepted | rejected | duplicate | error | rejectionReasons | healthStatus |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | --- | --- |
| 신세계사이먼 프리미엄 아울렛 | 34 | 36 | 0 | 34 | 0 | 0 | `not_popup=32`, `not_food=2` | empty |
| IFC몰 | 2 | 2 | 0 | 2 | 0 | 0 | `not_popup=2` | empty |
| 두타몰 | 11 | 11 | 0 | 11 | 0 | 0 | `not_popup=11` | empty |
| 타임스퀘어 공식 사이트맵 | 0 | 0 | 0 | 0 | 0 | 1 | 없음 | structure_changed |

신규 세 source는 공식 목록/API가 정상이고 현재 푸드 팝업 승인 항목이 없어 `success_empty`다. 타임스퀘어는 root 응답에서 `sitemapindex` 또는 `urlset`을 확인하지 못했으므로 `success_empty`로 오판하지 않고 `structure_changed`로 기록했다.

## 4. Run report

각 report에서 아래 필드가 모두 존재한다.

`discoveredCount`, `fetchedCount`, `acceptedCount`, `rejectedCount`, `duplicateCount`, `errorCount`, `rejectionReasons`, `healthStatus`, `healthMessage`, `startedAt`, `finishedAt`, `lastSuccessfulAt`, `consecutiveFailureCount`, `anomalyFlags`

검증 결과:

- 모든 source에서 `acceptedCount <= fetchedCount`.
- 세 정상 source에서 `rejectedCount`와 rejection reason 합계가 일치.
- 타임스퀘어 `errorCount=1`, `healthStatus=structure_changed`이며 healthy/empty로 기록되지 않음.
- 부분 실행 report에는 선택 source 하나만 존재.
- 배열 반환 기존 collector의 하위 호환 정규화 테스트 유지.

## 5. 중복 검사

Batch 3 실제 승인 결과가 0건이므로 기존 popup 데이터와의 교차 중복은 다음과 같다.

| 분류 | 수 |
| --- | ---: |
| exact duplicate | 0 |
| probable duplicate | 0 |
| multi-source same popup | 0 |
| 중복으로 제거 | 0 |
| 검토 필요 | 0 |

전체 기존 데이터에는 동일 공식 상세 URL을 공유하는 갤러리아 행사 묶음 3개가 있으나, 한 공식 페이지 안의 서로 다른 브랜드를 개별 row로 분리한 기존 구조다. 제목·브랜드·장소·기간 기준 exact/probable duplicate가 아니므로 false-positive candidate 3개로 분류했다. 기존 ID 우선 병합 후 정규화 제목/브랜드·venue·기간으로 병합하는 정책은 유지했다.

## 6. 데이터 전후 비교

| 항목 | 이전 (`483568d04`) | 현재 | 판정 |
| --- | ---: | ---: | --- |
| 총 팝업 | 96 | 96 | 동일 |
| 진행 중 | 81 | 81 | 동일 |
| 예정 | 0 | 0 | 동일 |
| 종료 | 15 | 15 | 동일 |
| 필수 필드 완전성 | 96/96 | 96/96 | 동일 |
| 공식 HTTPS URL | 96/96 | 96/96 | 동일 |
| 시작·종료 날짜 | 95/96 | 95/96 | 기존 결손 유지, 악화 없음 |
| 장소 | 96/96 | 96/96 | 동일 |
| 대표 이미지 | 86/96 | 86/96 | 동일 |
| exact/probable duplicate | 0/0 | 0/0 | 동일 |

Source별 수는 현대 39, 롯데 32, 신세계 13, 갤러리아 10, 스타필드 1, 노들섬 1로 전후 동일하다. ID hash는 양쪽 모두 `cb583e3883268eff3aa663ed7d1b17b57df8fa3cb1fe344dba0d271b1a02cc26`이며 삭제·추가 ID는 없다.

## 7. 품질 점수

| source | 실제 요청 20 | fixture 15 | parser 15 | 부분 실행 10 | 전체 dispatch 5 | report 10 | health 10 | 중복 5 | registry 5 | 회귀 5 | 합계 | 판정 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- |
| 신세계사이먼 | 20 | 15 | 15 | 10 | 5 | 10 | 10 | 5 | 5 | 5 | 100 | PASS |
| IFC몰 | 20 | 15 | 15 | 10 | 5 | 10 | 10 | 5 | 5 | 5 | 100 | PASS |
| 두타몰 | 20 | 15 | 15 | 10 | 5 | 10 | 10 | 5 | 5 | 5 | 100 | PASS |
| 타임스퀘어 | 0 | 15 | 15 | 10 | 5 | 10 | 10 | 5 | 5 | 5 | 80 | PASS WITH WARNINGS |

## 8. 남은 위험

- 타임스퀘어 공식 root sitemap이 실행 환경에서 기대 XML 구조를 반환하지 않는다. 현재 adapter는 이를 정확히 `structure_changed`로 감지하지만 운영 수집 성공은 검증되지 않았다.
- 정상 empty source도 모든 발견 항목이 필터링되면 `error_rate_50` anomaly flag가 생긴다. health는 empty로 정확하지만 이 flag는 rejection 비율이라는 의미로 해석해야 한다.
- 기존 데이터 1건은 종료일이 없어 날짜 완전성이 95/96이나 Batch 3 변경으로 생긴 회귀는 아니다.

## 9. 검증 중 수정

- parser row에 기존 최종 데이터 계약과 같은 `category: food-popup`을 명시했다.
- API/list 항목도 fetched record로 계산해 미래에도 `acceptedCount <= fetchedCount`가 유지되도록 수정했다.
- 세 신규 source test에 실제 축약 상세 HTML의 title/date/image 검증과 source별 malformed list/API 거부를 추가했다.

신규 collector, 신규 source, UI, product2, SEO, 데이터 모델 변경은 없다.

검증 명령 결과:

- `npm run audit:data-sources`: PASS — 114 source, active 22, partial 2, warning 0
- `npm run check`: PASS — 코드 46개와 데이터 계약 검증 통과
- Batch 3 source/parser 테스트: PASS
- `npm test`: PASS — Node 69/69, Playwright 33/33
- `npm run build`: PASS

## 10. 최종 판정

순수 PASS는 3/4, 75%다. FAIL source와 critical 데이터 회귀는 없고 active 세 source는 정상이나, 전체 PASS 조건인 “대상 source의 80% 이상 PASS”를 충족하지 못한다. PASS WITH WARNINGS는 엄격한 순수 PASS 비율에 포함하지 않았다.

**BATCH 3: FAIL**
