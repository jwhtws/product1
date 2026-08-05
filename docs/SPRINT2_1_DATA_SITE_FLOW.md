# Sprint2-1 Data → Site 연결

## 단일 Feed 결정

사이트는 `app.js`에서 `data/popups.json`의 `popups` 배열을 읽고 있다. 따라서 `data/food-popups/site-feed.json` 같은 두 번째 Feed는 만들지 않는다. 기존 `data/popups.json`을 유일한 Site Feed로 유지하고, 기존 UI/SEO 소비자가 사용하는 `name`, `imageUrl`, `sourceUrl`도 보존한다.

## 처리 흐름

```text
공식 Collector
  ↓ collector별 rows / stats / sourceHealth
임시 Raw 파일 (`data/popups.json.raw-<pid>`, 실행 종료 시 제거)
  ↓ scripts/refresh-food-popups.mjs의 기존 병합·정규화·중복 제거
scripts/refresh-popup-site-feed.mjs
  ↓ Site Feed 정규화·필수값 검사·run-report 기록
data/popups.json (유일한 Popup Feed)
  ↓ 정적 배포
Site app.js
```

운영 진입점은 `scripts/refresh-popup-site-feed.mjs`다. 이 스크립트는 기존 Feed를 임시 Raw 경로에 복사해 collector의 기존 데이터 병합 기준을 보존하고, collector 성공 후에만 `scripts/build-popup-site-feed.mjs`로 검증·변환하여 최종 Feed를 원자 교체한다. Collector 또는 Feed 변환이 실패해도 기존 Site Feed는 Raw 데이터로 덮이지 않는다. 임시 Raw 파일은 성공·실패와 관계없이 제거한다. Collector 파일은 변경하지 않았다.

GitHub 일일 갱신과 모든 `data:refresh-*` npm 명령도 이 진입점을 사용한다. Collector가 실패하면 Feed 변환은 실행하지 않으며, 성공한 경우에만 같은 출력 파일을 원자적으로 교체한다.

## Feed 구조

Top-level 기존 필드 `updatedAt`, `sources`, `stats`, `coverage`, `popups`를 유지하고 `feedVersion=1`을 추가한다.

각 popup은 다음 Site Feed 필드를 항상 가진다.

| 필드 | 형식 | 규칙 |
|---|---|---|
| id | string | 기존 ID 보존 |
| title | string | 기존 `name`과 동일한 표시 제목 |
| brand | string | 명시 brand 우선, 없으면 팝업 표시 제목에서 접두·접미어 제거 |
| venue | string | 공백 정규화 |
| branch | string | 명시 branch 우선, 없으면 venue |
| address | string | 기존 공식 주소 보존 |
| latitude / longitude | number 또는 null | 좌표가 검증된 경우만 기록 |
| category | string | 소문자 kebab-case, 푸드 팝업은 `food-popup` |
| status | enum | `upcoming`, `ongoing`, `ended`만 허용 |
| startDate / endDate | YYYY-MM-DD 또는 null | 시작일 필수, 공식 종료일이 없는 상시 행사는 endDate null |
| dDay | integer 또는 null | 예정은 시작일까지, 진행/종료는 종료일까지의 일수 |
| image | HTTPS URL 또는 null | 대표 공식 이미지 |
| officialUrl | HTTPS URL | 기존 `sourceUrl`과 동일하며 URL을 변경하지 않음 |
| sourceName | string | 공식 출처명 |
| sourceItemId | string | collector ID 우선, 없으면 기존 ID에서 안정적으로 파생 |
| tags | string[] | brand, venue, region, category, 공식 메뉴 기반 |
| isNew | boolean | firstSeenAt 기준 0~7일 |
| isEndingSoon | boolean | ongoing이며 종료까지 0~3일 |
| lastUpdated | string | source 갱신일 우선 |

하위 호환을 위해 `name`, `imageUrl`, `sourceUrl`과 기존 상세 필드는 삭제하지 않는다.

## 정규화와 중복

1. 날짜를 `YYYY-MM-DD`로 통일한다.
2. brand의 법인·팝업 표식, venue의 중복 공백, category 표기를 정규화한다.
3. 날짜를 기준으로 status와 dDay를 계산한다.
4. firstSeenAt과 endDate를 기준으로 isNew, isEndingSoon을 계산한다.
5. 동일 ID를 제거한다.
6. 정규화 brand + venue + startDate + endDate가 같은 행을 한 번 더 제거한다.
7. 충돌 시 official 등급, 공식 이미지, 좌표가 더 완전한 행을 우선한다.

## Validation과 Run Report

Feed 포함 전 다음 핵심값을 검사한다.

- id, title, brand, venue, branch, address
- category, status, startDate
- officialUrl, sourceName, sourceItemId, lastUpdated
- 날짜 순서, HTTPS URL, tags, dDay 타입

공식 정보가 없을 수 있는 endDate, dDay, image, latitude, longitude는 필드 존재를 강제하되 null을 허용한다. 핵심값이 없는 행과 중복 행은 Feed에서 제외하고 기존 collector run-report의 `siteFeed.rejectionReasons`에 이유를 기록한다.

`siteFeed` report에는 다음이 포함된다.

- inputCount / outputCount / rejectedCount
- duplicateRemovedCount / rejectionReasons
- statusDistribution
- newCount / endingSoonCount
- missingImageCount / missingCoordinateCount
- generatedAt

## 실행 명령

- 전체 수집 후 자동 Feed 생성: `npm run data:refresh-popups`
- 기존 수집 결과만 Feed로 재생성: `npm run data:build-site-feed`
- source 부분 실행: 기존 `npm run data:refresh-*` 명령을 그대로 사용

부분 실행에 `--output`과 `--run-report`를 전달하면 collector와 Feed builder가 같은 경로를 사용하므로 다른 source가 섞이지 않는다.
