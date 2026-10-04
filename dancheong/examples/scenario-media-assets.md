# ScenarioPack 이미지 자산 규격

캐릭터 이미지와 장면 이미지는 ZIP 안에 함께 넣을 수 있다. 이미지 본체는 브라우저의 전용 저장소에 보관되며 OpenAI API 요청에는 자산 ID와 태그만 전달된다. 따라서 패키지 이미지를 표시할 때 이미지 생성 API 비용은 들지 않는다.

## 권장 ZIP 구조

```text
ScenarioPack.zip
├── manifest.json
├── project.json
└── assets
    ├── manifest.json
    ├── characters
    │   ├── NPC_LILIA
    │   │   ├── normal.webp
    │   │   └── excited.webp
    │   └── NPC_LENA
    │       └── cold.webp
    └── scenes
        └── academy-hall.webp
```

PNG, JPEG, WebP, GIF, AVIF를 지원한다. SVG는 보안상 불러오지 않는다. 개별 파일은 최대 8MB, 전체 이미지는 최대 60MB, 자산은 최대 120개다.

## `assets/manifest.json`

```json
{
  "version": 1,
  "assets": [
    {
      "id": "lilia-excited",
      "path": "assets/characters/NPC_LILIA/excited.webp",
      "kind": "character",
      "characterId": "NPC_LILIA",
      "characterName": "릴리아",
      "label": "활기찬 인사",
      "emotionTags": ["bright", "excited", "happy"],
      "sceneTags": ["entrance", "hallway", "greeting"],
      "placement": "after_block",
      "priority": 90,
      "alt": "복도에서 밝게 인사하는 릴리아",
      "caption": "릴리아 · 활기찬 인사"
    },
    {
      "id": "lena-cold",
      "path": "assets/characters/NPC_LENA/cold.webp",
      "kind": "character",
      "characterId": "NPC_LENA",
      "characterName": "레나",
      "label": "차가운 시선",
      "emotionTags": ["cold", "annoyed"],
      "sceneTags": ["hallway", "conflict"],
      "placement": "after_block",
      "priority": 80,
      "alt": "차갑게 시선을 돌리는 레나",
      "caption": "레나 · 차가운 시선"
    }
  ]
}
```

`placement`는 연결된 블록 바로 뒤에 표시하는 `after_block`과 턴의 마지막에 표시하는 `turn_end` 중 하나다. `priority`가 높을수록 같은 인물과 감정에 맞는 후보 중 먼저 선택된다.

## 자동 인식

이미지 매니페스트가 없어도 아래 폴더의 이미지는 자동으로 등록된다.

```text
assets/characters/{characterId 또는 캐릭터 이름}/{감정 태그}.webp
assets/scenes/{장면 태그}.webp
```

예를 들어 `assets/characters/NPC_LILIA/bright.webp`는 릴리아의 `bright` 감정 이미지로 인식한다. 다만 정확한 장면 선택과 접근성 문구를 위해 패키지 생성기에서는 매니페스트 생성을 권장한다.

## 장면 선택 원칙

- 인물이 처음 강조되어 등장할 때
- 표정이나 감정이 분명히 바뀔 때
- 대사 뒤에 시각적인 여운이 필요할 때
- 한 턴에서 동일 이미지를 반복하지 않도록 할 때

모델은 이야기 블록에 `mediaAssetId`만 지정한다. 실제 이미지 파일은 서버나 OpenAI로 전송되지 않고 사용자의 브라우저에서 해당 위치에 삽입된다.
