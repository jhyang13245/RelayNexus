# Studio → Dancheong Cortex 인계 · Nexus 1.13.0

2026-09-11. 공식 Cortex 기반 버전은 1.42.0이며, 이 릴리즈는 **단청 확장 revision 1.0.0**을 추가한다. 공식 독립 엔진 전체가 새 버전이 되었다는 뜻이 아니다. 공개 배포 상태는 Sites의 성공 응답을 기준으로 확인한다.

## Studio에서 식별할 계약

`GET /api/cortex/capabilities`가 기반 버전과 확장 revision, 지원 범위, 미지원 범위를 반환한다. Studio 2.2.0의 `ENGINE_UPDATE_REQUIRED`는 종전 엔진 해시를 대상으로 작성된 보고서다. Studio 팀은 새 단청 소스 ZIP과 이 계약을 기준으로 다시 시험한 뒤 해당 제한을 해제해야 한다. 본 작업은 Studio 저장소나 배포를 변경하지 않았다.

엔진 재구성은 `node scripts/vendor-cortex.mjs`를 사용한다. 이제 `parts/00~10.part`만 연결하면 확장 모듈이 빠진다. `vendor/cortex/manifest.json`의 assembly/extensions 목록과 생성 HTML 해시를 함께 검증해야 한다.

### Instant V2

- `rules/instant_story_runtime.json` 및 `runtime/{context_index,keyword_index,media_lookup,ending_schedule}.json`을 읽는다. `project.json.instantStory`를 원본으로 사용하며 편집 스냅샷은 실행 권위가 아니다.
- 실제 ZIP 가져오기는 Studio의 stable-JSON SHA-256을 검증한다. 파생 파일의 버전·원본 해시가 다르면 해당 파일만 프로젝트 원본으로 재구성한다. 원본 자체가 변조되었거나 실행 파일과 원본이 충돌하면 거부한다.
- 미지원 requiredFeatures, 사건/루트/루프/배우 혼합, 비어 있지 않은 전용 media lookup, 사전 지정 endingIds, loopEnabled는 명시적으로 거부한다. 현재 Studio 2.2.0은 빈 media lookup/endingIds를 내보낸다. 일반 패키지 인물 이미지 자산은 기존 저장소가 보존한다.
- 핵심 프롬프트·프리셋·시작 프로필·예시·공개 인물·세계관·불변식·문체, 입력 기반 최대 3개 키워드, 수치 규칙과 구간, 최근 원문과 제한된 기억 인용을 전용 컨텍스트에 반영한다. 글자 예산 초과 시 기억/오래된 원문/예시 순서로 줄이고, 핵심 설정을 몰래 잘라내지 않는다.
- Studio 2.2의 `style.cortexAuthoringGuidance`에는 정사 3비트 지침이 남아 있다. 원본에는 보존하지만 Instant 집필 컨텍스트에서는 이 **정사 전용 키만 제외**한다. 사용자 문체 규칙은 유지한다. Studio도 Instant 내보내기에서 해당 지침을 분리하는 것이 좋다.
- 시작 프로필은 첫 턴 전 상태 패널에서 선택 가능하다. 프로필은 산문/상황/추천을 전달하며 별도 시각 필드가 없으므로 초기 시각은 opening의 명시 값을 유지한다.
- 빈 UI 장면 표시는 존재하지만 실제 사건 그래프는 비어 있으며 `runInstantTurnV1`에서 정사 비트/FSM/3비트 종결/봉인을 실행하지 않는다.
- 기존 `/api/simulate/stream`에 `cortexInstant: true`를 구분자로 추가했다. 업스트림은 스트리밍하지만 JSON 전체 구조·인용 근거·비공개 보호를 검증한 뒤 공개 SSE로 전달한다. 원시 토큰은 공개하지 않는다. 따라서 첫 표시까지 완성 응답을 기다리는 **보수적 검증 방식**이며 토큰 즉시 표시와 같은 지연 특성을 약속하지 않는다.
- 공개 이벤트는 ack → narration_commit → turn_sidecar → done. sidecar는 `runtime=cortex_instant_v1`, turnId, result, nextState, 사용량을 포함한다. 서버와 브라우저가 같은 reducer로 상태를 재검증한다. done 누락/손상/공개 보호 실패는 본문·상태를 모두 취소한다.
- 수치·관계 변화 및 기억은 해당 턴 산문의 정확한 인용을 요구하고 수치를 범위 안으로 제한한다. 턴 ID 중복 반영을 막는다. 공개/대면/조건부 관계를 필터링하며 조건부 공개는 별도 보호 검사 후 활성화한다.
- 엔딩은 minimumTurn 이후 checkInterval에 해당하는 턴에서만 검사한다. 공개 산문 근거가 있는 종료만 허용하며 이후 입력을 종료한다. 비공개 보호어가 있거나 가족 호칭/엔딩/조건부 관계 공개를 검사할 때 별도 제한된 보호 호출이 추가될 수 있다.
- 새 진행 상태는 canonicalSession↔scenario, 기기 저장, 공통 백업, 재시작, 되감기에 대칭 보존된다. 종전 저장본은 몰래 재해석하지 않는다. 전용 설정이 이미 유실된 구형 세션을 새 패키지 없이 복구했다고 주장하지 않는다.

