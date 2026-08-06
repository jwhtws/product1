# Collector recovery audit

검증 기준 시각은 2026-08-06(UTC, KST 2026-08-06)이다. 실제 출처 검증은 source별 collector 실행을 한 번으로 제한했고 출력은 `/tmp/recovery-*-report.json`에 격리했다. fixture나 이 감사 출력은 운영 feed에 기록하지 않았다.

## 공통 흐름과 판정

`scripts/refresh-food-popups.mjs`의 `fetchResilient`/`fetchOfficialPage`가 20초 timeout, 최대 3회 시도, 지수 backoff, `Retry-After`, redirect, 한국어 요청 헤더, URL 캐시, 8 MiB 제한과 요청 진단을 담당한다. 400/401/403/404는 같은 URL을 재시도하지 않고 adapter가 다음 공식 경로를 시도한다. `scripts/lib/official-source-discovery.mjs`는 공식 host로 제한해 embedded JSON, JSON-LD, `__NEXT_DATA__`, `__NUXT__`, 초기 상태, fetch/axios endpoint, sitemap, 의미 기반 상세 링크, 이미지와 메뉴 후보를 찾는다. `currentURL` 같은 일반 이동 URL은 API로 간주하지 않는다.

adapter의 순서는 공식 API/embedded data 후보, 공식 목록, 상세, robots/sitemap, source config의 공식 fallback 순이다. 결과는 `success_with_items`, `verified_empty`, `recovered`, `request_failed`, `blocked`, `structure_changed`, `parse_failed`, `search_incomplete`, `unresolved`로 구분한다. 0건만으로 `verified_empty`가 되지 않으며 adapter가 명시적인 정상 빈 목록 근거를 제공해야 한다. 요청·구조·파싱 실패가 하나라도 섞이면 정상 빈 결과로 승격하지 않는다.

각 시도에는 `sourceId`와 함께 method, 요청 URL, 최종 URL, HTTP status, content-type, 응답 크기, timeout, retry 횟수, 차단 감지, error type, 발생 시각을 run report에 기록한다. URL은 토큰성 query를 마스킹하고 cookie/header/body는 기록하지 않는다. `scripts/lib/popup-run-report.mjs`가 `primaryPath`, `fallbackPathsTried`, `recoveredPath`, 후보 수와 `finalStatus`를 보존한다.

## 실제 출처 진단

### times-square

- 최초 URL: `https://www.timessquare.co.kr/sitemap.xml`
- 별도 bounded HEAD: HTTP 200, `text/xml;charset=UTF-8`, 10,006 bytes, 약 19초, redirect 없음
- collector의 browser 계열 요청: sitemap이 `https://www.timessquare.co.kr/web/m/home`으로 이동해 HTTP 200 HTML(239,241 bytes)을 반환했다. 루트도 `https://www.timessquare.co.kr/web/m.gate/home`으로 이동해 HTTP 200 HTML(78,849 bytes)이었다.
- timeout/retry: collector 실행에서는 timeout 없음, 각 기록 retry 0회. 다만 XML HEAD가 20초 경계에 가까워 기존 1회 요청은 불안정했다.
- 차단 페이지: 감지되지 않음.
- 실제 데이터/렌더링: Liferay HTML에서 이벤트 상세 URL 4개를 찾았지만, 모바일 redirect 결과 네 상세가 같은 형태의 HTML(각 126,569 bytes)로 돌아와 필수 제목·날짜를 추출하지 못했다. JavaScript/Liferay 렌더 경로의 영향이 있다.
- embedded JSON/API: live HTML의 `currentURL` 계열 문자열이 API처럼 오인되던 것을 확인했다. 공식 JSON API로 검증된 endpoint는 없으며 해당 false positive는 제외했다.
- sitemap/상세: `robots.txt`, 기본 sitemap, `sitemap.xml?p_l_id=894&layoutUuid=event`, 이벤트 상세 패턴을 시도했다.
- 기존 selector: sitemap `<loc>` + `/event|promotion|popup|news|culture|magazine/` URL 하나에 주로 의존했고 상세는 `og:title`/heading과 날짜 패턴을 사용했다.
- 실패 단계/원인: UA에 따른 sitemap redirect와 상세 parser의 모바일 Liferay 구조 미대응. snapshot 최종 상태는 `parse_failed`이다.
- 복구 변경: XML resource에는 XML Accept와 crawler UA를 별도로 사용하고, 루트 embedded/API → robots → sitemap index/urlset → Liferay sitemap → 상세의 순서로 진행한다. 단일 sitemap 오류는 더 이상 collector 전체 예외가 아니다.

