# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: tests/search.spec.js >> 상호 중간 단어와 지점명으로도 공공데이터 식당을 찾는다
- Location: tests/search.spec.js:31:1

# Error details

```
Error: expect(locator).not.toContainText(expected) failed

Locator: locator('.restaurant-card')
Expected substring: not "AI 대표 이미지"
Error: strict mode violation: locator('.restaurant-card') resolved to 10 elements:
    1) <article tabindex="0" data-index="0" class="restaurant-card" data-place-key="294845921">…</article> aka getByText('한식 · 사진 없음 한식♡ 황토장어경기도 포천시 소흘읍 죽엽산로405번길 22-1 영업 기간28년 영업 중 ★ 4.7신뢰도 89')
    2) <article tabindex="0" data-index="1" class="restaurant-card" data-place-key="1573567120">…</article> aka getByText('한식 · 사진 없음 한식♡ 황토장어전남광주통합특별시 북구 북문대로 247 (동림동) 영업 기간14년 영업 중 ★ 4.6신뢰도 81')
    3) <article tabindex="0" data-index="2" class="restaurant-card" data-place-key="1425820892">…</article> aka getByText('한식 · 사진 없음 한식♡ 황토장어마을서울특별시 서초구 방배천로 5-2, 2층 (방배동) 영업 기간10년 영업 중 ★ 4.2신뢰도 91')
    4) <article tabindex="0" data-index="3" class="restaurant-card" data-place-key="1279934408">…</article> aka getByText('기타 · 사진 없음 기타♡ 황토장어2')
    5) <article tabindex="0" data-index="4" class="restaurant-card" data-place-key="646962377">…</article> aka getByText('한식 · 사진 없음 한식♡ 효천황토장어경기도 의왕시 능안길 2 (내손동) 영업 기간12년 영업 중 ★ 4.1신뢰도 83')
    6) <article tabindex="0" data-index="5" class="restaurant-card" data-place-key="634207261">…</article> aka getByText('통닭(치킨) · 사진 없음 통닭(치킨)♡ 황토장군불바베큐경기도 군포시 한세로4번길 6, 105동 107')
    7) <article tabindex="0" data-index="6" class="restaurant-card" data-place-key="1426432785">…</article> aka getByText('한식 · 사진 없음 한식♡ 황토장군불바베큐경기도 여주시 세종로 394-11 영업 기간20년 영업 중 ★ 3.9신뢰도 88')
    8) <article tabindex="0" data-index="7" class="restaurant-card" data-place-key="621278833">…</article> aka getByText('통닭(치킨) · 사진 없음 통닭(치킨)♡ 황토장군불바베큐경상북도 경산시 경안로67길 4-1 (대평동) 영업 기간19년 영업 중 ★ 3.9')
    9) <article tabindex="0" data-index="8" class="restaurant-card" data-place-key="1309429691">…</article> aka getByText('통닭(치킨) · 사진 없음 통닭(치킨)♡ 황토장군불바베큐전남광주통합특별시 여수시 도원로 188-1 (안산동) 영업 기간19년 영업 중 ★ 4.')
    10) <article tabindex="0" data-index="9" class="restaurant-card" data-place-key="1694086336">…</article> aka getByText('호프/통닭 · 사진 없음 호프/통닭♡ 황토장군 치킨 바베규전남광주통합특별시 여수시 박람회길 20, 세영빌 (덕충동) 영업 기간2')

Call log:
  - Expect "not toContainText" with timeout 5000ms
  - waiting for locator('.restaurant-card')

```

# Page snapshot

