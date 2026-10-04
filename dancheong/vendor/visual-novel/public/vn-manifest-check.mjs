/**
 * vn-manifest-check.mjs
 * 순수 검증기: 입력 정규화 없이 검사만 수행한다.
 * 입력은 사전 정규화된 데이터로 가정하되, 비교 시 내부에서 정규화한다.
 * 입력 변형 없음, 외부 의존성 없음.
 */

/**
 * @typedef {{ id: string, name?: string, aliases?: string[], allowFirstAppearance?: boolean, hasPortrait?: boolean, appearance?: string }} CharacterInput
 * @typedef {{ characterId: string, aliases?: string[] }} ParticipantInput
 * @typedef {{ id: string, participants?: ParticipantInput[] }} EventInput
 * @typedef {{ characters?: CharacterInput[], events?: EventInput[] }} ManifestInput
 */

function normLabel(value) {
  if (typeof value !== 'string') return '';
  // NFKC -> trim -> 공백 축소 -> 소문자
  return value.normalize('NFKC').trim().replace(/\s+/g, ' ').toLowerCase();
}

function asList(value) {
  return Array.isArray(value) ? value : [];
}

function charIdOf(c) {
  return c != null && typeof c.id === 'string' ? c.id : '';
}

function eventIdOf(e) {
  return e != null && typeof e.id === 'string' ? e.id : '';
}

function participantIdOf(p) {
  return p != null && typeof p.characterId === 'string' ? p.characterId : '';
}

function sortedUnique(ids) {
  return Array.from(new Set(ids)).sort();
}

/**
 * 작업물 인물/이벤트 선언을 검사한다.
 * @param {ManifestInput} manifest
 * @returns {{ issues: Array<{ code: string, severity: string, characterIds: string[], eventId: string, message: string }>, counts: { characters: number, events: number } }}
 */
