# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: tests/search.spec.js >> 배포 사이트에서 고수경 검색 결과를 표시한다
- Location: tests/search.spec.js:3:1

# Error details

```
Error: expect(locator).toBeVisible() failed

Locator: locator('.restaurant-card h3').filter({ hasText: '고수경샤브칼국수' }).first()
Expected: visible
Timeout: 5000ms
Error: element(s) not found

Call log:
  - Expect "toBeVisible" with timeout 5000ms
  - waiting for locator('.restaurant-card h3').filter({ hasText: '고수경샤브칼국수' }).first()

```

```yaml
- banner:
  - link "mukdang.com 메인 화면":
    - /url: ./
    - text: mukdang.com
  - navigation "주요 메뉴":
    - link "맛집 찾기":
      - /url: "#discover"
    - button "저장 목록 0"
    - button "마이페이지"
  - button "로그인"
- main:
  - heading "mukdang" [level=1]:
    - link "mukdang":
      - /url: ./
  - paragraph: Eating place
  - searchbox "맛집 검색": 고수경
  - button "찾는 중" [disabled]
  - text: 인기 검색
  - button "전체"
  - button "한식"
  - button "일식"
  - button "중식"
  - button "양식"
  - button "카페"
  - button "분식"
  - text: 검색 지역
  - strong: 전국 16개 시·도
  - text: 식당 정보
  - strong: 공공데이터 기반
  - text: 나만의 맛집
  - strong: 간편 저장
  - text: 오늘의 인기 맛집
  - heading "검색 결과" [level=2]
  - paragraph: 0곳 · 빠른 미리보기
  - text: 지역
  - combobox "지역":
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
  - text: 음식 종류
  - combobox "음식 종류":
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
  - text: 가격대
  - combobox "가격대":
    - option "전체" [selected]
    - option "₩ 가볍게"
    - option "₩₩ 보통"
    - option "₩₩₩ 특별하게"
  - text: 분위기
  - combobox "분위기":
    - option "전체" [selected]
    - option "혼밥"
    - option "데이트"
    - option "가족 외식"
    - option "회식"
  - text: 정렬
  - combobox "정렬":
    - option "추천순" [selected]
    - option "신뢰도순"
    - option "별점순"
    - option "이름순"
  - button "초기화"
  - text: ‘고수경’ 검색을 시작합니다… 조건에 맞는 식당이 없습니다.
  - button "필터 초기화"
  - paragraph: 공공데이터포털 전국 일반음식점 표준데이터 기준 · 추천 점수와 가격대는 탐색 편의를 위한 데모 값입니다.
  - region "먹당 인기 정보":
    - article:
      - heading "인기검색" [level=2]
      - button "1 한식 든든한 한 끼":
        - text: "1"
        - strong: 한식
        - text: 든든한 한 끼
      - button "2 카페 커피와 디저트":
        - text: "2"
        - strong: 카페
        - text: 커피와 디저트
      - button "3 일식 깔끔한 메뉴":
        - text: "3"
        - strong: 일식
        - text: 깔끔한 메뉴
      - button "4 중식 오늘의 별미":
        - text: "4"
        - strong: 중식
        - text: 오늘의 별미
      - button "5 분식 가볍게 즐기기":
        - text: "5"
        - strong: 분식
        - text: 가볍게 즐기기
    - article:
      - heading "최신리뷰" [level=2]
      - paragraph: 아직 등록된 리뷰가 없습니다.
    - article:
      - heading "인기리뷰" [level=2]
      - paragraph: 유용한 리뷰가 곧 표시됩니다.
- contentinfo:
  - strong: mukdang.com
  - text: Find a table you can trust.
  - group: 제휴문의
  - text: © 2026 mukdang.com ·
  - link "관리자":
    - /url: admin.html
- status
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
> 12 |   await expect(page.locator('.restaurant-card h3').filter({ hasText: '고수경샤브칼국수' }).first()).toBeVisible({ timeout: 5000 });
     |                                                                                             ^ Error: expect(locator).toBeVisible() failed
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
  38 |   await expect(page.locator('.restaurant-card')).not.toContainText('AI 대표 이미지');
  39 |   await target.click();
  40 |   await expect(page.locator('#modal-content')).toContainText('효천황토장어');
  41 |   await expect(page.locator('#modal-content')).toContainText('2014년 2월 26일');
  42 | });
  43 | 
```