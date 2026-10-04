# Cortex Native Pack v1 · Studio–Nexus 연동 계약

> 문서 상태: 구현 기준안  
> 계약 버전: `CORTEX_NATIVE_PACK_CONTRACT_V1`  
> 작성일: 2026-08-25  
> 적용 대상: Relay Novel Studio, Relay Nexus/단청, Cortex Runtime, Relay Core  
> 기준 Cortex: v1.4.0 이상

## 1. 목적

앞으로 제작되는 작품은 Cortex의 속도·정사 전개·변형 기억·시간 동기화·스포일러 방지 기술을 원형 그대로 사용할 수 있는 **Cortex Native Pack**으로 내보낼 수 있어야 한다.

동시에 기존 ScenarioPack 1.4/1.5 및 InstantStoryPack을 폐기하거나 일괄 재제작하지 않는다. 구세대 패키지는 **Legacy Compatibility Adapter**를 통해 동일한 Cortex Runtime Model로 정규화한 뒤 실행한다.

```text
Cortex Native Pack ───────────────┐
                                  ├─> Cortex Runtime Model ─> 집필·검증·기억·표시
Legacy Scenario/Instant Pack ─> Adapter ┘
```

이 계약의 목표는 다음 네 가지다.

1. 기존 작품의 기능과 저장 자산을 보존한다.
2. 신규 작품은 Cortex에 최적화된 정사 메타데이터를 직접 제공한다.
3. 패키지 종류가 달라도 본문 스트리밍·시간·기억·보안의 실행 품질은 같은 원칙을 따른다.
4. Studio와 Runtime의 책임을 분리하여 패키지별 임시 예외 코드를 줄인다.

## 2. 고정 원칙

### 2.1 실행 원칙

- 본문이 나오기 전에 추가 모델 호출을 수행하지 않는다.
- 패키지 분석·무결성 검사·중간 모델 컴파일은 작품을 불러올 때 완료한다.
- 매 턴에는 로컬에서 관련 정사 기억과 사건 자료만 선별한다.
- 본문과 정사 변경분은 한 모델 응답 안에서 생성하며, 정사 변경분은 독자에게 노출하지 않는 후행 sidecar로 처리한다.
- 본문·월드 시간·상태 시간은 하나의 서버 권위 시계를 사용한다.
- 타임루프가 명시된 작품이 아니면 시간 역행을 허용하지 않는다.
- 사건 진행을 방해하는 입력은 플레이어가 시도한 행동과 감정을 먼저 인정한 뒤 작품 내부의 동기·관계·위험·다음 비트로 흡수한다.
- 갑작스러운 전화, 길 폐쇄, 기기 고장 같은 작가 편의 장치는 작품 근거로 흡수할 수 없을 때에만 최후 수단으로 사용한다.

### 2.2 호환 원칙

- Native Pack이 구세대 Pack의 상위호환이라는 이유로 구세대 Pack의 원래 Runtime 모드를 바꾸지 않는다.
- `exclusiveRuntime: true`인 Instant Story Runtime v2는 사건 순서·필수 비트·NPC 자율 정사 엔진으로 변환하거나 혼합하지 않는다.
- 구세대 Pack의 필수 기능이 지원되지 않으면 축소 실행하지 않고 거부한다.
- 선택 기능만 누락된 경우 작품 본체는 유지하고 명확한 호환 경고를 남긴다.
- Adapter는 원본 ZIP을 수정하지 않으며, 누락된 비밀·동기·종결 조건을 추측해 만들지 않는다.

## 3. 패키지 식별과 기능 협상

### 3.1 Native Pack 식별

루트 `manifest.json`에 다음 필드를 둔다.

