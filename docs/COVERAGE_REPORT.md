# Batch 2 Collector Validation & Coverage Report

검증 시각: 2026-08-04 09:08–09:14 UTC  
대상 저장소: `jwhtws/product1`  
판정: **FAIL — Batch 3 진입 불가**

## 1. 검증 범위와 방법

Registry의 active 자동 source 12개와 partial 공통 sitemap adapter를 source scope별로 실제 실행했다. 각 실행은 `data/popups.json`을 `/tmp/batch2-<scope>.json`으로 복제한 파일에만 기록하여 운영 popup 파일을 변경하지 않았다. 12개 npm scope가 생성하는 run-report source는 롯데 scope의 두 source를 분리하므로 총 13개다.

중요한 선행 사실은 Registry에 `priority=S AND implementationStatus=planned`인 source가 **0개**라는 점이다. 따라서 “Batch 2 구현 완료” 상태를 Registry로 확인할 수 없으며, S등급 retail 미구현 source는 `unverified`, Times Square는 `partial`이다. 이 보고서는 현재 active collector의 운영 검증 결과이며 존재하지 않는 Batch 2 collector의 통과를 의미하지 않는다.

## 2. Source 실행 결과

Health score는 성공률 30, 유지보수성 20, fixture 10, parser test 10, 부분 실행 10, run-report 10, health 계측 10점으로 평가했다. transport 오류를 삼켜 report와 로그가 불일치하면 성공률·유지보수성·health를 감점했다.

| Source / scope | discovered | accepted | rejected | duplicate | errors | report health | report `lastSuccessfulAt` (UTC) | 기존 popup 기여 | 점수 | 판정 |
|---|---:|---:|---:|---:|---:|---|---|---:|---:|---|
| 현대백화점·현대아울렛 / hyundai | 192 | 39 | 153 | 0 | 0 | degraded (`error_rate_50`) | 09:08:18 | 39 / 41.9% | 86 | PASS |
| 롯데 공식 블로그 / lotte | 0 | 0 | 0 | 0 | 0 | empty | 09:08:19 | 0 | 76 | PASS(빈 결과) |
| 롯데백화점·아울렛·몰 / lotte | 30 | 30 | 0 | 0 | 0 | healthy | 09:08:40 | 30 / 32.3% | 68 | **FAIL** — 다수 상세 요청 timeout이 report에 없음 |
| 신세계백화점 / shinsegae | 323 | 13 | 310 | 0 | 0 | degraded (`error_rate_50`) | 09:08:44 | 13 / 14.0% | 84 | PASS |
| 스타필드·스타필드시티 / starfield | 1 | 1 | 0 | 0 | 0 | healthy | 09:08:45 | 1 / 1.1% | 88 | PASS |
| 갤러리아 / galleria | 16 | 10 | 6 | 0 | 0 | healthy | 09:09:27 | 10 / 10.8% | 92 | PASS |
| AK플라자 / akplaza | 0 | 0 | 0 | 0 | 0 | empty (`consecutive_empty_3`) | 09:09:29 | 0 | 59 | **FAIL** |
| NC·뉴코아 / eland | 0 | 0 | 0 | 0 | 0 | empty (`consecutive_empty_3`) | 09:09:31 | 0 | 59 | **FAIL** |
| 아이파크몰 / ipark | 0 | 0 | 0 | 0 | 0 | empty (`consecutive_empty_3`) | 09:09:32 | 0 | 59 | **FAIL** |
| 이마트·트레이더스 / emart | 0 | 0 | 0 | 0 | 0 | empty (`consecutive_empty_3`) | 09:09:41 | 0 | 42 | **FAIL** — 공식 endpoint 404가 errorCount 0 |
| 롯데마트 / lottemart | 0 | 0 | 0 | 0 | 0 | empty (`consecutive_empty_3`) | 09:12:04 | 0 | 48 | **FAIL** — 빈 결과에 약 60초 소요 |
| 홈플러스 / homeplus | 0 | 0 | 0 | 0 | 0 | empty (`consecutive_empty_3`) | 09:12:08 | 0 | 42 | **FAIL** — 공식 endpoint 400이 errorCount 0 |
| 공식 쇼핑몰·마트 sitemap / malls | 21 | 0 | 21 | 0 | 0 | empty (`error_rate_50`, `consecutive_empty_3`) | 09:13:47 | 0 | 45 | **FAIL** — 404를 삼키고 98초 소요 |