export function checkWorkManifest(manifest) {
  const rawCharacters = manifest != null && Array.isArray(manifest.characters)
    ? manifest.characters
    : [];
  const rawEvents = manifest != null && Array.isArray(manifest.events)
    ? manifest.events
    : [];

  const issues = [];
  const seen = new Set();

  function pushIssue(issue) {
    const characterIds = Array.isArray(issue.characterIds)
      ? sortedUnique(issue.characterIds.filter((v) => typeof v === 'string' && v !== ''))
      : [];
    const eventId = typeof issue.eventId === 'string' ? issue.eventId : '';
    const key = [
      issue.code,
      issue.severity,
      characterIds.join(','),
      eventId,
      issue.message,
    ].join('\u0000');
    if (seen.has(key)) return;
    seen.add(key);
    issues.push({
      code: issue.code,
      severity: issue.severity,
      characterIds,
      eventId,
      message: issue.message,
    });
  }

  // 등록 인물 ID 집합 (빈 ID 제외)
  const knownIds = new Set();
  for (const c of rawCharacters) {
    const id = charIdOf(c);
    if (id !== '') knownIds.add(id);
  }

  // 1) 중복 인물 ID
  const idCount = new Map();
  for (const c of rawCharacters) {
    const id = charIdOf(c);
    if (id === '') continue;
    idCount.set(id, (idCount.get(id) ?? 0) + 1);
  }
  for (const [id, n] of idCount) {
    if (n > 1) {
      pushIssue({
        code: 'duplicate-id',
        severity: 'error',
        characterIds: [id],
        eventId: '',
        message: `중복된 인물 ID "${id}".`,
      });
    }
  }

  // 2) 전역 이름/별칭 맵: 정규화 라벨 -> 인물 ID 집합
  const globalMap = new Map();
  for (const c of rawCharacters) {
    const id = charIdOf(c);
    if (id === '') continue;
    const labels = [];
    if (c != null && typeof c.name === 'string') labels.push(c.name);
    for (const a of asList(c != null ? c.aliases : [])) labels.push(a);
    const perChar = new Set();
    for (const label of labels) {
      const n = normLabel(label);
      if (n === '') continue;
      perChar.add(n);
    }
    for (const n of perChar) {
      if (!globalMap.has(n)) globalMap.set(n, new Set());
      globalMap.get(n).add(id);
    }
  }

  for (const [label, idSet] of globalMap) {
    if (idSet.size > 1) {
      pushIssue({
        code: 'ambiguous-alias',
        severity: 'warning',
        characterIds: sortedUnique(idSet),
        eventId: '',
        message: `이름/별칭 "${label}"이(가) 여러 인물에 등록됨.`,
      });
    }
  }

  // 3) 첫 등장 허용인데 공개 이름 없음
  for (const c of rawCharacters) {
    if (c == null || c.allowFirstAppearance !== true) continue;
    const id = charIdOf(c);
    const nameNorm = normLabel(c.name);
    let hasAlias = false;
    for (const a of asList(c.aliases)) {
      if (normLabel(a) !== '') {
        hasAlias = true;
        break;
      }
    }
    if (nameNorm === '' && !hasAlias) {
      pushIssue({
        code: 'missing-public-name',
        severity: 'warning',
        characterIds: id !== '' ? [id] : [],
        eventId: '',
        message: '첫 등장 허용인데 공개 이름/별칭 없음.',
      });
    }
  }

  // 4) 초상 없고 외형 서술 없음
  for (const c of rawCharacters) {
    if (c == null || c.hasPortrait !== false) continue;
    const appearance = typeof c.appearance === 'string' ? c.appearance.trim() : '';
    if (appearance === '') {
      const id = charIdOf(c);
      pushIssue({
        code: 'missing-appearance',
        severity: 'warning',
        characterIds: id !== '' ? [id] : [],
        eventId: '',
        message: '초상 없고 외형 서술 없음.',
      });
    }
  }

  // 5) 이벤트별 검사
  for (const e of rawEvents) {
    const eid = eventIdOf(e);
    const participants = asList(e != null ? e.participants : []);

    // 5a) 없는 인물 참가
    for (const p of participants) {
      const pid = participantIdOf(p);
      if (pid === '' || !knownIds.has(pid)) {
        pushIssue({
          code: 'missing-participant',
          severity: 'error',
          characterIds: pid !== '' ? [pid] : [],
          eventId: eid,
          message: pid !== ''
            ? `이벤트 "${eid}"에 없는 인물 "${pid}" 참가.`
            : `이벤트 "${eid}"에 빈 인물 ID 참가.`,
        });
      }
    }

    // 5b) 같은 이벤트 안 별칭 충돌 (다른 인물 ID가 같은 별칭 사용)
    const eventMap = new Map();
    for (const p of participants) {
      const pid = participantIdOf(p);
      if (pid === '') continue;
      const perParticipant = new Set();
      for (const a of asList(p != null ? p.aliases : [])) {
        const n = normLabel(a);
        if (n === '') continue;
        perParticipant.add(n);
      }
      for (const n of perParticipant) {
        if (!eventMap.has(n)) eventMap.set(n, new Set());
        eventMap.get(n).add(pid);
      }
    }
    for (const [label, idSet] of eventMap) {
      if (idSet.size > 1) {
        pushIssue({
          code: 'ambiguous-alias',
          severity: 'warning',
          characterIds: sortedUnique(idSet),
          eventId: eid,
          message: `이벤트 "${eid}"에서 별칭 "${label}" 충돌.`,
        });
      }
    }

    // 5c) 이벤트 별칭과 전역 등록 별칭 충돌 (다른 인물 소유와 겹침)
    for (const p of participants) {
      const pid = participantIdOf(p);
      if (pid === '' || !knownIds.has(pid)) continue;
      const perParticipant = new Set();
      for (const a of asList(p != null ? p.aliases : [])) {
        const n = normLabel(a);
        if (n === '') continue;
        perParticipant.add(n);
      }
      for (const label of perParticipant) {
        const owners = globalMap.get(label);
        if (owners != null && [...owners].some(owner => owner !== pid)) {
          pushIssue({
            code: 'ambiguous-alias',
            severity: 'warning',
            characterIds: sortedUnique([pid, ...owners]),
            eventId: eid,
            message: `이벤트 "${eid}" 별칭 "${label}"이(가) 다른 인물의 등록 이름/별칭과 충돌.`,
          });
        }
      }
    }
  }

  return {
    issues: issues.slice(0, 200),
    counts: {
      characters: rawCharacters.length,
      events: rawEvents.length,
    },
  };
}