### amore-seongsu

- 최초 URL: `https://www.amore-seongsu.com/`
- 최종 URL: `https://www.amoremall.com/kr/ko/store/display?storeCode=001`
- 응답: HTTP 200, `text/html; charset=utf-8`, 111,114 bytes(직접 fallback 111,110 bytes). 최초 redirect는 302였고 최종 응답의 `X-Powered-By`는 Next.js였다.
- timeout/retry/차단: timeout 없음, retry 0회, 차단 감지 없음.
- 실제 데이터/렌더링: 공식 store page HTML은 받았으나 현재 푸드 팝업 후보·상세 링크는 0개였다. 이미지 URL 후보 92개는 store 공통 asset을 포함하므로 행사 이미지로 자동 채택하지 않았다.
- embedded JSON/API: Next.js 사용은 확인했지만 live 응답에서 팝업과 연결되는 공식 API/embedded payload는 확정하지 못했다.
- sitemap/상세: 기존 도메인과 공식 Amore Mall store 경로를 모두 확인했다. 이 실행에서 팝업 상세 링크는 발견되지 않았다.
- 기존 selector: 정확한 `아모레성수` marker와 `/store|event|program|news|display|content/` anchor 패턴. marker 문구 변경 시 전체 구조 변경으로 오판할 수 있었다.
- 실패 단계/원인: redirect 대상은 정상이지만 marker가 없고 공식 store의 일반 이미지와 행사 데이터를 구분할 근거가 부족하다.
- 복구 변경: marker는 보조 신호로 낮추고 title/canonical, JSON 계열, 의미 링크, 날짜·푸드·팝업 신호를 함께 본다. 200/0건은 `verified_empty`가 아니라 `search_incomplete`이다. live snapshot은 수정 전 보고서에 `verified_empty`로 기록됐으나 이 오판을 회귀 테스트로 차단했으며 source 재요청은 하지 않았다.

### ktng-sangsangmadang

- 최초 URL: `https://www.sangsangmadang.com/`
- 응답 변동: 별도 HEAD는 HTTP 403, `text/html;charset=UTF-8`, 2,791 bytes였고 collector GET은 HTTP 200, 같은 content-type, 26,145 bytes였다. edge/method에 따라 차단 여부가 달랐다.
- timeout/retry: collector 실행 timeout 없음, retry 0회.
- fallback: `/display`와 `/search?query=팝업`은 각각 404였고 같은 URL 재시도 없이 다음 경로로 진행했다.
- 실제 데이터/상세: 공식 root에서 상세 신호 1개를 찾았고 기존 공식 seed `/display/detail/3099`는 HTTP 200, 29,894 bytes였다. 해당 항목은 종료된 과거 항목으로 parser의 현재 수집 범위에서는 `expired`였다.
- embedded JSON/API/sitemap: live 실행에서 검증된 JSON API나 sitemap은 없었다. 상세 HTML에서 이미지 후보 41개를 찾았지만 행사 대표이미지로 확인된 후보와 메뉴 후보는 0개였다.
- 기존 selector: `상상마당` marker와 `/display/detail/<id>` seed. 지점·공연·전시·식음 구분용 의미 검증이 약했다.
- 실패 단계/원인: 고정 fallback 두 개가 404이고 현재 식음 팝업의 존재 여부를 확정할 공식 목록 근거가 부족하다. snapshot 최종 상태는 `unresolved`이다.
- 복구 변경: anchor/card/`data-event-id`를 함께 보고 제목·날짜·팝업·푸드 신호를 모두 통과한 상세만 수집한다. 일반 공연·전시는 제외하며 seed 실패와 목록 0건을 정상 빈 결과로 처리하지 않는다.

### lotte-department-outlet-mall / 광복점

