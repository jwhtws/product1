# Batch4 Validation

- 검증일: 2026-08-05
- 기준 브랜치: `main`
- 기준 커밋: `87cab3575a057df86ee2611bb6e2211d779f8473`
- 범위: Registry의 priority A, active `brand_newsroom` / `brand_official_site` 중 Batch4 collector에 연결된 9개 source
- 제한 준수: 신규 collector, Registry, UI, 관리자, Batch5 변경 없음

## 1. 검증 대상과 정적 완성도

모든 source에서 collector, 공통 parser, 6상태 fixture, source 전용 parser test, npm 부분 실행, 단일-source dispatch, run-report, Registry 연결을 확인했다.

| sourceId | sourceName | sourceType | 부분 실행 | 정적 검사 | 판정 |
|---|---|---|---|---|---|
| `cj-cheiljedang-newsroom` | CJ제일제당 뉴스룸 | brand_newsroom | `npm run data:refresh-brand-cj-cheiljedang` | 전 항목 존재 | PASS |
| `ottogi-newsroom` | 오뚜기 뉴스룸 | brand_newsroom | `npm run data:refresh-brand-ottogi` | 전 항목 존재 | PASS |
| `samyang-foods-newsroom` | 삼양식품 미디어 | brand_newsroom | `npm run data:refresh-brand-samyang-foods` | 전 항목 존재 | PASS |
| `orion-newsroom` | 오리온 뉴스룸 | brand_newsroom | `npm run data:refresh-brand-orion` | 전 항목 존재 | PASS |
| `ediya-news` | 이디야커피 뉴스 | brand_official_site | `npm run data:refresh-brand-ediya` | 전 항목 존재 | PASS |
| `gongcha-news` | 공차코리아 이벤트 | brand_official_site | `npm run data:refresh-brand-gongcha` | 전 항목 존재 | PASS |
| `dongwon-fnb-news` | 동원F&B 뉴스 | brand_newsroom | `npm run data:refresh-brand-dongwon-fnb` | 전 항목 존재 | PASS |
| `pulmuone-newsroom` | 풀무원 뉴스룸 | brand_newsroom | `npm run data:refresh-brand-pulmuone` | 전 항목 존재 | PASS |
| `kyochon-news` | 교촌치킨 소식 | brand_official_site | `npm run data:refresh-brand-kyochon` | 전 항목 존재 | PASS |

## 2. Fixture와 parser 검증

각 source fixture에 `valid`, `empty`, `expired`, `duplicate`, `structure_changed`, `non_food`가 존재한다. 총 9개 fixture 파일, 54개 상태를 검사했다.

`tests/batch4-validation.test.mjs`에서 9개 source 각각에 대해 다음을 검증한다.

- title → 결과 `name`
- brand, venue, startDate, endDate
- sourceUrl, imageUrl, sourceItemId
- category=`food-popup`
- food / non-food 판별
- popup / non-popup 판별
- expired 거절
- duplicate source item 거절 및 계수
- empty와 structure changed 구분

구조 변경 payload는 정상 데이터로 승인되지 않고 `SourceStructureChangedError`를 발생시킨다.

## 3. 실제 부분 실행 결과

공식 source마다 1회 실행했으며 결과와 run-report는 `/tmp/batch4-validation-*-report.json`에 분리 기록했다. 기존 데이터 파일에는 쓰지 않았다.

| source | discovered | fetched | accepted | rejected | duplicate | error | rejectionReasons | 실행 판정 |
|---|---:|---:|---:|---:|---:|---:|---|---|
| CJ제일제당 | 0 | 1 | 0 | 0 | 0 | 0 | `{}` | success_empty |
| 오뚜기 | 10 | 2 | 0 | 10 | 0 | 0 | `not_food=3, expired=7` | success_empty |
| 삼양식품 | 0 | 1 | 0 | 0 | 0 | 0 | `{}` | success_empty |
| 오리온 | 0 | 1 | 0 | 0 | 0 | 0 | `{}` | success_empty |
| 이디야커피 | 0 | 1 | 0 | 0 | 0 | 0 | `{}` | success_empty |
| 공차코리아 | 1 | 1 | 0 | 1 | 0 | 0 | `expired=1` | success_empty |
| 동원F&B | 5 | 6 | 0 | 5 | 0 | 0 | `expired=4, invalid_date=1` | success_empty |
| 풀무원 | 0 | 1 | 0 | 0 | 0 | 0 | `{}` | success_empty |
| 교촌치킨 | 0 | 1 | 0 | 0 | 0 | 0 | `{}` | success_empty |