```json
{
  "packageFormat": "RELAY_CORTEX_NATIVE_PACK_V1",
  "packageVersion": "1.0",
  "projectId": "RN-WORK-001",
  "title": "작품명",
  "runtimeProfile": "canonical_story",
  "runtimeEngine": {
    "id": "cortex",
    "minimumVersion": "1.4.0"
  },
  "requiredFeatures": [
    "cortex_native_runtime_v1",
    "cortex_canon_memory_v1",
    "cortex_chronology_v1",
    "cortex_disclosure_guard_v1",
    "asset_once_storage"
  ],
  "optionalFeatures": [
    "status_relationship_display_v1",
    "character_images",
    "image_on_first_appearance_v1",
    "embedded_studio_project_v1"
  ],
  "unsupportedBehavior": "reject_package"
}
```

`runtimeProfile`은 다음 둘 중 하나다.

| 값 | 의미 |
| --- | --- |
| `canonical_story` | 사건·비트·분기 정사를 유지하면서 플레이어 이탈을 개연성 있게 흡수한다. |
| `instant_story` | 고정 사건 순서를 강제하지 않고 현재 선택·인물·세계 상태에서 자유롭게 이어 간다. |

두 프로필 모두 Cortex의 빠른 스트리밍, 시간 동기화, 변형 정사 기억, 공개 정보 보호, 상태 원자 확정을 사용한다.

### 3.2 Legacy Pack 식별

다음 패키지는 기존 식별 규칙을 그대로 사용한다.

- Studio ScenarioPack 1.4
- Studio ScenarioPack 1.5
- Instant Story Runtime v1
- Instant Story Runtime v2 전용 Pack
- `status_relationship_display_v1`, Asset-Once V1, Media Manifest V2를 사용하는 기존 Pack

Native 식별자가 없으면 Legacy Adapter가 패키지 버전과 기능 협상 필드를 검사한다. 단순히 파일명이 비슷하다는 이유로 Native Pack으로 간주하지 않는다.

## 4. Native Pack 디렉터리 계약

### 4.1 필수 파일

```text
manifest.json
project.json
cortex/runtime.json
cortex/canon_graph.json
cortex/chronology.json
cortex/disclosure.json
cortex/memory_contract.json
characters/player.json
characters/npcs.json
world/world.json
start/opening.json
rules/style.json
rules/status_window.json
assets/manifest.json
```

### 4.2 조건부·선택 파일

```text
cortex/ending_semantics.json
cortex/absorption_anchors.json
cortex/context_index.json
cortex/media_lookup.json
characters/relations.json
characters/factions.json
rules/character_visual_bible.json
rules/turn_presentation.json
runtime/keyword_index.json
runtime/ending_schedule.json
studio/project-snapshot.json
test-vectors/**
assets/**
```

Studio가 내보낸 Native Pack은 `studio/project-snapshot.json`을 포함해야 한다. 형식은 기존 `RELAY_NOVEL_STUDIO_PROJECT_SNAPSHOT_V1`을 유지하며, 단청/Nexus 실행에는 영향을 주지 않고 Studio 재편집 복원에만 사용한다.

## 5. Cortex Runtime Model

Native Loader와 Legacy Adapter는 모두 다음 논리 영역을 가진 중간 모델을 만든다.

```json
{
  "format": "CORTEX_RUNTIME_MODEL_V1",
  "identity": {},
  "runtimeProfile": "canonical_story",
  "publicWorld": {},
  "privateCanon": {},
  "characters": [],
  "factions": [],
  "relationships": [],
  "eventGraph": {},
  "chronology": {},
  "disclosure": {},
  "memoryContract": {},
  "absorptionAnchors": [],
  "statusPresentation": {},
  "media": {},
  "compatibility": {}
}
```

이 모델은 Runtime 내부 자료이며 ZIP에 그대로 저장할 의무는 없다. Studio는 Native 원본 문서를 만들고, Cortex Loader가 이를 검증·컴파일한다.

## 6. 정사·사건 계약

### 6.1 사건 강도 구분

사건 요소를 모두 동일한 필수 조건으로 취급하지 않는다.

