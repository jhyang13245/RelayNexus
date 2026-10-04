# Cortex 1.7.1 릴리스 노트

배포일: 2026-08-25

## 적용 범위

- 독립 Cortex HTML에만 적용했습니다.
- Relay Nexus/단청 본체의 엔진 선택 및 집필 런타임은 변경하지 않았습니다.
- 집필 엔진은 언제나 최신 Cortex 1.7.1 하나만 사용합니다.

## 변경 사항

- 설정의 구형 엔진 및 `Chronos Core Beta` 선택을 제거했습니다.
- 설정에서 엔진이 아니라 다음 두 서사를 선택합니다.
  - Relay · 무인택배함 10사건
  - 크로노스 코어 · 원작 연속 10사건
- 두 서사의 턴, 정사 기억, Capsule 상태를 서로 독립 저장합니다.
- Cortex 1.7.0의 저장 데이터는 Relay 서사로 안전하게 이관하고, 제거된 베타 프로필 상태는 가져오지 않습니다.
- 모의 로컬 생성 없이 기기별 API Key로만 실행하는 기존 정책을 유지합니다.

## 크로노스 코어 수록 사건

첨부된 `크로노스 코어 ScenarioPack v1.5`의 정식 연속 구간을 사용했습니다.

1. `CC_CH01_NOTE_ONE` — 정체불명의 쪽지
2. `CC_CH02_SILVER_KEY` — 부끄러운 하루와 은빛 부품
3. `CC_CH03_FIRST_RESET` — 전학생과 첫 리셋
4. `CC_CH04_NOTE_THREE` — 익숙한 듯 낯선 하루
5. `CC_CH05_DEJA_VU` — 데자뷔
6. `CC_CH06_LOOP_CONFIRMED` — 과거 회귀 인식
7. `SH_CH07_TELL_TRUTH` — 반복을 시험하다
8. `SH_CH08_SCIENTIFIC_DISCOVERY` — 위대한 과학적 발견
9. `SH_CH09_WAREHOUSE` — 3층 창고
10. `SH_CH10_CIPHER_ALLIANCE` — 암호로 되찾은 동맹

## 검증

- 독립 HTML 런타임 및 렌더링 테스트 47개 통과
- 크로노스 사건 ID·순서·10사건 길이 검증
- Relay/Chronos 상태 격리 및 왕복 복원 검증
- 제거된 베타·구형 엔진 선택 문자열 부재 검증
- 전체 프로젝트 테스트는 배포 전에 별도로 실행