```yaml
- generic [active] [ref=e1]:
  - banner [ref=e2]:
    - link "mukdang.com 메인 화면" [ref=e3] [cursor=pointer]:
      - /url: ./
      - text: mukdang.com
    - navigation "주요 메뉴" [ref=e4]:
      - link "맛집 찾기" [ref=e5] [cursor=pointer]:
        - /url: "#discover"
      - button "저장 목록 0" [ref=e6] [cursor=pointer]:
        - text: 저장 목록
        - generic [ref=e7]: "0"
      - button "마이페이지" [ref=e8] [cursor=pointer]
    - button "로그인" [ref=e9] [cursor=pointer]
  - main [ref=e10]:
    - generic [ref=e11]:
      - heading [level=1] [ref=e12]:
        - link "mukdang" [ref=e13] [cursor=pointer]:
          - /url: ./
      - paragraph [ref=e14]: Eating place
      - generic [ref=e16]:
        - searchbox "맛집 검색" [ref=e17]: 황토장어 본점
        - button "검색" [ref=e18] [cursor=pointer]
      - generic "인기 검색" [ref=e19]:
        - button "전체" [ref=e21] [cursor=pointer]
        - button "한식" [ref=e22] [cursor=pointer]
        - button "일식" [ref=e23] [cursor=pointer]
        - button "중식" [ref=e24] [cursor=pointer]
        - button "양식" [ref=e25] [cursor=pointer]
        - button "카페" [ref=e26] [cursor=pointer]
        - button "분식" [ref=e27] [cursor=pointer]
    - generic [ref=e29]:
      - generic [ref=e30]:
        - generic [ref=e31]: 검색 지역
        - strong [ref=e32]: 전국 16개 시·도
      - generic [ref=e33]:
        - generic [ref=e34]: 식당 정보
        - strong [ref=e35]: 공공데이터 기반
      - generic [ref=e36]:
        - generic [ref=e37]: 나만의 맛집
        - strong [ref=e38]: 간편 저장
    - generic [ref=e39]:
      - generic [ref=e41]:
        - text: 오늘의 인기 맛집
        - heading "검색 결과" [level=2] [ref=e42]
        - paragraph [ref=e43]: 13곳 · 빠른 미리보기
      - generic [ref=e44]:
        - generic [ref=e45]:
          - text: 지역
          - combobox "지역" [ref=e46]:
            - option "전국" [selected]
            - option "강원특별자치도"
            - option "경기도"
            - option "경상남도"
            - option "경상북도"
            - option "대구광역시"
            - option "대전광역시"
            - option "부산광역시"
            - option "서울특별시"
            - option "세종특별자치시"
            - option "울산광역시"
            - option "인천광역시"
            - option "전남광주통합특별시"
            - option "전북특별자치도"
            - option "제주특별자치도"
            - option "충청남도"
            - option "충청북도"
        - generic [ref=e47]:
          - text: 음식 종류
          - combobox "음식 종류" [ref=e48]:
            - option "전체" [selected]
            - option "경양식"
            - option "기타"
            - option "분식"
            - option "뷔페식"
            - option "식육(숯불구이)"
            - option "외국음식전문점(인도,태국등)"
            - option "일식"
            - option "정종/대포집/소주방"
            - option "중국식"
            - option "탕류(보신용)"
            - option "통닭(치킨)"
            - option "패밀리레스트랑"
            - option "한식"
            - option "호프/통닭"
            - option "횟집"
        - generic [ref=e49]:
          - text: 가격대
          - combobox "가격대" [ref=e50]:
            - option "전체" [selected]
            - option "₩ 가볍게"
            - option "₩₩ 보통"
            - option "₩₩₩ 특별하게"
        - generic [ref=e51]:
          - text: 분위기
          - combobox "분위기" [ref=e52]:
            - option "전체" [selected]
            - option "혼밥"
            - option "데이트"
            - option "가족 외식"
            - option "회식"
        - generic [ref=e53]:
          - text: 정렬
          - combobox "정렬" [ref=e54]:
            - option "추천순" [selected]
            - option "신뢰도순"
            - option "별점순"
            - option "이름순"
        - button "초기화" [ref=e55] [cursor=pointer]
      - generic [ref=e56]: 검색하거나 필터를 적용하면 전국 전체 데이터를 불러옵니다.
      - generic [ref=e57]:
        - article [ref=e58]:
          - generic [ref=e59]:
            - text: 한식
            - generic [ref=e60]: 한식 · 사진 없음
            - text: 실제 사진 준비 중
          - generic [ref=e61]:
            - generic [ref=e62]:
              - generic [ref=e63]: 한식
              - button "저장" [ref=e64] [cursor=pointer]: ♡
            - heading "황토장어" [level=3] [ref=e66]
            - paragraph [ref=e67]: 경기도 포천시 소흘읍 죽엽산로405번길 22-1
            - generic [ref=e68]:
              - generic [ref=e69]: 영업 기간
              - strong [ref=e70]: 28년 영업 중
            - generic [ref=e71]:
              - strong [ref=e72]: ★ 4.7
              - generic [ref=e73]: 신뢰도 89%
              - generic [ref=e74]: ₩₩₩
            - generic [ref=e75]:
              - generic [ref=e76]: 데이트
              - generic [ref=e77]: 인허가일 확인됨
        - article [ref=e78]:
          - generic [ref=e79]:
            - text: 한식
            - generic [ref=e80]: 한식 · 사진 없음
            - text: 실제 사진 준비 중
          - generic [ref=e81]:
            - generic [ref=e82]:
              - generic [ref=e83]: 한식
              - button "저장" [ref=e84] [cursor=pointer]: ♡
            - heading "황토장어" [level=3] [ref=e86]
            - paragraph [ref=e87]: 전남광주통합특별시 북구 북문대로 247 (동림동)
            - generic [ref=e88]:
              - generic [ref=e89]: 영업 기간
              - strong [ref=e90]: 14년 영업 중
            - generic [ref=e91]:
              - strong [ref=e92]: ★ 4.6
              - generic [ref=e93]: 신뢰도 81%
              - generic [ref=e94]: ₩
            - generic [ref=e95]:
              - generic [ref=e96]: 혼밥
              - generic [ref=e97]: 인허가일 확인됨
        - article [ref=e98]:
          - generic [ref=e99]:
            - text: 한식
            - generic [ref=e100]: 한식 · 사진 없음
            - text: 실제 사진 준비 중
          - generic [ref=e101]:
            - generic [ref=e102]:
              - generic [ref=e103]: 한식
              - button "저장" [ref=e104] [cursor=pointer]: ♡
            - heading "황토장어마을" [level=3] [ref=e106]
            - paragraph [ref=e107]: 서울특별시 서초구 방배천로 5-2, 2층 (방배동)
            - generic [ref=e108]:
              - generic [ref=e109]: 영업 기간
              - strong [ref=e110]: 10년 영업 중
            - generic [ref=e111]:
              - strong [ref=e112]: ★ 4.2
              - generic [ref=e113]: 신뢰도 91%
              - generic [ref=e114]: ₩₩
            - generic [ref=e115]:
              - generic [ref=e116]: 혼밥
              - generic [ref=e117]: 인허가일 확인됨
        - article [ref=e118]:
          - generic [ref=e119]:
            - text: 기타
            - generic [ref=e120]: 기타 · 사진 없음
            - text: 실제 사진 준비 중
          - generic [ref=e121]:
            - generic [ref=e122]:
              - generic [ref=e123]: 기타
              - button "저장" [ref=e124] [cursor=pointer]: ♡
            - heading "황토장어2" [level=3] [ref=e126]
            - paragraph [ref=e127]: 경기도 의왕시 백운로 485-4, 2,3층 (학의동)
            - generic [ref=e128]:
              - generic [ref=e129]: 영업 기간
              - strong [ref=e130]: 11년 영업 중
            - generic [ref=e131]:
              - strong [ref=e132]: ★ 3.6
              - generic [ref=e133]: 신뢰도 85%
              - generic [ref=e134]: ₩₩
            - generic [ref=e135]:
              - generic [ref=e136]: 혼밥
              - generic [ref=e137]: 인허가일 확인됨
        - article [ref=e138]:
          - generic [ref=e139]:
            - text: 한식
            - generic [ref=e140]: 한식 · 사진 없음
            - text: 실제 사진 준비 중
          - generic [ref=e141]:
            - generic [ref=e142]:
              - generic [ref=e143]: 한식
              - button "저장" [ref=e144] [cursor=pointer]: ♡
            - heading "효천황토장어" [level=3] [ref=e146]
            - paragraph [ref=e147]: 경기도 의왕시 능안길 2 (내손동)
            - generic [ref=e148]:
              - generic [ref=e149]: 영업 기간
              - strong [ref=e150]: 12년 영업 중
            - generic [ref=e151]:
              - strong [ref=e152]: ★ 4.1
              - generic [ref=e153]: 신뢰도 83%
              - generic [ref=e154]: ₩₩₩
            - generic [ref=e155]:
              - generic [ref=e156]: 회식
              - generic [ref=e157]: 인허가일 확인됨
        - article [ref=e158]:
          - generic [ref=e159]:
            - text: 통닭(치킨)
            - generic [ref=e160]: 통닭(치킨) · 사진 없음
            - text: 실제 사진 준비 중
          - generic [ref=e161]:
            - generic [ref=e162]:
              - generic [ref=e163]: 통닭(치킨)
              - button "저장" [ref=e164] [cursor=pointer]: ♡
            - heading "황토장군불바베큐" [level=3] [ref=e166]
            - paragraph [ref=e167]: 경기도 군포시 한세로4번길 6, 105동 107호 (당정동, 오성푸르메아파트)
            - generic [ref=e168]:
              - generic [ref=e169]: 영업 기간
              - strong [ref=e170]: 18년 영업 중
            - generic [ref=e171]:
              - strong [ref=e172]: ★ 4.1
              - generic [ref=e173]: 신뢰도 97%
              - generic [ref=e174]: ₩₩
            - generic [ref=e175]:
              - generic [ref=e176]: 회식
              - generic [ref=e177]: 인허가일 확인됨
        - article [ref=e178]:
          - generic [ref=e179]:
            - text: 한식
            - generic [ref=e180]: 한식 · 사진 없음
            - text: 실제 사진 준비 중
          - generic [ref=e181]:
            - generic [ref=e182]:
              - generic [ref=e183]: 한식
              - button "저장" [ref=e184] [cursor=pointer]: ♡
            - heading "황토장군불바베큐" [level=3] [ref=e186]
            - paragraph [ref=e187]: 경기도 여주시 세종로 394-11
            - generic [ref=e188]:
              - generic [ref=e189]: 영업 기간
              - strong [ref=e190]: 20년 영업 중
            - generic [ref=e191]:
              - strong [ref=e192]: ★ 3.9
              - generic [ref=e193]: 신뢰도 88%
              - generic [ref=e194]: ₩₩
            - generic [ref=e195]:
              - generic [ref=e196]: 회식
              - generic [ref=e197]: 인허가일 확인됨
        - article [ref=e198]:
          - generic [ref=e199]:
            - text: 통닭(치킨)
            - generic [ref=e200]: 통닭(치킨) · 사진 없음
            - text: 실제 사진 준비 중
          - generic [ref=e201]:
            - generic [ref=e202]:
              - generic [ref=e203]: 통닭(치킨)
              - button "저장" [ref=e204] [cursor=pointer]: ♡
            - heading "황토장군불바베큐" [level=3] [ref=e206]
            - paragraph [ref=e207]: 경상북도 경산시 경안로67길 4-1 (대평동)
            - generic [ref=e208]:
              - generic [ref=e209]: 영업 기간
              - strong [ref=e210]: 19년 영업 중
            - generic [ref=e211]:
              - strong [ref=e212]: ★ 3.9
              - generic [ref=e213]: 신뢰도 88%
              - generic [ref=e214]: ₩₩
            - generic [ref=e215]:
              - generic [ref=e216]: 데이트
              - generic [ref=e217]: 인허가일 확인됨
        - article [ref=e218]:
          - generic [ref=e219]:
            - text: 통닭(치킨)
            - generic [ref=e220]: 통닭(치킨) · 사진 없음
            - text: 실제 사진 준비 중
          - generic [ref=e221]:
            - generic [ref=e222]:
              - generic [ref=e223]: 통닭(치킨)
              - button "저장" [ref=e224] [cursor=pointer]: ♡
            - heading "황토장군불바베큐" [level=3] [ref=e226]
            - paragraph [ref=e227]: 전남광주통합특별시 여수시 도원로 188-1 (안산동)
            - generic [ref=e228]:
              - generic [ref=e229]: 영업 기간
              - strong [ref=e230]: 19년 영업 중
            - generic [ref=e231]:
              - strong [ref=e232]: ★ 4.5
              - generic [ref=e233]: 신뢰도 80%
              - generic [ref=e234]: ₩₩₩
            - generic [ref=e235]:
              - generic [ref=e236]: 데이트
              - generic [ref=e237]: 인허가일 확인됨
        - article [ref=e238]:
          - generic [ref=e239]:
            - text: 호프/통닭
            - generic [ref=e240]: 호프/통닭 · 사진 없음
            - text: 실제 사진 준비 중
          - generic [ref=e241]:
            - generic [ref=e242]:
              - generic [ref=e243]: 호프/통닭
              - button "저장" [ref=e244] [cursor=pointer]: ♡
            - heading "황토장군 치킨 바베규" [level=3] [ref=e246]
            - paragraph [ref=e247]: 전남광주통합특별시 여수시 박람회길 20, 세영빌 (덕충동)
            - generic [ref=e248]:
              - generic [ref=e249]: 영업 기간
              - strong [ref=e250]: 2년 영업 중
            - generic [ref=e251]:
              - strong [ref=e252]: ★ 4.2
              - generic [ref=e253]: 신뢰도 91%
              - generic [ref=e254]: ₩₩
            - generic [ref=e255]:
              - generic [ref=e256]: 혼밥
              - generic [ref=e257]: 인허가일 확인됨
      - generic [ref=e258]:
        - button "이전" [disabled] [ref=e259] [cursor=pointer]
        - generic [ref=e260]: 1 / 2
        - button "다음" [ref=e261] [cursor=pointer]
      - paragraph [ref=e262]: 공공데이터포털 전국 일반음식점 표준데이터 기준 · 추천 점수와 가격대는 탐색 편의를 위한 데모 값입니다.
    - region "먹당 인기 정보" [ref=e263]:
      - article [ref=e264]:
        - heading "인기검색" [level=2] [ref=e265]
        - generic [ref=e266]:
          - button "1 한식 든든한 한 끼" [ref=e267] [cursor=pointer]:
            - generic [ref=e268]: "1"
            - strong [ref=e269]: 한식
            - generic [ref=e270]: 든든한 한 끼
          - button "2 카페 커피와 디저트" [ref=e271] [cursor=pointer]:
            - generic [ref=e272]: "2"
            - strong [ref=e273]: 카페
            - generic [ref=e274]: 커피와 디저트
          - button "3 일식 깔끔한 메뉴" [ref=e275] [cursor=pointer]:
            - generic [ref=e276]: "3"
            - strong [ref=e277]: 일식
            - generic [ref=e278]: 깔끔한 메뉴
          - button "4 중식 오늘의 별미" [ref=e279] [cursor=pointer]:
            - generic [ref=e280]: "4"
            - strong [ref=e281]: 중식
            - generic [ref=e282]: 오늘의 별미
          - button "5 분식 가볍게 즐기기" [ref=e283] [cursor=pointer]:
            - generic [ref=e284]: "5"
            - strong [ref=e285]: 분식
            - generic [ref=e286]: 가볍게 즐기기
      - article [ref=e287]:
        - heading "최신리뷰" [level=2] [ref=e288]
        - paragraph [ref=e290]: 아직 등록된 리뷰가 없습니다.
      - article [ref=e291]:
        - heading "인기리뷰" [level=2] [ref=e292]
        - paragraph [ref=e294]: 유용한 리뷰가 곧 표시됩니다.
  - contentinfo [ref=e295]:
    - generic [ref=e296]:
      - strong [ref=e297]: mukdang.com
      - generic [ref=e298]: Find a table you can trust.
    - group [ref=e299]:
      - generic "제휴문의" [ref=e300] [cursor=pointer]
    - generic [ref=e301]:
      - text: © 2026 mukdang.com ·
      - link "관리자" [ref=e302] [cursor=pointer]:
        - /url: admin.html
  - status [ref=e303]
```