실제 `failed`/`structure_changed` health가 0이라는 수치는 신뢰할 수 없다. 이마트 404, 홈플러스 400, sitemap 내부 404, 롯데 상세 timeout이 모두 collector 내부에서 보존 처리되어 `errorCount=0`으로 사라졌다. 정상 빈 결과와 요청 실패를 운영 report에서 구분해야 한다는 Batch 1 계약을 위반한다.

표의 시각은 run-report가 기록한 `lastSuccessfulAt`이다. 요청 실패가 숨겨진 empty 실행에도 이 값이 갱신되므로 “실제 최근 성공”을 신뢰성 있게 나타내지 못하며, 이것도 health 계측 결함으로 판정했다.

## 3. Coverage KPI

| KPI | 값 | 해석 |
|---|---:|---|
| active automated sources | 12 | Registry active + 자동 collectionMethod |
| 실행 scope / report source | 12 / 13 | 롯데 scope가 blog와 retail을 분리 |
| report상 successful sources | 13 | failed/structure_changed 없음; transport 오류 누락 때문에 과대평가 |
| item-producing report sources | 5 | 현대, 롯데 retail, 신세계, 스타필드, 갤러리아 |
| validation PASS / FAIL | 5 / 8 | 롯데 blog 빈 결과는 PASS, 롯데 retail은 timeout 은폐로 FAIL |
| timeout source | 1 | 롯데 retail 상세 요청에서 명시적 timeout 다수; 롯데마트는 60초 빈 실행으로 timeout 의심 |
| 평균 discovered | 44.85 | 총 583 / report source 13 |
| 전체 acceptance rate | 15.95% | 93 / 583 |
| 전체 duplicate rate | 0% | 0 / 583 |
| report상 error rate | 0% | errorCount 0 / 583; 실제 transport 로그와 불일치 |
| popup coverage contribution | 5개 source가 93건 전부 | 8개 report source는 현재 기여 0 |

전국 전체 대비 coverage가 아니다. 현재 저장된 popup 93건에 대한 source 기여도만 계산했다.

## 4. Regression 결과

기준과 12개 격리 실행 결과는 모두 동일했다.

- 총 popup: 93 → 93
- 상태: active 78, upcoming 0, ended 15
- source별: 현대 39, 롯데 30, 신세계 13, 갤러리아 10, 스타필드 1
- 정렬된 ID SHA-256: `ba2d6cce72bdb43ee3595757745d972d3291f0b07dbb53078791e61d69df41f2`
- 필수 필드 `id/name/venue/startDate/sourceUrl`: 465 / 465
- 예상하지 않은 삭제: 없음
- 운영 `data/popups.json`: Git blob `3e6bd57e8778e05dd7ec0f991fb9b546a1964223`, 변경 없음

빈 결과 scope는 기존 행 보존 정책 덕분에 삭제를 발생시키지 않았다. 데이터 보존은 PASS지만 collector가 실제로 정상이라는 증거는 아니다.

## 5. 중복 검사

- 동일 ID: 0
- 동일 title + startDate + endDate: 0
- 동일 source URL 후보: 3개 공식 묶음 공지
  - 갤러리아 광교 `c85957`: 4개 브랜드
  - 갤러리아 광교 `c85958`: 4개 브랜드
  - 갤러리아 타임월드 `c85834`: 2개 브랜드