| 등급 | 의미 | 실패 처리 |
| --- | --- | --- |
| `invariant` | 세계관 또는 이후 사건을 성립시키는 필수 사실 | 해당 사건 안에서 반드시 보존하거나 안전한 연장 비트 사용 |
| `required_function` | 표현은 달라도 충족되어야 하는 서사 기능 | 문맥·자연스러운 동의 표현·기능적 대체를 인정 |
| `preferred` | 권장 연출·장소·순서 | 플레이어 선택에 따라 변경 가능 |
| `optional` | 분위기·보너스 단서 | 누락 가능 |

### 6.2 사건 예시

```json
{
  "id": "EVENT_PACKAGE_PICKUP",
  "title": "무인택배함의 유산",
  "timeWindow": {
    "start": "15:20",
    "end": "15:30",
    "nextEventAt": "15:30",
    "maxAdvanceSeconds": 600
  },
  "invariants": [
    {
      "id": "INV-HAS-PARCEL",
      "fact": "주인공이 외할머니가 남긴 택배를 소지한다"
    }
  ],
  "requiredFunctions": [
    {
      "id": "FUNC-PICKUP",
      "meaning": "주인공이 택배를 직접 확보한다",
      "equivalents": [
        "무인택배함에서 물품을 수령한다",
        "보관함을 열어 소포를 꺼낸다",
        "관리자 확인을 거쳐 택배를 손에 넣는다"
      ],
      "evidenceAnchors": ["주인공", "택배", "확보"]
    }
  ],
  "nextBeat": "택배 내용물이 다음 습격 사건의 원인이 된다"
}
```

검증기는 문장 일치 여부가 아니라 행위자·대상·결과·인과가 같은지 판단한다. `불탄 고문서 조각`과 `불탄 기록지 조각`, `방공호`와 `오래된 지하공간`, `시야에서 사라졌다`와 `별관으로 떠났다`처럼 문맥상 동일한 기능을 수행하면 참작할 수 있다. 다만 다른 인물·다른 물품·반대 결과를 느슨한 유사도로 통과시키면 안 된다.

### 6.3 마지막 비트

- 작가는 마지막 정규 비트에서 가능한 한 종결 기능을 자연스럽게 충족한다.
- 본문이 의미상 충족했으면 표현 차이만으로 실패시키지 않는다.
- 정말 미충족이면 임시 종결 비트 1개를 열 수 있다.
- 임시 비트는 새 사건을 만들기 위한 것이 아니라 남은 필수 기능을 짧게 회수하기 위한 것이다.
- 임시 비트에서도 실패하면 본문·상태를 저장하지 않고 구체적인 누락 사유를 사용자에게 알린다.

## 7. 이탈 흡수 계약

`cortex/absorption_anchors.json`에는 작품이 허용하는 흡수 근거를 선언한다.

```json
{
  "format": "CORTEX_ABSORPTION_ANCHORS_V1",
  "anchors": [
    {
      "id": "ABSORB-GRANDMOTHER-PARCEL",
      "appliesTo": ["EVENT_PACKAGE_PICKUP"],
      "priority": 100,
      "motives": ["실종된 외할머니의 마지막 흔적을 포기할 수 없다"],
      "relationshipLevers": [],
      "stakes": ["택배를 놓치면 외할머니의 행방을 찾을 단서가 사라진다"],
      "allowedCounterforces": ["스스로 의심해 발걸음을 돌림"],
      "forbiddenConveniences": ["갑작스러운 전화", "원인 없는 길 폐쇄", "기기 고장"]
    }
  ]
}
```

흡수 장면은 원칙적으로 다음 인과를 따른다.

1. `ACKNOWLEDGE`: 사용자의 행동·공포·욕구를 실제 시도로 인정한다.
2. `COUNTERFORCE`: 패키지 근거가 있는 동기·관계·위험·여파가 맞선다.
3. `HESITATION`: 주인공이 즉시 개심하지 않고 갈등한다.
4. `CHOICE`: 주인공이 정사 행동을 스스로 선택한다.
5. `CANON_PAYOFF`: 다음 비트가 성립하는 결과를 장면으로 보여 준다.

