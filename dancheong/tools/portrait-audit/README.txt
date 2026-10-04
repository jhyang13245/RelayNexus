단청 v1.25.9 입상 비율 검증실

목적
운영 보정 코드를 복사/재작성하지 않고 실제 모듈과 CSS를 가져와 비교한다.
배포 도구가 아니며 게임 세션, API 키, 기존 입상을 읽거나 변경하지 않는다.

실행
프로젝트 루트에서:
  node tools/portrait-audit/server.mjs
  http://127.0.0.1:5442/
이미 저장한 보고서:
  http://127.0.0.1:5442/data/report.html

전체 측정 실행 버튼: 35명, 7조건, 3뷰포트, 1/2/3인 배치.
선택 비교 보기: 원본과 선택 조건을 나란히 확인.
결과를 outputs/portrait-audit-20261003/results/에 저장한다.
재실행하면 해당 결과 파일을 덮어쓰므로 이전 결과가 필요하면 폴더를 먼저 복사한다.
서버는 루프백 주소에만 바인딩하며 외부 API 중계 기능이 없다.

측정 후 집계
  node tools/portrait-audit/finish-review.mjs
  node tools/portrait-audit/summarize.mjs
  node tools/portrait-audit/verify-results.mjs

입력 수집
collect.mjs는 공개 너름 목록과 작품 ZIP의 읽기 전용 다운로드용이다.
현재 수집 결과가 있으므로 재실행할 필요 없다.
extract.mjs는 수집한 ZIP의 실제 내장 그림 및 공개 프로필 필드를 추출한다.
추출을 재실행하면 manifest를 덮어쓰므로 생성 목록을 먼저 보존해야 한다.
생성 그림은 이 대화의 내장 imagegen 도구로만 만들었다.
외부 이미지 API 호출 코드/키가 없고, 모델명과 추론 설정은 도구에서 확인되지 않는다.
generation-log.json, generation-batch-*.json, manifest.json에 출처를 기록했다.

실제 가져오는 코드
public/cortex-vn-camera.mjs
public/vn-runtime/vn-sprite.mjs, vn-stature.mjs, vn-chroma.mjs
public/vn-runtime/vn-stage.mjs, vn-framing.mjs
운영 runtime manifest의 CSS와 public/cortex-vn-layout.css
로컬 얼굴 감지 모델은 기존 독립 사이트의 vn-vision/1.0.1에서 복사한 자산이다.

제약
공개 5패키지: 등록 49행, 중복 제외 46명, 내장 참조 보유 35명.
50명 비교 중 15명분 미실행. 김서연은 164cm 수치 검사만 실행.
캐릭터 생성 결과 35명 외에 크롭/해상도 시험을 새 인물로 계산하지 않는다.
iframe 크기는 모바일 브라우저 하드웨어/PWA safe-area 재현이 아니다.
PNG 비교판은 실제 DOM 위치를 사용한 캔버스 출력이며 완전한 UI 스크린샷은 아니다.
실제 브라우저 캡처는 파일명 browser-*.png로 구분한다.
기하 검사 통과와 시각적 품질 승인 여부는 별개다.
visual-review.txt에 직접 확인한 실패와 검토 범위를 기록했다.

전신 보정 수정본 재검증 (원래 기준 결과 보존)
PowerShell에서:
  $env:PORTRAIT_AUDIT_PORT='5443'
  $env:PORTRAIT_AUDIT_RESULTS='outputs/portrait-fix-20261003/results'
  node tools/portrait-audit/server.mjs
  http://127.0.0.1:5443/
측정이 끝난 뒤:
  node tools/portrait-audit/report-body-fix.mjs
새 결과는 별도 폴더에 저장한다. 원래 finish-review/summarize/verify-results는
수정 전 검증 전용이며 이번 수정 결과를 집계하는 용도로 실행하지 않는다.
실제 runtime 소스는 vendor/visual-novel/nexus-*.mjs 및
public/cortex-vn-camera.mjs에서 관리하며 port-visual-novel.mjs로 재생성한다.
신체 좌표는 얼굴·어깨·골반을 포함한다. 몸통 측정 실패는 별도로 기록한다.

크롭 및 가림 대응 v1.25.10
  $env:PORTRAIT_AUDIT_PORT='5444'
  $env:PORTRAIT_AUDIT_RESULTS='outputs/portrait-crop-fix-20261003/results'
  node tools/portrait-audit/server.mjs
전체 측정 완료 후 node tools/portrait-audit/report-crop-fix.mjs 실행.
35명 × 8조건 × 3화면 × 단독/2인/3인 = 대상 2,520건, 동반 인물 포함 5,040행.
크롭/가림 조건에는 같은 인물의 생성 원본을 displaySprite의 reference로 제공한다.
기본 입상으로 돌아간 경우 fallback을 기록하며, 이를 원본 복원 생성으로 세지 않는다.
가려진 변형의 눈/입 애니메이션이 보호 경로를 우회하지 않는지도 확인한다.
first-run-measurements.json에는 중간 검증 실패를 보존한다.
