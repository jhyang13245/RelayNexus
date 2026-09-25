# 단청 라이트노벨

너름에 공개된 단청 작품을 기존 Cortex 1.42.0 계약 그대로 실행하는 별도 공개 사이트입니다. 화면은 비주얼노벨 형식으로 표시합니다. 장면 이미지는 이야기의 배경으로 쓰고, 화자 주석을 이용해 대사와 서술을 페이지로 나눕니다.

## 공유 시스템

- **너름**: 공개 작품 목록, 표지, CortexPack 파일을 기존 Relay Core에서 읽습니다. 기존 단청 사이트가 숨기는 레거시 기성학원 데모도 이 목록에서 제외합니다.
- **지음**: 상단 지음 링크가 기존 편집기를 엽니다. 지음이 출간한 패키지를 같은 Cortex 런타임 계약으로 실행하며, 편집기 자체를 별도 복제하지 않습니다.
- **Cortex**: 원본 HTML을 SHA-256으로 검증한 뒤 비주얼노벨 셸을 주입합니다. 집필, 정사 판정, 패키지 해석 로직은 원본을 사용합니다.

## 실행

Node.js 22.13 이상에서 다음 명령으로 실행합니다. ZIP을 받은 경우 먼저 압축을 풀고 `package.json`이 있는 `dancheong-light-novel` 폴더에서 실행하세요.

```sh
npm ci
npm run dev
```

`http://localhost:5173/`이 `/cortex.html`로 이동합니다. 배포 빌드는 `npm run build`, 기본 검사는 `npm test`입니다. API 키는 실행한 사이트의 설정 화면에서 직접 입력합니다.

## 전체 소스 ZIP

[최신 전체 소스 다운로드](https://dancheong-light-novel.juno12345.chatgpt.site/downloads/dancheong-light-novel-source.zip)

v12 소스에는 원본 Cortex, VN 화면과 연출·인물·스트리밍 모듈, API 라우트, 설정·빌드 파일, 의존성 잠금 파일, 테스트와 변경 문서가 포함됩니다. `SOURCE-MANIFEST.json`에서 파일별 SHA-256을 확인할 수 있습니다. 너름·지음은 위의 공유 서비스를 사용하므로 해당 서비스의 별도 서버 소스나 작품 패키지는 이 ZIP에 포함되지 않습니다. 사용자 API 키, 기기별 저장 데이터, 설치된 `node_modules`는 포함하지 않습니다.

`npm run source:zip`으로 현재 소스를 다시 묶을 수 있으며, `npm run build`도 다운로드 ZIP을 자동 생성합니다. 결과는 `public/downloads/dancheong-light-novel-source.zip`입니다. Git 저장소 없이 압축을 푼 소스만으로도 실행·빌드·ZIP 재생성이 가능합니다. 로컬 개발 중 다운로드 링크를 사용하려면 먼저 `npm run source:zip`을 실행하세요.

작품별 진행은 방문자의 브라우저 IndexedDB에 저장됩니다. 다른 기기 또는 기존 단청 사이트의 저장 데이터가 자동 동기화되지는 않습니다.

방문자가 입력한 제공사별 키는 이 기기의 브라우저에 암호화해 보관하며 서버에는 저장하지 않습니다. 본문은 OpenAI 또는 OpenCode Go, 이미지는 OpenAI 또는 Nano Banana 2를 선택할 수 있습니다. 요청은 같은 출처의 제공사별 프록시를 거칩니다. 같은 장소의 배경과 이미 만든 인물·표정은 재사용합니다. 새 본문·이미지 요청에는 선택한 제공사의 사용료가 발생할 수 있고, 사용량·비용 탭에서 추정치를 확인할 수 있습니다. 이미지 생성 실패 시 기존 그림을 유지하고 재시도할 수 있습니다.

v7은 NVL 누적 본문, 자동 읽기·읽은 부분 건너뛰기, 읽기 위치 복원, 서술에 따른 구도·전환을 제공합니다. [월희 리메이크 비교·구현·남은 차이](docs/v7-tsukihime-comparison.md)를 참고하세요.

v8은 첫 문단부터 스트리밍으로 표시하고, 후속 문단·턴 확정 시 읽기 위치를 유지합니다. 도입부 `openingCharacters` 형식의 인물 누락과 배경 대기로 인물이 숨겨지는 문제도 수정했습니다. [수정 원인과 검증](docs/v8-streaming-and-cast.md).

v12는 최초 로딩 때 원본 Cortex UI가 노출되는 문제를 수정하고 플레이 화면에 메인화면 복귀 버튼과 전체 소스 다운로드를 추가했습니다. [수정·검증 내용](docs/v12-startup-and-home.md).

## 구성

- `vendor/Cortex_v1.42.0.html`: 검증 대상인 Cortex 원본.
- `scripts/build-cortex.mjs`: 원본을 검증하고 `public/cortex.html`을 만듭니다.
- `public/vn.js`, `public/vn.css`, `public/vn-core.mjs`: 작품 선택, 페이지 진행, 배경 연출, 로컬 저장.
- `app/api/catalog`, `app/api/work`: 너름 공개 데이터의 고정 경로 프록시.
- `app/api/openai`: 방문자의 키로 요청하는 제한된 OpenAI API 프록시.

실제 유료 OpenAI 호출은 배포 검사에서 수행하지 않습니다. API 키가 없는 상태의 읽기, 작품 가져오기, 화면 진행, 프록시 입력 검사를 수행합니다.
