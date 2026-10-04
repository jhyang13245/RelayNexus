// Use the prose author's quote-bound speaker annotation in both readers.
// This does not infer identity from a public label, clothing or nearby names.
export function writerBindings(turn, scenario, experience) {
  const source = String(turn?.text || ''), rows = experience.writerAnnotations?.(scenario, turn) || turn?.dialogueAnnotations || [];
  const bindings = [];
  for (const a of rows) {
    if (a?.bindingVersion !== 2 || a.bindingInvalid || !/^WRITER_(?:CHARACTER_ALIAS|CHARACTER_REF|NON_SPEECH_QUOTE)$/u.test(a.source || '')) continue;
    const offset = a.offset, quote = String(a.quoteText || '');
    if (!Number.isSafeInteger(offset) || offset < 0 || !/^[“‘「『"']/u.test(quote)) continue;
    const visible = source.slice(offset, offset + quote.length);
    if (visible.length < 2 || !quote.startsWith(visible)) continue;
    const nonSpeech = a.quoteKind === 'NON_SPEECH' || a.source === 'WRITER_NON_SPEECH_QUOTE';
    if (!nonSpeech && (!a.characterId || !experience.validPublicSpeakerName?.(scenario, a.speakerName))) continue;
    bindings.push({offset, end:offset + visible.length, quoteText:visible, characterId:nonSpeech ? '' : a.characterId,
      speakerName:nonSpeech ? '' : a.speakerName, presence:a.presence || '', nonSpeech});
  }
  // Conflicting markers at the same quote must never pick whichever came first.
  return bindings.filter(a => bindings.filter(b => b.offset === a.offset).length === 1);
}

const withoutQuotes = value => value.replace(/[“「『‘][^”」』’]*[”」』’]|"[^"\n]*"/gu, '');
const remoteContext = /전화(?:기)?\s*너머|수화기\s*너머|무전기\s*너머|통화\s*중|(?:사진|영상|녹음|기억|회상|꿈)\s*속|현장에\s*없|여기에는?\s*없/u;
export function applyWriterSpeaker(scene, page, view) {
  const start = page?.start ?? 0, end = page?.end ?? start + String(page?.rawText || page?.text || scene.publicText || '').length;
  const hits = (scene.writerBindings || []).filter(a => a.offset < end && a.end > start);
  if (hits.length !== 1) return view;
  const a = hits[0];
  if (a.nonSpeech) return {...view, speakerId:'', speakerName:'', identityIssue:null, writerSpeakerReady:true, castStatus:'ready'};
  const candidates = scene.candidates || [], matches = candidates.filter(p => p.id === a.characterId && p.referenceMode !== 'NONE');
  // A private identity annotation grants no permission to reveal its artwork.
  if (matches.length !== 1 || a.characterId === scene.protagonistId) return {...view,
    characters:(view.characters || []).filter(p => p.id !== view.speakerId), speakerId:'', speakerName:a.speakerName,
    identityIssue:null, writerSpeakerReady:true, castStatus:'ready'};
  const paragraph = String(scene.writerText || '').slice(0, a.offset).split('\n').at(-1) || '';
  const narration = withoutQuotes(paragraph);
  const remote = a.presence === 'REMOTE' || remoteContext.test(narration);
  // Older annotations lack location semantics. Keep those on the existing
  // validated direction path; never assume that a telephone speaker is present.
  if (!remote && a.presence !== 'PHYSICAL') return view;
  const person = {...(view.characters?.find(p => p.id === a.characterId) || matches[0]), name:a.speakerName};
  const characters = (view.characters || []).filter(p => p.id !== a.characterId && (!view.speakerId || view.speakerId === a.characterId || p.id !== view.speakerId));
  if (!remote) characters.push(person);
  return {...view, characters, speakerId:remote ? '' : a.characterId, speakerName:a.speakerName, speakerOffScene:remote,
    identityIssue:null, writerSpeakerReady:true, castStatus:'ready', castPending:false,
    direction:view.direction ? {...view.direction, focusId:remote ? '' : a.characterId} : null};
}