최후 수단 장치는 위 근거가 없고 사건을 안전하게 중단할 방법도 없을 때만 한 번 사용한다. 사용 시 `narrativeDebt`를 남겨 이후 장면에서 우연의 대가나 여파를 회수한다.

## 8. 시간·장소 계약

`cortex/chronology.json`은 다음을 포함한다.

- 작품 시작 날짜·시각·장소
- 사건별 시작·종료·다음 사건 시각
- 허용 가능한 턴당 시간 전진 범위
- 장소 간 최소 이동 시간 또는 인접 관계
- 타임루프 여부와 역행 허용 조건
- 고정 일정과 지연 가능한 일정

사용자가 “저녁까지 공부했다”라고 입력했지만 15:30에 필수 사건이 있다면, 서버는 이를 19:00 완료 사실로 확정하지 않는다.

1. `저녁까지 공부하려는 의도`로 해석한다.
2. 현재 사건 경계 전까지 개연성 있게 진행한다.
3. 필수 사건의 원인이 끼어들거나 주인공이 선택을 바꾸게 한다.
4. 저녁까지 공부하려던 욕구는 `deferredGoal`로 보존한다.
5. 본문·상태·월드 시간을 작가가 반환한 문단 시간 sidecar와 함께 확정한다.

문단 시간은 독자에게 항상 출력하지 않는다. Runtime에는 다음처럼 전달한다.

```json
{
  "paragraphId": "P3",
  "startTime": "15:27",
  "endTime": "15:29",
  "locationId": "LIBRARY-1F",
  "timeEvidence": "짧은 대화를 마치고 출구로 향함"
}
```

## 9. 변형 정사 기억 계약

`cortex/memory_contract.json`은 다음 종류를 기본 지원한다.

- `promise`
- `relationship`
- `injury`
- `inventory_add`
- `inventory_remove`
- `destruction`
- `npc_decision`
- `pending_consequence`
- `scene_fact`

정사 원장 항목은 최소한 다음 필드를 가진다.

```json
{
  "id": "canon-unique-id",
  "kind": "promise",
  "subjectRefs": ["actor-public-ref"],
  "targetRef": "actor-or-object-public-ref",
  "statement": "독자에게 이미 확정된 사실",
  "evidence": "확정 본문의 실제 근거 문장",
  "status": "active",
  "createdTurn": 7,
  "updatedTurn": 7,
  "relatedEventRefs": ["event-public-ref"]
}
```

### 9.1 확정 규칙

- 사용자의 입력만으로 확정하지 않고 최종 공개 본문에 근거가 있어야 한다.
- 부정·거절·미수·가정은 완료 사실로 저장하지 않는다.
- 같은 종류의 여러 약속·부상·물품을 대상과 부위까지 구분한다.
- 관계 하락과 거절도 변화로 기록할 수 있다.
- 파괴·NPC 판단·미해결 여파는 후속 장면에 계속 반영한다.
- 정사 변경분 적용에 실패하면 본문·시간·상태를 모두 롤백한다.
- 다음 턴에는 전체 원장이 아니라 현재 입력·인물·장소·사건과 관련된 항목만 한도 내에서 선별한다.
- 사용자가 특정 사실을 명시적으로 조회하면 일반 선별 한도를 넘어 필요한 항목을 우선 포함한다.

## 10. 공개 정보·스포일러 보호

`cortex/disclosure.json`은 공개 별칭과 비밀 사실을 분리한다.

```json
{
  "format": "CORTEX_DISCLOSURE_V1",
  "entities": [
    {
      "id": "NPC-FUTURE-SEOLA",
      "publicName": "가면 쓴 여자",
      "protectedNames": ["윤설아"],
      "revealCondition": {"kind": "event_completed", "eventId": "EVENT-REVEAL"}
    }
  ],
  "facts": [
    {
      "id": "FACT-IDENTITY",
      "mode": "forbidden",
      "allowedSummary": "정체를 알 수 없는 인물이다",
      "revealCondition": {"kind": "event_completed", "eventId": "EVENT-REVEAL"}
    }
  ]
}
```

