# Mukdang Design System

먹당 화면을 점진적으로 개편하기 위한 공통 토큰과 컴포넌트입니다. 음식 탐색에 집중되는 간결함, 따뜻한 레드·오렌지, 충분한 여백을 먹당의 시각 원칙으로 삼습니다. 특정 제품의 형태를 복제하지 않고 Apple HIG의 명료성, Airbnb의 콘텐츠 중심 카드, 지도 서비스의 탐색성, Netflix의 계층감, Material 3의 상태 모델을 먹당 문맥에 맞게 재구성했습니다.

## 구조

- `tokens/*.ts`: 타입 안전한 원본 토큰
- `theme.css`: 브라우저용 토큰, Light/Dark 테마, 기존 변수 호환 별칭
- `components.css`: 공통 컴포넌트와 상태
- `components.js`: 탭, 칩, 모달, 토스트, 로딩의 최소 동작
- `/component-showcase/`: 실제 컴포넌트와 반응형 동작 확인 페이지

## 원칙

1. Mobile First: 기본 스타일은 모바일이며 Tablet `768px`, Desktop `1200px`에서 확장합니다.
2. 접근성: 본문과 제어 색은 WCAG AA 대비를 목표로 하며, 모든 제어는 최소 `44px`, `:focus-visible` 포커스 링, 의미에 맞는 ARIA를 사용합니다.
3. 상태: Default, Hover, Pressed, Disabled, Selected, Loading, Error가 시각적 속성뿐 아니라 HTML 속성(`disabled`, `aria-selected`, `aria-busy`, `aria-invalid`)으로도 표현됩니다.
4. 점진적 적용: 기존 클래스는 바꾸지 않습니다. 새 화면부터 `md-` 접두 클래스와 `--md-` 변수를 사용합니다.
5. 모션: Fast 120ms, Normal 200ms, Slow 320ms를 사용하며 `prefers-reduced-motion`을 존중합니다.

## 사용

```html
<link rel="stylesheet" href="/design-system/theme.css">
<link rel="stylesheet" href="/design-system/components.css">
<button class="md-button md-button--primary">저장</button>
```

상호작용이 필요하면 초기화합니다.

```js
import { initializeDesignSystem, showToast } from '/design-system/components.js';
initializeDesignSystem();
showToast('저장했어요.');
```

테마는 루트의 `data-theme`으로 제어합니다. 기본은 Light이며 `dark` 또는 OS 설정을 따르는 `system`을 사용할 수 있습니다.

```html
<html data-theme="dark">
```

## 컴포넌트 목록

Button(Primary, Secondary, Outline, Ghost, Danger), Card(Popup, Brand, Region, Category, Mini, Hero), Chip, Badge, Input, Search, Tab, Bottom Navigation, Top Navigation, Modal, Toast, Loading, Skeleton, Section Header, Tag, Rating, Avatar, Divider를 제공합니다. 마크업과 모든 상태 예시는 Showcase에서 확인합니다.

## 접근성 체크리스트

- 아이콘 전용 버튼에 접근 가능한 이름 제공
- 탭에는 `tablist`, `tab`, `aria-selected` 사용
- 오류 입력에는 `aria-invalid`와 설명 요소 연결
- 로딩에는 `aria-busy` 또는 `role="status"` 제공
- 모달은 네이티브 `dialog` 사용으로 포커스와 Escape 닫기 지원
- 색만으로 상태를 전달하지 않고 텍스트·속성을 함께 사용
- 키보드 포커스 순서가 시각 순서와 일치하도록 유지

## 기존 화면 적용 순서

1. `theme.css`만 연결해 호환 별칭 확인
2. 신규 섹션에 토큰 변수 사용
3. 기존 요소를 한 종류씩 `md-` 컴포넌트로 교체
4. Light/Dark 및 Mobile/Tablet/Desktop 회귀 검사

Storybook은 현재 저장소에 없어 정적 Showcase를 사용합니다. 추후 Storybook 도입 시 각 `.demo` 블록을 스토리로 옮길 수 있습니다.
