# mukdang 운영 구조

## 프로젝트 책임

- `product1`: 사용자 화면, 회원 인증, 리뷰, 저장 목록, 검색 활동, 식당 데이터 API
- `product2`: 관리자 화면과 관리자 전용 API
- `mukdang-db`: 두 프로젝트가 공유하는 Cloudflare D1 데이터베이스

새 기능이 관리자에게 보여야 한다면 product1의 저장 API, D1 마이그레이션, product2의 조회 API와 화면을 하나의 변경으로 다룬다.

## 코드 구조

- `app.js`: 화면 조립과 이벤트 연결
- `js/api.js`: 브라우저 API 요청과 공통 오류 형식
- `js/site-plan.js`: 식당 평면도 생성
- `functions/_lib/auth.js`: 비밀번호 해시, 세션, 로그인 시도 제한
- `functions/api/_middleware.js`: API 출처 검사, 보안 헤더, 공통 오류 처리
- `functions/api/*`: 기능별 Pages Functions
- `migrations/`: 순서가 보존되는 D1 스키마 변경
- `scripts/`: 데이터 생성·검증과 프로젝트 검사

## 변경 절차

1. 기능별 모듈 또는 API만 수정한다.
2. D1 변경은 새 마이그레이션 파일로 추가한다. 기존 마이그레이션은 수정하지 않는다.
3. `npm run check`를 실행한다.
4. 데이터 변경이면 `npm run data:validate`도 실행한다.
5. 브라우저 회귀 테스트 후 product1과 필요한 경우 product2를 배포한다.

## 보안 기본값

- 세션 쿠키는 `HttpOnly`, `Secure`, `SameSite=Strict`
- 비밀번호는 PBKDF2 해시로 저장
- 로그인 실패는 D1에서 15분 단위로 제한
- 쓰기 API는 다른 Origin의 브라우저 요청을 거부
- API 내부 오류는 요청 ID만 사용자에게 반환하고 상세 내용은 서버 로그에 기록
- 관리자 암호와 세션 키는 Cloudflare Secrets에만 저장

## 대용량 데이터

원본 CSV는 배포하지 않는다. 배포에는 분할 JSON과 검색 인덱스만 포함한다. 데이터 갱신은 GitHub Actions에서 검증 후 커밋하며, 실패한 데이터는 배포하지 않는다.