- 진명·비밀 세력·미래 사건·숨은 종결 조건은 공개 Writer Context에 포함하지 않는다.
- 공개 별칭과 Runtime 내부 고유 ID를 동일시하지 않는다.
- 프롬프트에는 세션별 공개 참조 ID를 사용한다.
- 로그·내보내기·오류 메시지에도 보호 문자열을 남기지 않는다.
- 유니코드 결합문자·제로폭 문자·문장부호 삽입으로 보호 검사를 우회할 수 없어야 한다.
- 공개 조건을 충족한 뒤에만 해당 사실의 공개 수준을 갱신한다.

## 11. 인물·세력·관계 HUD

Native Pack은 기존 `status_relationship_display_v1`을 그대로 지원하며 다음 표현을 조합할 수 있다.

- 짧은 관계 문장
- 관계 스탯과 게이지
- 이모지·기호
- 공개·직접 만난 뒤·조건부 공개

관계 원장과 관계 HUD는 구분한다. 원장은 실제 상태이고, HUD는 현재 공개 가능한 투영이다. Instant Profile에서는 미리 정해진 정사 관계를 강제하지 않고 관측된 상호작용으로만 관계 원장을 갱신한다.

## 12. 이미지·표지·미디어

### 12.1 기존 자산 계약 보존

- Media Asset Manifest V2
- Asset-Once V1
- SHA-256 및 `byteLength` 검증
- 작품 표지
- 인물 프로필·장면 이미지
- 이미지 트리거와 1회성 자산
- Studio 편집 원본의 Data URL 복원

### 12.2 최초 등장 정책

Native Pack은 다음 정책을 명시한다.

```json
{
  "firstAppearance": {
    "enabled": true,
    "importance": ["major", "supporting"],
    "mode": "package_then_generate",
    "generateWhenMissing": true,
    "oncePerCharacter": true,
    "defaultResolution": "480p"
  }
}
```

내장 이미지가 있으면 그것을 우선 사용하고, 없으면 중요 인물의 첫 등장 확정 뒤 AI 이미지를 생성한다. 비공개 진명은 이미지 프롬프트나 캡션에도 노출하지 않는다.

## 13. Legacy Compatibility Adapter

Adapter 출력에는 호환 보고서를 포함한다.

```json
{
  "sourceFormat": "RELAY_NOVEL_PACKAGE_1_5",
  "runtimeProfile": "instant_story",
  "mappedFeatures": [],
  "defaultedFeatures": [],
  "disabledOptionalFeatures": [],
  "warnings": [],
  "lossless": true
}
```

### 13.1 변환 우선순위

1. 기존 명시 필드를 그대로 매핑한다.
2. 기존 계약에 선언된 별칭·동의 표현·기능 협상을 사용한다.
3. 안전한 결정적 기본값만 적용한다.
4. 비밀 정보나 서사 조건을 추측하지 않는다.
5. 필수 의미가 보존되지 않으면 `lossless: false`로 실행하지 말고 명확히 거부한다.

### 13.2 구형 패키지에서 사용할 수 없는 Native 정보

구형 Pack에 흡수 동기·종결 의미·정사 기억 대상이 명시되지 않았더라도 Cortex는 기존 인물 설정·관계·사건 위험·다음 비트를 근거로 제한적으로 추출할 수 있다. 이 결과는 `derived`로 표시하며 원본 저작 정보처럼 저장하지 않는다.

## 14. Studio 책임

Studio는 다음을 담당한다.