위 URL 중복은 하나의 공식 일정 카드에 여러 실제 브랜드가 포함된 구조로, 현재 ID와 title/date는 서로 달라 즉시 삭제할 중복은 아니다. `sourceItemId`를 별도 출력 schema로 저장하지 않으므로 최종 데이터에서 sourceItemId 중복을 직접 판정할 수 없는 gap이 있다.

## 6. Registry Gap

### 미구현 S source 36개

Retail Batch 2 후보는 신세계사이먼, 세이브존, 모다, 마리오, LF스퀘어, 동아백화점, M백화점, IFC몰, 스퀘어원, 트리플스트리트, 엔터식스, 커먼그라운드, 두타몰, 파라다이스시티, 인스파이어몰, 아난티코브, 센트럴시티, 파미에스테이션, 밀락더마켓, 더베이101, 제주드림타워, 롯데월드몰, 코엑스 일정이다. 모두 `unverified`이며 Times Square만 `partial`이다.

나머지 S gap은 popup venue/manual source이며 Batch 3 이후 범위이므로 구현하지 않았다: Sweetspot, Space Wadiz, LCDC, S-Factory, Layer41, 언더스탠드에비뉴, DDP, Cociety, Peaches D8NE, Haus Dosan, 무신사 Empty, BEXCO.

### 미구현 A source 60개

- retail/mall: grand-department-store, apple-outlet, orange-outlet, fashion-island-daejeon, mecenatpolis, one-mount, lafesta, western-dom, garden5, ananti-at-gangnam
- popup venue: culture-station-seoul-284, oil-tank-culture-park, nodeul-island, piknic, amore-seongsu, KT&G 상상마당, 현대카드 Storage, 서울숲
- brand/newsroom: CJ제일제당부터 bhc까지 Registry의 A등급 브랜드 30개
- public/festival: VisitKorea/TourAPI와 부산·대구·대전·광주·제주·강원·전북·전남·충남·경북 공식 포털 12개

A source는 이번 Validation 범위에서 구현하거나 상태를 변경하지 않았다.

## 7. FAIL Top 10

1. Registry에 `S + planned` Batch 2 source가 0개라 구현 완료 주장을 입증할 수 없다.
2. 13개 report source 중 item-producing source는 5개뿐이다.
3. 이마트 endpoint 404가 `empty/errorCount=0`으로 보고된다.
4. 홈플러스 endpoint 400이 `empty/errorCount=0`으로 보고된다.
5. 롯데 상세 요청의 다수 timeout이 retail source `healthy/errorCount=0`에 숨겨진다.
6. 공통 sitemap 내부 404가 source error에 반영되지 않는다.
7. AK·이랜드·아이파크·이마트·롯데마트·홈플러스가 3회 연속 빈 결과다.
8. 롯데마트 빈 실행이 약 60초, sitemap이 약 98초로 운영 비용이 높다.
9. `fetchedCount=0`인데 accepted가 존재하는 현대·신세계·스타필드·갤러리아 계측 불일치가 있다.
10. 최종 popup schema에 sourceItemId가 없어 sourceItemId 중복 KPI를 직접 검증할 수 없다.

## 8. 최종 판정

**Batch 2 Validation: FAIL**

데이터 보존, fixture/parser/부분 실행 회귀, 현재 5개 기여 source의 결과는 안정적이다. 그러나 Registry상 Batch 2 구현 대상 자체가 없고, HTTP/timeout 오류가 health와 errorCount에 반영되지 않으며, active source 다수가 반복적으로 0건이다. 이 상태에서는 **Batch 3에 진입하면 안 된다**.

다음 작업은 신규 source나 Batch 3 구현이 아니라 다음의 교정 검증이어야 한다.

1. transport 실패를 삼키지 말고 sourceHealth/errorCount에 집계
2. 404/400 endpoint 재검증 후 Registry 상태를 사실에 맞게 별도 승인 변경
3. 반복 empty source의 정상 빈 결과와 구조 변경 구분
4. fetchedCount 계측 일관화
5. Registry에서 검증 완료된 Batch 2 대상을 `planned`로 명시한 뒤 구현·재검증