모든 실행은 예상 목록 식별자를 확인했고 transport 오류, 차단 페이지, 구조 변경이 없었다. 오뚜기·공차·동원F&B의 과거 후보는 정상적으로 만료 또는 비승인 사유로 분류됐다. 동원F&B의 `invalid_date=1`은 공식 과거 기사에 종료일 근거가 없어 추정하지 않고 거절한 항목이다.

## 4. Run-report 검증

9개 report 모두 다음 조건을 만족한다.

- report의 source 배열이 선택 source 1개만 포함
- `healthStatus=empty`
- `acceptedCount`, `duplicateCount`, `errorCount`, `rejectionReasons` 존재
- `acceptedCount=0`, `duplicateCount=0`, `errorCount=0`
- `rejectedCount`와 `rejectionReasons` 합계 일치
- 요청 실패를 empty로 오판한 source 없음
- 구조 변경을 empty로 오판한 source 없음

## 5. 중복과 병합 정책

- 실제 신규 승인 항목: 0건
- 실제 duplicateCount: 0건
- 기존 popup과의 신규 중복 후보: 0건
- 중복으로 제거된 신규 항목: 0건
- 검토 필요 신규 중복: 0건

코드 검사에서 기존 병합 정책을 확인했다.

- 동일 ID는 기존 row를 기반으로 병합하고 `firstSeenAt`을 보존한다.
- 교차 source 후보는 정규화된 `brand || name` + `venue` + `startDate` + `endDate`로 비교한다.
- official source가 비공식 source보다 우선한다.
- fixture duplicate는 source별로 `duplicate_source_item=1`을 기록한다.

## 6. 데이터 회귀

| 항목 | 작업 전 | 작업 후 | 결과 |
|---|---:|---:|---|
| 총 popup | 96 | 96 | 동일 |
| 진행 중 | 81 | 81 | 동일 |
| 예정 | 0 | 0 | 동일 |
| 종료 | 15 | 15 | 동일 |
| ID hash | `9c42b6d55c94af7bd6e9c817165bc0d04a41e65537d4509ad2c15f55b56891a4` | 동일 | PASS |
| 필수 id/name/venue/startDate/sourceUrl 누락 | 각 0 | 각 0 | 동일 |
| 기존 popup 삭제 | 0 | 0 | PASS |

source별 수도 동일하다.

- 현대백화점 공식 쇼핑뉴스 39
- 롯데쇼핑 공식 행사 32
- 신세계백화점 공식 쇼핑뉴스 13
- 갤러리아 공식 쇼핑뉴스 10
- 스타필드 공식 정보 1
- 노들섬 1

기존 96건의 `brand` 필드는 작업 전부터 비어 있으며 작업 후에도 동일하다. 이는 Batch4 parser의 brand 필드 검증과 별개인 기존 데이터 상태로, 이번 검증에서 완전성이 악화되지 않았다.

## 7. Coverage

- 구현 브랜드: 9
- PASS: 9
- FAIL: 0
- BLOCKED: 0
- 신규 popup: 0
- 실제 요청 성공률: 9/9
- fixture 상태 coverage: 54/54

## 8. 전체 테스트

- `npm run audit:data-sources`: PASS, 경고 0
- `npm run check`: PASS
- `npm test`: Node 96/96, Playwright 33/33 PASS
- `npm run build`: PASS

## 9. 남은 위험

- 검증 시점에 진행·예정 브랜드 팝업이 없어 실제 `success_with_items`는 관찰하지 못했다. valid fixture와 parser contract로 승인 경로를 검증했다.
- 뉴스룸 제목에 팝업 키워드가 없는 행사는 발견되지 않는다. 이는 의도된 요청 제한이다.
- 종료일이 공식 기사에 없는 항목은 추정하지 않고 `invalid_date`로 거절한다.

## 10. 최종 판정

# BATCH 4: PASS

9개 source 모두 정적 계약, fixture/parser, 실제 제한 실행, run-report, 중복 정책, 데이터 회귀 검사를 통과했다. FAIL 또는 BLOCKED source는 없다.