- Native 문서 작성 UI와 JSON 내보내기
- 모든 고유 ID와 상호 참조 검증
- 공개 정보와 GM 전용 정보의 분리
- 사건 시간 범위 및 장소 전이 검증
- 필수 정사와 선호 연출의 구분
- 종결 기능의 의미·동의 표현·근거 앵커 입력
- 인물 동기·관계·위험·허용 흡수 장치 입력
- 변형 정사 기억 대상과 충돌 키 정의
- Asset-Once 장부·표지·인물 이미지 무결성 검증
- `studio/project-snapshot.json` 포함
- 파생 인덱스의 원본 해시 기록
- Native/Legacy 골든 패키지 출력 테스트

Studio는 최종 본문을 판정하거나 세션 정사 원장을 직접 갱신하지 않는다.

## 15. Cortex/Nexus 책임

Cortex/Nexus는 다음을 담당한다.

- Native Loader 및 Legacy Adapter
- 필수 기능 협상과 거부·경고 처리
- 패키지 로드 시 Runtime Model 컴파일
- 매 턴 관련 컨텍스트의 로컬 선별
- 빠른 본문 스트리밍과 공개 문장 게이트
- 시간·장소·상태의 원자적 확정
- 플레이어 이탈의 개연성 있는 흡수
- 의미 기반 종결 판정과 임시 종결 비트
- 변형 정사 추출·충돌 해결·장기 기억
- 스포일러 방지와 공개 별칭 투영
- 이미지 최초 등장 정책과 관계 HUD 표시
- 실패 시 본문·상태·기억의 일괄 롤백
- 호환 보고서와 진단 로그 제공

Cortex는 패키지에 없는 진명·동기·사건·관계를 새 정사로 발명하지 않는다.

## 16. 성능 계약

- 변형 기억을 위해 본문 전 별도 모델 호출을 추가하지 않는다.
- 패키지 컴파일 결과는 패키지 SHA-256과 Cortex 계약 버전으로 캐시한다.
- 매 턴 기억 선별은 동기식 로컬 연산으로 제한하고 문자·항목 예산을 둔다.
- Writer Context에는 현재 사건, 현재 인물, 관련 기억, 활성 공개 사실만 포함한다.
- 이미지·대용량 원본·Studio snapshot은 Writer Context에 넣지 않는다.
- 정사 sidecar는 본문과 같은 응답의 뒤쪽에서 처리한다.
- 패키지 분석 시간과 매 턴 TTFT를 별도로 계측한다.

권장 계측 항목:

```text
packageParseMs
runtimeCompileMs
memorySelectMs
writerRequestMs
ttftMs
visibleCommitMs
canonExtractMs
canonApplyMs
```

## 17. 실패·복구 정책

| 상황 | 처리 |
| --- | --- |
| 미지원 필수 기능 | 패키지 거부 및 기능 ID 표시 |
| 선택 기능 누락 | 경고 후 안전한 기능만 실행 |
| 파생 인덱스 해시 불일치 | 원본에서 재컴파일하거나 선택 기능 비활성화 |
| 보호 정보 유출 | 해당 본문 폐기, 상태 미저장 |
| 정사 sidecar 손상 | 결정적 추출 시도 후 불가하면 턴 전체 롤백 |
| 시간·장소 정사 이탈 | 사건 경계 안으로 재집필 또는 안전 중단 |
| 의미상 종결 충족 | 표현 차이와 관계없이 통과 |
| 실제 종결 미충족 | 임시 종결 비트 1개 추가 |
| 재집필도 실패 | 사유, 실패 초안, 계획 후 집필 버튼과 재입력 안내 유지 |

## 18. 버전 정책

- `packageFormat`의 세대 변경은 깨지는 변경에서만 수행한다.
- 선택 필드 추가는 같은 Native Pack V1 안에서 허용한다.
- 필수 필드의 의미를 바꾸지 않는다.
- Cortex가 새 기능을 요구하면 새로운 `requiredFeatures` ID로 협상한다.
- Studio는 자신이 지원하지 않는 필수 기능이 있는 프로젝트를 손실 내보내기하지 않는다.
- Nexus는 미지원 필수 기능을 무시하고 실행하지 않는다.

