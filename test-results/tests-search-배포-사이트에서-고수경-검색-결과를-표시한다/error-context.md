# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: tests/search.spec.js >> 배포 사이트에서 고수경 검색 결과를 표시한다
- Location: tests/search.spec.js:3:1

# Error details

```
Error: expect(received).toEqual(expected) // deep equality

- Expected  - 1
+ Received  + 5

- Array []
+ Array [
+   "Failed to load resource: the server responded with a status of 404 ()",
+   "Failed to load resource: the server responded with a status of 404 ()",
+   "Failed to load resource: the server responded with a status of 404 ()",
+ ]
```

# Page snapshot

```yaml
- generic [ref=e1]:
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
        - searchbox "맛집 검색" [ref=e17]: 고수경
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
        - paragraph [ref=e43]: 2곳 · 빠른 미리보기
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
        - article [active] [ref=e58]:
          - generic [ref=e59]: AI 대표 이미지
          - generic [ref=e61]:
            - generic [ref=e62]:
              - generic [ref=e63]: 한식
              - button "저장" [ref=e64] [cursor=pointer]: ♡
            - heading "고수경샤브칼국수" [level=3] [ref=e66]
            - paragraph [ref=e67]: 경기도 수원시 팔달구 중부대로143번길 13 (우만동)
            - generic [ref=e68]:
              - strong [ref=e69]: ★ 3.8
              - generic [ref=e70]: 신뢰도 87%
              - generic [ref=e71]: ₩
            - generic [ref=e72]:
              - generic [ref=e73]: 가족 외식
              - generic [ref=e74]: 21년 9개월 영업
        - article [ref=e75]:
          - generic [ref=e76]: AI 대표 이미지
          - generic [ref=e78]:
            - generic [ref=e79]:
              - generic [ref=e80]: 한식
              - button "저장" [ref=e81] [cursor=pointer]: ♡
            - heading "고수경샤브칼국수" [level=3] [ref=e83]
            - paragraph [ref=e84]: 경기도 용인시 기흥구 중부대로 579 (구갈동,강남대프라자 201호)
            - generic [ref=e85]:
              - strong [ref=e86]: ★ 3.7
              - generic [ref=e87]: 신뢰도 86%
              - generic [ref=e88]: ₩₩₩
            - generic [ref=e89]:
              - generic [ref=e90]: 회식
              - generic [ref=e91]: 18년 11개월 영업
      - paragraph [ref=e92]: 공공데이터포털 전국 일반음식점 표준데이터 기준 · 추천 점수와 가격대는 탐색 편의를 위한 데모 값입니다.
    - region "먹당 인기 정보" [ref=e93]:
      - article [ref=e94]:
        - heading "인기검색" [level=2] [ref=e95]
        - generic [ref=e96]:
          - button "1 한식 든든한 한 끼" [ref=e97] [cursor=pointer]:
            - generic [ref=e98]: "1"
            - strong [ref=e99]: 한식
            - generic [ref=e100]: 든든한 한 끼
          - button "2 카페 커피와 디저트" [ref=e101] [cursor=pointer]:
            - generic [ref=e102]: "2"
            - strong [ref=e103]: 카페
            - generic [ref=e104]: 커피와 디저트
          - button "3 일식 깔끔한 메뉴" [ref=e105] [cursor=pointer]:
            - generic [ref=e106]: "3"
            - strong [ref=e107]: 일식
            - generic [ref=e108]: 깔끔한 메뉴
          - button "4 중식 오늘의 별미" [ref=e109] [cursor=pointer]:
            - generic [ref=e110]: "4"
            - strong [ref=e111]: 중식
            - generic [ref=e112]: 오늘의 별미
          - button "5 분식 가볍게 즐기기" [ref=e113] [cursor=pointer]:
            - generic [ref=e114]: "5"
            - strong [ref=e115]: 분식
            - generic [ref=e116]: 가볍게 즐기기
      - article [ref=e117]:
        - heading "최신리뷰" [level=2] [ref=e118]
        - paragraph [ref=e120]: 아직 등록된 리뷰가 없습니다.
      - article [ref=e121]:
        - heading "인기리뷰" [level=2] [ref=e122]
        - paragraph [ref=e124]: 유용한 리뷰가 곧 표시됩니다.
  - contentinfo [ref=e125]:
    - generic [ref=e126]:
      - strong [ref=e127]: mukdang.com
      - generic [ref=e128]: Find a table you can trust.
    - group [ref=e129]:
      - generic "제휴문의" [ref=e130] [cursor=pointer]
    - generic [ref=e131]:
      - text: © 2026 mukdang.com ·
      - link "관리자" [ref=e132] [cursor=pointer]:
        - /url: admin.html
  - dialog [ref=e133]:
    - article [ref=e134]:
      - button "닫기" [ref=e135] [cursor=pointer]: ×
      - generic [ref=e136]:
        - generic [ref=e137]: AI 대표 이미지
        - generic [ref=e139]:
          - generic [ref=e140]: 한식
          - heading "고수경샤브칼국수" [level=2] [ref=e141]
          - paragraph [ref=e142]: 경기도 수원시 팔달구 중부대로143번길 13 (우만동)
          - generic [ref=e143]:
            - strong [ref=e144]: ★ 3.8
            - generic [ref=e145]: 리뷰 신뢰도 87%
            - generic [ref=e146]: ₩ · 가족 외식
          - generic [ref=e147]:
            - button "♡ 저장" [ref=e148] [cursor=pointer]
            - button "리스트에 추가" [ref=e149] [cursor=pointer]
            - button "공유" [ref=e150] [cursor=pointer]
        - generic [ref=e151]: 사진·가격·좌석 정보를 확인하는 중입니다.
        - generic [ref=e153]:
          - generic [ref=e154]:
            - heading "식당 정보" [level=3] [ref=e155]
            - generic [ref=e156]:
              - term [ref=e157]: 주소
              - definition [ref=e158]: 경기도 수원시 팔달구 중부대로143번길 13 (우만동)
              - term [ref=e159]: 전화번호
              - definition [ref=e160]: 정보 없음
              - term [ref=e161]: 영업 시작일
              - definition [ref=e162]:
                - text: 2004년 9월 30일
                - generic [ref=e163]: 공공 인허가 기록 확인
              - term [ref=e164]: 영업 기간
              - definition [ref=e165]: 21년 9개월 영업
              - term [ref=e166]: 영업시간
              - definition [ref=e167]: 방문 전 지도 서비스에서 확인해 주세요.
            - paragraph [ref=e168]: 영업 시작일은 행정안전부 일반음식점 인허가 데이터의 식품위생 영업 인허가일 기준이며, 실제 첫 영업일과 다를 수 있습니다.
            - generic [ref=e169]:
              - link "네이버 지도 · 주소검색" [ref=e170] [cursor=pointer]:
                - /url: https://map.naver.com/p/search/%EA%B2%BD%EA%B8%B0%EB%8F%84%20%EC%88%98%EC%9B%90%EC%8B%9C%20%ED%8C%94%EB%8B%AC%EA%B5%AC%20%EC%A4%91%EB%B6%80%EB%8C%80%EB%A1%9C143%EB%B2%88%EA%B8%B8%2013
              - link "Google 지도" [ref=e171] [cursor=pointer]:
                - /url: https://www.google.com/maps/search/?api=1&query=%EA%B3%A0%EC%88%98%EA%B2%BD%EC%83%A4%EB%B8%8C%EC%B9%BC%EA%B5%AD%EC%88%98%20%EA%B2%BD%EA%B8%B0%EB%8F%84%20%EC%88%98%EC%9B%90%EC%8B%9C%20%ED%8C%94%EB%8B%AC%EA%B5%AC%20%EC%A4%91%EB%B6%80%EB%8C%80%EB%A1%9C143%EB%B2%88%EA%B8%B8%2013%20(%EC%9A%B0%EB%A7%8C%EB%8F%99)
          - generic [ref=e172]:
            - generic [ref=e173]:
              - heading "사용자 리뷰 0" [level=3] [ref=e174]
              - combobox [ref=e175]:
                - option "최신순" [selected]
                - option "별점순"
                - option "유용한순"
            - generic [ref=e176]: ✓ 작성 리뷰는 기기에 저장됩니다. 방문 인증과 광고성 리뷰 자동 검토는 서버 연동 후 제공됩니다.
            - generic [ref=e177]:
              - generic [ref=e178]:
                - text: 별점
                - combobox "별점" [ref=e179]:
                  - option "5점" [selected]
                  - option "4점"
                  - option "3점"
                  - option "2점"
                  - option "1점"
              - textbox "직접 경험한 맛과 분위기를 알려주세요." [ref=e180]
              - generic [ref=e181]:
                - text: 사진 첨부
                - button "사진 첨부" [ref=e182]
              - button "리뷰 등록" [ref=e183] [cursor=pointer]
            - paragraph [ref=e185]: 첫 번째 솔직한 리뷰를 남겨주세요.
  - status [ref=e186]
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
  9  |   page.on('requestfailed', request => errors.push(`REQUEST ${request.url()} ${request.failure()?.errorText}`));
  10 | 
  11 |   await page.goto(process.env.TEST_BASE_URL || 'https://jwhtws.github.io/product1/', { waitUntil: 'domcontentloaded' });
  12 |   await page.locator('#search-input').pressSequentially('고수경', { delay: 80 });
  13 |   const startedAt = Date.now();
  14 |   await page.locator('#search-button').click();
  15 |   await expect(page.locator('.restaurant-card h3').filter({ hasText: '고수경샤브칼국수' }).first()).toBeVisible({ timeout: 5000 });
  16 |   console.log('ELAPSED_MS', Date.now() - startedAt);
  17 |   console.log('SUMMARY', await page.locator('#result-summary').textContent());
  18 |   console.log('STATE', await page.locator('#app-state').textContent());
  19 |   console.log('CARDS', await page.locator('.restaurant-card h3').allTextContents());
  20 |   console.log('CARD_COUNT', await page.locator('.restaurant-card').count());
  21 |   await page.locator('.restaurant-card').filter({ hasText: '고수경샤브칼국수' }).first().click();
  22 |   await expect(page.locator('#detail-modal')).toHaveClass(/open/);
  23 |   console.log('DETAIL', await page.locator('#modal-content').innerText());
  24 |   await expect(page.locator('#modal-content')).toContainText('영업 시작일');
  25 |   await expect(page.locator('#modal-content')).toContainText('공공 인허가 기록 확인');
  26 |   console.log('ERRORS', errors);
  27 |   await expect(page.locator('#result-summary')).not.toContainText('0곳');
> 28 |   expect(errors).toEqual([]);
     |                  ^ Error: expect(received).toEqual(expected) // deep equality
  29 | });
  30 | 
```