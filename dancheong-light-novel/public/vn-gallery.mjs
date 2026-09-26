// Extras: an event-CG gallery and a music room built only from media this
// device already holds for the work. Nothing here generates or downloads
// paid content; an empty gallery simply says so.

const WRAPPERS = /^vn-(?:style|wardrobe|character-finish|face-redraw|story-expression|portrait-redraw|identity-revision|stage-frame|motion-mask)-[\w-]+$/u;
// The innermost asset type of a (possibly style-wrapped) cache key.
export function assetType(key, depth = 0) {
  if (typeof key !== 'string' || depth > 12) return '';
  try {
    const row = JSON.parse(key);
    if (!Array.isArray(row) || typeof row[0] !== 'string') return '';
    return WRAPPERS.test(row[0]) ? assetType(row[1], depth + 1) : row[0];
  } catch { return ''; }
}
export function galleryImages(rows = []) {
  return rows
    .filter(row => /^vn-(?:event|drawn-shot)-\d+$/u.test(assetType(row?.key)) && /^data:image\//u.test(row?.url || '') && !row.rejected)
    .sort((a, b) => (Number(a.savedAt) || 0) - (Number(b.savedAt) || 0))
    .map(row => ({ key: row.key, url: row.url, kind: assetType(row.key).startsWith('vn-event') ? '사건' : '구도', savedAt: Number(row.savedAt) || 0 }));
}

export function createGalleryDialog({ root, listImages, listMusic, onOpen = () => {} }) {
  const dialog = document.createElement('dialog'); dialog.className = 'vn-gallery-dialog'; dialog.id = 'vn-gallery-dialog';
  dialog.setAttribute('aria-labelledby', 'vn-gallery-title');
  dialog.innerHTML = `<header><div><span class="vn-kicker">EXTRA</span><h2 id="vn-gallery-title">갤러리</h2></div><button class="vn-gallery-close" type="button">닫기 ×</button></header>
    <div class="vn-gallery-tabs" role="tablist"><button type="button" role="tab" data-tab="cg" aria-selected="true">CG</button><button type="button" role="tab" data-tab="music" aria-selected="false">음악 감상</button></div>
    <p class="vn-gallery-status" role="status"></p><div class="vn-gallery-grid" data-panel="cg"></div><div class="vn-gallery-music" data-panel="music" hidden></div>
    <figure class="vn-gallery-view" hidden><img alt=""><figcaption></figcaption><button type="button" data-prev aria-label="이전 그림">‹</button><button type="button" data-next aria-label="다음 그림">›</button></figure>`;
  root.append(dialog);
  const grid = dialog.querySelector('.vn-gallery-grid'), music = dialog.querySelector('.vn-gallery-music'), status = dialog.querySelector('.vn-gallery-status');
  const viewer = dialog.querySelector('.vn-gallery-view'), player = new Audio();
  let images = [], index = -1, urls = [], tab = 'cg';
  const show = next => {
    index = (next + images.length) % images.length; const item = images[index];
    viewer.hidden = false; viewer.querySelector('img').src = item.url;
    viewer.querySelector('figcaption').textContent = `${item.kind} ${index + 1} / ${images.length}`;
  };
  const select = name => {
    tab = name;
    for (const button of dialog.querySelectorAll('[role="tab"]')) button.setAttribute('aria-selected', String(button.dataset.tab === name));
    grid.hidden = name !== 'cg'; music.hidden = name !== 'music'; viewer.hidden = true;
    status.textContent = name === 'cg' ? (images.length ? `저장된 사건·구도 그림 ${images.length}장` : '아직 저장된 사건 장면이 없습니다. 사건 장면 연출을 켜고 이야기를 진행하면 이곳에 모입니다.') : '';
  };
  function release() { player.pause(); player.removeAttribute('src'); for (const url of urls) URL.revokeObjectURL(url); urls = []; }
  async function render() {
    release(); grid.replaceChildren(); music.replaceChildren(); status.textContent = '불러오는 중…';
    try { images = await listImages(); } catch { images = []; }
    for (const [at, item] of images.entries()) {
      const button = document.createElement('button'); button.type = 'button'; button.className = 'vn-gallery-thumb';
      const image = document.createElement('img'); image.src = item.url; image.alt = `${item.kind} ${at + 1}`; image.loading = 'lazy';
      button.append(image); button.addEventListener('click', () => show(at)); grid.append(button);
    }
    let tracks = [];
    try { tracks = await listMusic(); } catch { tracks = []; }
    if (!tracks.length) { const empty = document.createElement('p'); empty.textContent = '이 작품에 등록되거나 생성된 배경음악이 없습니다. 설정의 작품 음원에서 추가할 수 있습니다.'; music.append(empty); }
    for (const track of tracks) {
      const row = document.createElement('div'); row.className = 'vn-gallery-track';
      const name = document.createElement('strong'); name.textContent = track.label;
      const detail = document.createElement('small'); detail.textContent = [track.title, track.credit].filter(Boolean).join(' · ');
      const play = document.createElement('button'); play.type = 'button'; play.textContent = '재생';
      const src = track.blob ? (urls[urls.push(URL.createObjectURL(track.blob)) - 1]) : track.url;
      play.addEventListener('click', () => {
        const playing = player.dataset.track === track.label && !player.paused;
        for (const other of music.querySelectorAll('button')) other.textContent = '재생';
        if (playing) { player.pause(); return; }
        player.src = src; player.dataset.track = track.label; player.loop = true; void player.play().catch(() => {}); play.textContent = '정지';
      });
      row.append(name, detail, play); music.append(row);
    }
    select(tab);
  }
  dialog.querySelector('.vn-gallery-close').addEventListener('click', () => dialog.close());
  dialog.addEventListener('close', release);
  for (const button of dialog.querySelectorAll('[role="tab"]')) button.addEventListener('click', () => select(button.dataset.tab));
  viewer.querySelector('[data-prev]').addEventListener('click', event => { event.stopPropagation(); show(index - 1); });
  viewer.querySelector('[data-next]').addEventListener('click', event => { event.stopPropagation(); show(index + 1); });
  viewer.addEventListener('click', () => { viewer.hidden = true; });
  dialog.addEventListener('keydown', event => {
    if (viewer.hidden) return;
    if (event.key === 'ArrowLeft') { event.preventDefault(); show(index - 1); }
    if (event.key === 'ArrowRight') { event.preventDefault(); show(index + 1); }
    if (event.key === 'Escape') { event.preventDefault(); viewer.hidden = true; }
  });
  return {
    async show(which = 'cg') { onOpen(); tab = which; if (!dialog.open) dialog.showModal(); await render(); },
    get open() { return dialog.open; },
  };
}
