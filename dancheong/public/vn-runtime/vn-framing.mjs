import { readWorkArt, writeWorkArt } from './vn-character-art.mjs?v=a63fa2266034';
const clamp = (n, low, high, fallback) => Number.isFinite(Number(n)) ? Math.min(high, Math.max(low, Number(n))) : fallback;
export function cleanFraming(value) { return { scale: clamp(value?.scale, .7, 1.3, 1), offset: clamp(value?.offset, -.15, .15, 0) }; }
export function framingFor(storage, scope, id) { return cleanFraming(readWorkArt(storage, scope).frames?.[JSON.stringify([scope, id])]); }
export function writeFraming(storage, scope, id, value) {
  const prefs = readWorkArt(storage, scope), key = JSON.stringify([scope, id]);
  prefs.frames = { ...prefs.frames, [key]: cleanFraming(value) }; writeWorkArt(storage, scope, prefs);
}
export function framingControls({ card, image, storage, scope, id, onChange }) {
  const form = document.createElement('details'); form.className = 'vn-framing';
  form.innerHTML = '<summary>입상 구도 조정 · 무료</summary><p>자동 얼굴 측정이 어긋난 그림은 표시 크기와 높이만 보정할 수 있습니다. 작품 설정의 키 차이는 별도로 유지되며 같은 인물의 표정·복장에도 적용됩니다.</p><label>확대 비율 <input type="range" min="70" max="130" step="1" data-scale><output></output></label><label>세로 위치 <input type="range" min="-15" max="15" step="1" data-offset><output></output></label><button type="button">자동 기준으로 복원</button>';
  const scale = form.querySelector('[data-scale]'), offset = form.querySelector('[data-offset]');
  function draw(value) { scale.value = Math.round(value.scale * 100); offset.value = Math.round(value.offset * 100); scale.nextElementSibling.value = `${scale.value}%`; offset.nextElementSibling.value = `${offset.value}%`; if (image) { image.style.transform = `translateY(${value.offset*100}%) scale(${value.scale})`; image.style.transformOrigin = '50% 26%'; } }
  const change = () => { const value = cleanFraming({ scale: scale.value / 100, offset: offset.value / 100 }); writeFraming(storage, scope, id, value); draw(value); onChange?.(); };
  scale.oninput = offset.oninput = change;
  form.querySelector('button').onclick = () => { draw({ scale: 1, offset: 0 }); change(); };
  draw(framingFor(storage, scope, id)); card.append(form);
}