## 19. 필수 골든 테스트

### 19.1 Native Pack

- `canonical_story` 정상 전개
- `instant_story` 자유 전개
- 시간 도약 입력의 사건 경계 중단
- 비타임루프 작품의 시간 역행 차단
- 동기·관계 기반 이탈 흡수
- 최후 수단 장치와 narrative debt
- 자연스러운 동의 표현의 종결 인정
- 임시 종결 비트 1회
- 약속·관계·부상·소지품·파괴·NPC 판단·여파 기억
- 비밀 진명·세력·미래 사건 비노출
- 내장 이미지 우선 및 누락 이미지 자동 생성
- 관계 HUD 공개 조건
- 저장·되돌리기·내보내기 후 정사 원장 보존

### 19.2 Legacy Pack

- ScenarioPack 1.4
- ScenarioPack 1.5
- Instant Story Runtime v1
- Instant Story Runtime v2 전용 기성학원 데모
- 관계 HUD 포함 Pack
- Asset-Once/대용량 이미지 Pack
- Studio project snapshot 포함 Pack
- 미지원 필수 기능 거부
- 파생 캐시 손상 시 안전 폴백 또는 거부

## 20. 단계별 구현 순서

### 단계 A · 계약과 중간 모델

1. 본 문서 확정
2. JSON Schema 작성
3. `CORTEX_RUNTIME_MODEL_V1` 타입과 검증기 구현
4. 기능 협상 장부 구현

### 단계 B · Legacy Adapter

1. ScenarioPack 1.4 매핑
2. ScenarioPack 1.5 매핑
3. Instant Story Runtime v1/v2 의미 보존
4. 이미지·관계 HUD·Studio snapshot 연결
5. 호환 보고서와 골든 테스트

### 단계 C · Native Loader

1. Native ZIP 불러오기
2. 정사·시간·공개 정보·기억 계약 컴파일
3. Cortex Writer Context 연결
4. 정사 sidecar와 상태 원자 확정

### 단계 D · Studio 제작 지원

1. Runtime Profile 선택 UI
2. 사건 강도·종결 의미 편집 UI
3. 흡수 앵커·변형 기억·공개 조건 편집 UI
4. Native Pack 내보내기·다시 불러오기
5. 실시간 계약 검증과 골든 Pack 생성

### 단계 E · 통합 검증

1. 기존 작품 무회귀
2. Native Pack 품질·속도 비교
3. 모바일·데스크톱·멀티플레이 저장 검증
4. Relay Core 등록·Hub 다운로드·서재 설치 검증

## 21. Studio팀 전달 사항

Studio팀은 우선 단계 A와 단계 D의 제작 UI·내보내기 계약을 검토한다. 구현 중 필드명을 임의 변경하지 말고, 변경 제안은 이 계약의 버전을 올려 Nexus/Cortex팀과 함께 확정한다.

첫 Native 골든 작품은 다음 두 종류로 준비한다.

1. **지능형 정사 전개 골든 Pack**: 시간 제한 사건, 이탈 흡수, 의미 기반 종결, 비밀 진명, 내장 이미지, 관계 HUD 포함
2. **Instant Story 골든 Pack**: 고정 사건 순서 없이 관계·소지품·여파 기억, 최초 등장 이미지, 공개 조건 포함

두 골든 Pack 모두 동일한 Studio 프로젝트를 다시 불러올 수 있는 `studio/project-snapshot.json`을 포함해야 한다.

---

이 계약에서 Cortex Native Pack은 미래 표준이고 Legacy Adapter는 기존 작품의 자산과 동작을 지키는 영구 호환 계층이다. 신규 Pack의 품질 상한을 구형 구조에 맞춰 낮추지 않으며, 구형 Pack의 원래 의미를 Native 규칙으로 덮어쓰지도 않는다.
