# Batch 3 verified venue scope

기준일: 2026-08-05

이 문서는 `data/data-source-registry.json`과 현재 collector 구현을 대조한 뒤 확정한 Batch 3 범위다. 이 문서에 없는 source는 이번 Batch에서 구현하지 않는다.

## 구현 범위

| sourceId | 조치 | 공식 근거 | 상태 목표 |
| --- | --- | --- | --- |
| `shinsegae-simon-premium-outlets` | 신규 collector | 지점별 공식 이벤트 목록과 상세 페이지에 제목·기간·이미지가 공개됨 | active |
| `ifc-mall` | 신규 collector | 공식 NOW JSON 목록 API와 공개 상세 페이지가 확인됨 | active |
| `doota-mall` | 신규 collector | 공식 `event_list.json`에 ID·제목·기간·이미지가 공개됨 | active |
| `times-square` | 기존 sitemap adapter 보완 | robots 허용 및 sitemap index 확인. 상세 event URL의 실운영 검증은 부족함 | partial 유지 |

## 기존 coverage로 제외

- `lotte-world-mall`: `롯데백화점·롯데아울렛·롯데몰` collector가 같은 시설과 공식 피드를 이미 수집한다.
- `coex-event-calendar`: active `starfield` source와 `coexmall` branch가 코엑스몰을 포함한다.
- 커넥트현대: Batch 후보 sourceId가 registry에 없고 기존 현대 운영 범위를 중복 생성하지 않는다.

## 공식 구조 미확인으로 보류

- `square-one`, `triple-street`: 공식 이벤트 응답을 안정적으로 확인하지 못했다.
- `enter6`: 공개 목록·상세는 확인했지만 기간이 포스터 이미지 안에만 있어 자동 날짜 파싱 근거가 없다.
- `common-ground`: 공개 홈페이지 외 안정적인 공식 일정 feed를 확인하지 못했다.
- `moda-outlet`: 공식 페이지가 자동 요청에 403을 반환했다.
- `mario-outlet`: 공식 도메인의 TLS 인증을 검증하지 못했다.
- `lf-square`: 공개 사이트는 확인했으나 안정적인 공식 이벤트 feed를 확인하지 못했다.

보류 source는 `unverified`를 유지한다. 로그인, CAPTCHA, 비공개 인증, SNS 또는 비공식 대체 출처를 사용하지 않는다.
