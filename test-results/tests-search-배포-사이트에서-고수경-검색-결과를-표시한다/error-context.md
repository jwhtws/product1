# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: tests/search.spec.js >> 배포 사이트에서 고수경 검색 결과를 표시한다
- Location: tests/search.spec.js:3:1

# Error details

```
Test timeout of 30000ms exceeded.
```

```
Error: expect(locator).toBeVisible() failed

Locator: locator('.restaurant-card h3').filter({ hasText: '고수경샤브칼국수' }).first()
Expected: visible
Error: element(s) not found

Call log:
  - Expect "toBeVisible" with timeout 30000ms
  - waiting for locator('.restaurant-card h3').filter({ hasText: '고수경샤브칼국수' }).first()
  - Test timeout of 30000ms exceeded.

```

```yaml
- banner:
  - link "먹당 홈":
    - /url: "#home"
    - text: 먹당
  - navigation "주요 메뉴":
    - link "맛집 찾기":
      - /url: "#discover"
    - button "저장 목록 0"
    - button "마이페이지"
  - button "로그인"
- main:
  - text: TRUSTED RESTAURANT GUIDE
  - heading "검색은 빠르게, 선택은 믿을 수 있게." [level=1]
  - paragraph: 전국 공공데이터와 나의 취향을 바탕으로 오늘의 식당을 찾아보세요.
  - searchbox "맛집 검색": 고수경
  - button "검색"
  - button "전체"
  - button "한식"
  - button "일식"
  - button "중식"
  - button "양식"
  - button "카페"
  - strong: 전국 16개 시·도
  - text: 공공데이터 기반 식당 정보
  - strong: 검증 리뷰
  - text: 방문 인증·신뢰도 표시 준비 중
  - strong: 나만의 리스트
  - text: 브라우저에 안전하게 저장 DISCOVER
  - heading "나를 위한 맛집" [level=2]
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
  - text: 검색하거나 필터를 적용하면 전국 전체 데이터를 불러옵니다. 조건에 맞는 식당이 없습니다.
  - button "필터 초기화"
  - paragraph: 공공데이터포털 전국 일반음식점 표준데이터 기준 · 추천 점수와 가격대는 탐색 편의를 위한 데모 값입니다.
- contentinfo:
  - strong: 먹당
  - text: 믿고 고르는 오늘의 식당 © 2026 Meokdang
- status
```

# Test source

```ts
  1  | const { test, expect } = require('@playwright/test');
  2  | 
  3  | test('배포 사이트에서 고수경 검색 결과를 표시한다', async ({ page }) => {
  4  |   const errors = [];
  5  |   page.on('pageerror', error => errors.push(error.message));
  6  |   page.on('console', message => {
  7  |     if (message.type() === 'error') errors.push(message.text());
  8  |   });
  9  | 
  10 |   await page.goto('https://jwhtws.github.io/product1/', { waitUntil: 'domcontentloaded' });
  11 |   await page.locator('#search-input').fill('고수경');
  12 |   await page.locator('#search-button').click();
> 13 |   await expect(page.locator('.restaurant-card h3').filter({ hasText: '고수경샤브칼국수' }).first()).toBeVisible({ timeout: 30000 });
     |                                                                                             ^ Error: expect(locator).toBeVisible() failed
  14 |   await expect(page.locator('#result-summary')).toContainText('2곳');
  15 |   expect(errors).toEqual([]);
  16 | });
  17 | 
```