- 최초 URL: 지점 코드 `0333`의 공식 내부 검색. 회귀 항목은 `라이프컬처 Pop-Up`, `퐁신당 Pop-Up`이다.
- 최종 URL/status/content: 두 검색 모두 scoped 5초 요청에서 timeout되어 HTTP status, content-type, 응답 크기, redirect URL을 얻지 못했다. 별도 20초 HEAD도 연결 timeout이었다.
- retry: scoped 회귀 실행은 source 과다 요청을 막기 위해 URL당 1회였다. 공통 daily 정책은 최대 3회 후 공식 fallback으로 진행한다.
- 차단/HTML/JS/embedded/API/sitemap: 응답 자체가 없어 판정할 수 없다. 차단 페이지라고 단정하지 않았다.
- 기존 parser: 공식 내부 검색 카드 주변의 `SNM...` ID, 지점/제목/날짜를 맞추고 `shpgnewsDetail`을 따라간다. 최초 전체 이름 검색이 timeout되면 기존에는 축약 브랜드 검색으로 넘어가지 못했다.
- 실패 단계/원인: 네트워크 요청 단계. snapshot 최종 상태는 `unresolved`, 두 항목의 `contentSearch.status`는 `search_incomplete`이다. 이미지·메뉴가 없다고 최종 판정하지 않았다.
- 복구 변경: 전체 행사명 → 브랜드명 → 구두점 정리명 검색을 각각 독립 요청으로 실행한다. 하나가 timeout/404여도 다음 검색을 수행하고, `SNM` 상세가 확인된 경우에만 해당 상세의 이미지·메뉴를 연결한다.

## 광복점 회귀 증거

live scoped 실행의 checked URLs는 다음 두 공식 검색 URL이었다.

- `https://m.lotteshopping.com/search/searchResult?cstrCd=0333&searchTerm=라이프컬처%20Pop-Up`
- `https://m.lotteshopping.com/search/searchResult?cstrCd=0333&searchTerm=퐁신당%20Pop-Up`

checked methods는 `official_list_html`, `operator_internal_search`이며 두 요청 모두 timeout이다. 따라서 live evidence, 추출 이미지, 추출 메뉴는 각각 0건이고, 상세/embedded JSON/내부 API/롯데 내부 검색 이후의 브랜드 공식 홈페이지·뉴스룸·블로그·registry SNS는 확인 완료로 표시하지 않았다. 최종 상태는 `search_incomplete`/source `unresolved`이고 미추출 사유는 `official_list_request_failed`, `official_detail_not_identified`, `official_detail_images_not_checked`, `brand_official_sources_not_checked`이다.

네트워크 없는 회귀 fixture에서는 최초 전체 검색 0건 뒤 `searchTerm=퐁신당` 공식 검색에서 `SNM00000000000557777`을 찾고 공식 상세로 이동한다. 상세의 `og:image`인 `https://minfo.lotteshopping.com/content/news/202608/SNM00000000000557777/hero.jpg`와 `퐁신 카스테라 8,000원`을 추출해 `recovered`로 판정한다. 이는 parser/복구 계약 검증용이며 live 사실이나 운영 데이터로 게시하지 않는다.

## 삭제·게시 안전성

실패 source는 `verified_empty`로 위장하지 않고 기존 row의 보존/품질 검토 경로로 전달한다. 이번 작업은 운영 `data/popups.json`을 갱신하지 않았고 fixture를 feed에 복사하지 않았다. 이미지와 메뉴는 후보 탐색만 확장했으며 기존 콘텐츠 품질 검사에서 공식 URL, 이미지 응답/content-type/크기/placeholder 및 메뉴 근거를 검증하기 전에는 게시 근거로 사용하지 않는다.

## 재현 명령

기본 검증은 다음 명령으로 수행한다.

```sh
npm run audit:data-sources
npm run check
npm test
npm run build
```

source별 수동 진단은 운영 feed 대신 임시 output/report 경로를 지정해 실행한다.

```sh
node scripts/refresh-food-popups.mjs --retailer=times-square --output=/tmp/recovery-times.json --run-report=/tmp/recovery-times-report.json --coverage-output=/tmp/recovery-times-coverage.json
node scripts/refresh-food-popups.mjs --retailer=amore-seongsu --output=/tmp/recovery-amore.json --run-report=/tmp/recovery-amore-report.json --coverage-output=/tmp/recovery-amore-coverage.json
node scripts/refresh-food-popups.mjs --retailer=ktng-sangsangmadang --output=/tmp/recovery-ktng.json --run-report=/tmp/recovery-ktng-report.json --coverage-output=/tmp/recovery-ktng-coverage.json
node scripts/refresh-food-popups.mjs --retailer=lotte-gwangbok --output=/tmp/recovery-lotte.json --run-report=/tmp/recovery-lotte-report.json --coverage-output=/tmp/recovery-lotte-coverage.json
```
