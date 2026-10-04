// Visual continuity is separate from Cortex's canonical world state. Replaying
// published prefixes makes backtracking, reload and out-of-order prefetch agree.
export const visualNarration = value => String(value || '').replace(/[“「『‘][^”」』’]*(?:[”」』’]|$)|"[^"\n]*(?:"|$)/gu, match => ' '.repeat(match.length));
const indirect = /만약|다면|더라면|예정|계획|상상|회상|떠올|기억\s*속|사진\s*속|꿈\s*속|하지\s*않|가지\s*않|않았다|\b(?:if|would|imagined|remembered|planning)\b/iu;
export function lightFor(time = '') {
  const hour = Number(String(time).match(/^(\d{1,2}):/u)?.[1]);
  if (Number.isFinite(hour)) return hour < 5 || hour >= 20 ? 'night' : hour < 7 ? 'dawn' : hour < 17 ? 'day' : 'dusk';
  return /밤|야간|심야|night/iu.test(time) ? 'night' : /새벽|동틀|dawn/iu.test(time) ? 'dawn' : /저녁|해질|해 질|일몰|석양|황혼|dusk|evening|sunset/iu.test(time) ? 'dusk' : 'day';
}
const clean = value => String(value || '').normalize('NFKC').toLowerCase().trim().replace(/\s+/gu, ' ');
export function placeIdentity(value) {
  return clean(value).replace(/\s+(?:창가|창문 옆|문 옆|한쪽|중앙|안쪽|내부)(?:\s*(?:쪽|부근))?$/u, '').replace(/[\s>›/·,，:：]+/gu, '');
}
export function weatherIdentity(value) {
  const text = clean(value);
  if (!text) return '';
  if (/비(?:가)?\s*(?:없|그친|그쳤)|구름\s*(?:한\s*점)?\s*없/u.test(text)) return 'clear';
  if (/천둥|번개|폭우|폭풍|뇌우|태풍|storm|thunder/iu.test(text)) return 'storm';
  if (/눈|설경|snow/iu.test(text)) return 'snow';
  if (/안개|fog|mist/iu.test(text)) return 'fog';
  if (/비|우천|빗|소나기|rain|drizzle/iu.test(text)) return 'rain';
  if (/흐림|흐린|구름|cloud|overcast/iu.test(text)) return 'cloudy';
  if (/맑|쾌청|청명|화창|햇살|햇빛|clear|sunny|fair/iu.test(text)) return 'clear';
  return text;
}
const sentences = text => visualNarration(text).split(/(?<=[.!?。！？])|\n/u).filter(line => !indirect.test(line));
const movement = /들어(?:갔|왔|섰|간|선)|나(?:왔|갔|섰)|도착|돌아(?:왔|갔)|이동했|옮겼|발을\s*들였|걸어\s*(?:갔|왔)|빠져나왔|\b(?:entered|arrived|returned|moved|stepped into)\b/iu;
function locationProof(text, location) {
  const parts = clean(location).split(/[\s>›/·,，:：]+/u).filter(part => part.length >= 2);
  const target = parts.filter(part => !/^(?:내부|안쪽|창가|부근|인근)$/u.test(part)).at(-1);
  if (!target) return false;
  return sentences(text).some(line => {
    const at = line.indexOf(target);
    if (at < 0) return false;
    const tail = line.slice(at + target.length, at + target.length + 90);
    // A destination being discussed or heard about is not the camera's place.
    return /^(?:으로|로|에|안으로|\s)/u.test(tail) && movement.test(tail)
      || /^(?:에는?|에서는?|\s+안에는?)[^.!?。]{0,45}(?:서\s*있|서\s*있었|앉아|앉았|기다리|머물|둘러보|자리했)/u.test(tail);
  });
}
const lightCues = { night: /밤|야간|어둠이\s*내|어두워|해가\s*졌|night/iu, dusk: /저녁|석양|노을|해가\s*기울|해질|해 질|황혼|일몰|evening|sunset/iu, dawn: /새벽|동이\s*트|동틀|여명|dawn/iu, day: /아침|오전|오후|정오|대낮|날이\s*밝|morning|daylight|noon/iu };
const weatherCues = { clear: /비가\s*그쳤|눈이\s*그쳤|개었|맑아|햇살|햇빛|해가\s*나|sunny|cleared/iu, cloudy: /구름|흐려|흐린|cloud|overcast/iu, rain: /비가|비를|비는|빗|소나기|rain/iu, snow: /눈이|눈발|눈보라|snow/iu, fog: /안개|fog|mist/iu, storm: /천둥|번개|폭우|폭풍|뇌우|storm|thunder/iu };
export function continueEnvironment(previous, proposed, publishedText = '') {
  const next = { location: String(proposed?.location || ''), time: String(proposed?.time || ''), weather: String(proposed?.weather || '') };
  if (!previous?.location) return next;
  const out = { ...previous }, lines = sentences(publishedText);
  const moved = next.location && placeIdentity(previous.location) !== placeIdentity(next.location) && locationProof(publishedText, next.location);
  if (moved) out.location = next.location;
  // Equivalent/absent prose metadata retains the established plate and spelling.
  if (next.time && lightFor(previous.time) !== lightFor(next.time) && lines.some(line => lightCues[lightFor(next.time)].test(line))) out.time = next.time;
  if (next.weather && weatherIdentity(previous.weather) !== weatherIdentity(next.weather)
    && lines.some(line => weatherCues[weatherIdentity(next.weather)]?.test(line))) out.weather = next.weather;
  return out;
}
export function createEnvironmentContinuity() {
  let cache = new WeakMap();
  return {
    before(openingWorld, turns) {
      let world = openingWorld;
      for (const turn of turns) {
        const proposal = turn.vnScene?.world;
        if (!proposal) continue;
        const signature = JSON.stringify([world, proposal]), text = String(turn.text || '');
        let item = cache.get(turn);
        if (!item || item.signature !== signature || item.text !== text) {
          item = { signature, text, world: continueEnvironment(world, proposal, text) }; cache.set(turn, item);
        }
        world = item.world;
      }
      return world;
    },
    reset() { cache = new WeakMap(); },
  };
}