현재 범위 밖: 멀티플레이 Instant, 루트/루프 혼합, 전용 media lookup 자동 실행, 외부 조사 작업의 자동 백그라운드 생성, 임의의 새 인물 자동 등록. 엔진에 이미 확정된 정체 공개 원장은 존중하지만, 이 릴리즈가 모든 사용자 정의 정체 공개 predicate의 새 해석기를 제공하는 것은 아니다. 일반 상태창의 모든 자유 필드를 새 수치 규칙으로 자동 변환하지 않는다. Instant 전용 수치는 statRules, 관계 표시는 relationshipDisplay를 사용한다.

### 자연어 발생조건

`cortexDesign.occurrenceEnabled=true`일 때 새 사건의 첫 입력 전에 `occurrence`를 이미 공개된 상태로 판정한다. TRUE는 진입, FALSE는 후속 후보로 이동한다. UNKNOWN/통신 오류는 입력과 기존 상태를 보존하고 보류한다. 아직 실행하지 않은 사용자 입력이나 미래 사건 설명을 근거로 쓰지 않는다. 거짓 사건은 완료·봉인·점수·비트를 받지 않는다. 판정 기록은 저장/복원된다. 후보가 모두 거짓이면 명시적으로 중단하며 허구의 엔딩을 만들지 않는다.

### 사용자 보고 오류

- 공개 성별·나이·가족관계를 작가 및 보호 검사 입력으로 전달한다. 가족 호칭이 있는 문단은 FIXED_FACT 검사를 요청한다. 이미 쓰인 오호칭을 패키지 성별 변경의 근거로 삼지 않는다. 기존 공개 본문을 일괄 치환하지 않는다.
- 별도 추천 메타데이터가 누락돼도 끝의 명백한 1/2/3 행동 메뉴를 스트림에서 격리한다. 과거 원문을 다음 집필/판정에 읽을 때는 복사본에서 추천 메뉴를 제거한다. 일반 숫자 목록·인용문은 보존한다.
- 메인 Studio 초안 API의 `uniqueItems`를 제거하고 서버에서 중복을 정리한다. 정사/Instant 두 요청 모드의 strict schema 회귀 검사를 추가했다.

## 검증과 인계

`tests/fixtures/studio-2.2-instant.zip`은 실제 Studio 2.2.0 exportScenarioPack으로 만든 합성 패키지다. 사용자 작품/백업/키가 아니다. 선택적으로 인접 Studio 체크아웃이 있을 때 `scripts/generate-studio-instant-fixture.mts`로 재생성할 수 있다.

`tests/cortex-instant-stream.test.ts`는 원본 ZIP, 해시/캐시, 전용 상태, 키워드/수치/엔딩, 중단 SSE, 전체 앱 실행·재시작·되감기, 발생조건 선택, 공개 성별, 추천 메뉴 보존 경계, 관계 공개/중복 상태를 검증한다. 기존 Cortex 공식 원본은 별도 해시로 고정하며 기존 정사 실행의 결과 동등성 회귀 시험을 유지했다.

실제 브라우저에서 합성 세션 가져오기, 데스크톱/390px 모바일 수치·관계 패널, 시작 프로필 전환과 오프닝 갱신을 확인했다. 테스트의 AI 응답은 **모킹**이다. 실제 유료 모델 집필, 작품별 조건 해석/서사 품질, 실제 iPhone Safari 회전은 별도 품질 시험이다.

전체 TypeScript 검사는 기존 build/work 사본과 기존 앱 타입 오류를 포함해 통과하지 않는다. 관련 회귀 시험과 배포 Worker 빌드 결과를 구분한다. 테스트 실패를 숨기기 위해 전체 타입 검사를 비활성화하거나 기존 오류를 다른 범위까지 무단 수정하지 않았다.

최종 자동 검사: 단위/계약 557개, 렌더링·기존 커널 58개, Cortex 호스트 42개 통과(선택적 개인 백업 시험 1개 제외), 20턴 로그 재생 검사 통과. 배포용 Worker 빌드와 기존 DB/R2 바인딩 검증 통과. 새 작업 파일의 타입 오류는 별도로 제거했다.