# Test source

```ts
  1  | const { test, expect } = require('@playwright/test');
  2  | 
  3  | test('배포 사이트에서 고수경 검색 결과를 표시한다', async ({ page }) => {
  4  |   const errors = [];
  5  |   page.on('pageerror', error => errors.push(error.message));
  6  |   page.on('requestfailed', request => errors.push(`REQUEST ${request.url()} ${request.failure()?.errorText}`));
  7  | 
  8  |   await page.goto(process.env.TEST_BASE_URL || 'https://jwhtws.github.io/product1/', { waitUntil: 'domcontentloaded' });
  9  |   await page.locator('#search-input').pressSequentially('고수경', { delay: 80 });
  10 |   const startedAt = Date.now();
  11 |   await page.locator('#search-button').click();
  12 |   await expect(page.locator('.restaurant-card h3').filter({ hasText: '고수경샤브칼국수' }).first()).toBeVisible({ timeout: 5000 });
  13 |   console.log('ELAPSED_MS', Date.now() - startedAt);
  14 |   console.log('SUMMARY', await page.locator('#result-summary').textContent());
  15 |   console.log('STATE', await page.locator('#app-state').textContent());
  16 |   console.log('CARDS', await page.locator('.restaurant-card h3').allTextContents());
  17 |   console.log('CARD_COUNT', await page.locator('.restaurant-card').count());
  18 |   await page.locator('.restaurant-card').filter({ hasText: '고수경샤브칼국수' }).first().click();
  19 |   await expect(page.locator('#detail-modal')).toHaveClass(/open/);
  20 |   console.log('DETAIL', await page.locator('#modal-content').innerText());
  21 |   await expect(page.locator('.permit-highlight')).toBeVisible();
  22 |   await expect(page.locator('.permit-highlight')).toContainText('21년 영업 중');
  23 |   await expect(page.locator('.permit-highlight')).toContainText('2004년 9월 30일');
  24 |   await expect(page.locator('#modal-content')).toContainText('공공 인허가 기록 확인');
  25 |   await expect(page.locator('.restaurant-card').first().locator('.tenure-badge')).toContainText('21년 영업 중');
  26 |   console.log('ERRORS', errors);
  27 |   await expect(page.locator('#result-summary')).not.toContainText('0곳');
  28 |   expect(errors).toEqual([]);
  29 | });
  30 | 
  31 | test('상호 중간 단어와 지점명으로도 공공데이터 식당을 찾는다', async ({ page }) => {
  32 |   await page.goto(process.env.TEST_BASE_URL || 'https://product1-84t.pages.dev/', { waitUntil: 'domcontentloaded' });
  33 |   await page.locator('#search-input').fill('황토장어 본점');
  34 |   await page.locator('#search-button').click();
  35 |   const target = page.locator('.restaurant-card').filter({ hasText: '효천황토장어' }).first();
  36 |   await expect(target).toBeVisible({ timeout: 10000 });
  37 |   await expect(target).toContainText('경기도 의왕시 능안길 2');
> 38 |   await expect(page.locator('.restaurant-card')).not.toContainText('AI 대표 이미지');
     |                                                      ^ Error: expect(locator).not.toContainText(expected) failed
  39 |   await target.click();
  40 |   await expect(page.locator('#modal-content')).toContainText('효천황토장어');
  41 |   await expect(page.locator('#modal-content')).toContainText('2014년 2월 26일');
  42 | });
  43 | 
```