import { progressLabel } from './vn-event-progress.mjs?v=ef485ae04925';

function el(tag, className, text) {
  const node = document.createElement(tag); if (className) node.className = className;
  if (text !== undefined) node.textContent = text; return node;
}
function badge(code) {
  const [label, tone] = progressLabel(code), node = el('span', 'vn-progress-badge', label);
  node.dataset.tone = tone; return node;
}
function heading(title, code, tag = 'h3') {
  const node = el('div', 'vn-progress-heading'); node.append(el(tag, '', title), badge(code)); return node;
}
function stats(values) {
  const node = el('dl', 'vn-progress-stats');
  for (const [name, value] of values) { const cell = el('div'); cell.append(el('dt', '', name), el('dd', '', value)); node.append(cell); }
  return node;
}
function conditionList(rows) {
  const node = el('ol', 'vn-progress-list');
  for (const row of rows) {
    const item = el('li'); item.append(heading(row.label || '종결조건', row.status, 'h4'), el('p', 'vn-progress-reason', row.reason || '아직 저장된 판정 사유가 없습니다.')); node.append(item);
  }
  return node;
}
function reviewDetails(review) {
  const node = el('details', 'vn-progress-details'); node.append(el('summary', '', '종결 검토 내용'));
  if (review.reason) node.append(el('p', '', review.reason));
  const rows = el('ol', 'vn-progress-list');
  for (const check of review.checks) { const li = el('li'); li.append(heading(check.label, check.status, 'h4')); rows.append(li); }
  node.append(rows); return node;
}
const empty = message => el('div', 'vn-progress-empty', message);
const shown = value => value === null ? '기록 없음' : String(value);

export function createEventProgressDialog({ root, read, recovery, beforeOpen = () => {} }) {
  const dialog = el('dialog', 'vn-event-progress'); dialog.id = 'vn-event-progress'; dialog.setAttribute('aria-labelledby', 'vn-progress-title');
  const header = el('header'), title = el('div'), h2 = el('h2', '', '사건·비트 진행상황'); h2.id = 'vn-progress-title';
  title.append(el('span', 'vn-progress-kicker', 'STORY PROGRESS'), h2);
  const close = el('button', 'vn-progress-close', '닫기 ×'); close.type = 'button'; close.addEventListener('click', () => dialog.close()); header.append(title, close);
  const tabs = el('div', 'vn-progress-tabs'); tabs.setAttribute('role', 'tablist'); tabs.setAttribute('aria-label', '진행상황 보기');
  const panel = el('section', 'vn-progress-panel'); panel.id = 'vn-progress-panel'; panel.setAttribute('role', 'tabpanel'); panel.tabIndex = 0;
  let selected = 0, last = '', timer;
  const buttons = ['현재 사건', '비트 기록', '종결 기록'].map((name, index) => {
    const button = el('button', '', name); button.type = 'button'; button.id = `vn-progress-tab-${index}`;
    button.setAttribute('role', 'tab'); button.setAttribute('aria-controls', panel.id);
    button.addEventListener('click', () => select(index)); tabs.append(button); return button;
  });
  tabs.addEventListener('keydown', event => {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault(); select(event.key === 'Home' ? 0 : event.key === 'End' ? 2 : (selected + (event.key === 'ArrowRight' ? 1 : 2)) % 3); buttons[selected].focus();
  });
  dialog.append(header, el('p', 'vn-progress-note', '최신 저장·판정 기준입니다. 이전 문장을 읽는 위치와는 다를 수 있습니다.'), recovery, tabs, panel); root.append(dialog);
  function select(index) {
    selected = index; buttons.forEach((button, i) => { button.setAttribute('aria-selected', String(i === index)); button.tabIndex = i === index ? 0 : -1; });
    panel.setAttribute('aria-labelledby', buttons[index].id); last = ''; refresh();
  }
  function renderCurrent(current) {
    if (!current) { panel.append(empty('작품을 시작하면 현재 사건의 진행상황이 표시됩니다.')); return; }
    const card = el('article', 'vn-progress-card'), rows = current.requirements;
    const met = rows.filter(row => row.status === 'MET').length;
    const allowed = rows.filter(row => ['ALTERNATIVE_MET', 'AUTHOR_ACCEPTED', 'OUT_OF_SCOPE'].includes(row.status)).length;
    card.append(heading(current.title, current.phase), stats([
      ['진행 / 기본 비트', `${shown(current.beats)} / ${current.budget}`], ['연장', `${current.extensions} / 2`], ['충족 조건', `${met} / ${rows.length}`],
    ]));
    if (current.beats !== null) { const bar = el('progress'); bar.max = current.budget; bar.value = Math.min(current.beats, current.budget); bar.setAttribute('aria-label', '기본 비트 진행'); card.append(bar); }
    card.append(el('p', 'vn-progress-muted', `기본 ${current.budget}비트 뒤 필요하면 최대 2비트 연장합니다. 조건을 충족하고 장면이 마무리되면 일찍 종결할 수 있습니다.`));
    if (allowed) card.append(el('p', 'vn-progress-muted', `대체 달성·작가 인정·범위 밖 조건 ${allowed}개는 직접 충족한 조건과 구분해 표시합니다.`));
    panel.append(card, el('h3', 'vn-progress-section-title', '종결조건'), rows.length ? conditionList(rows) : empty('등록된 종결조건이 없습니다.'));
    if (current.review) panel.append(reviewDetails(current.review));
    if (current.steps.length) {
      const detail = el('details', 'vn-progress-details'); detail.append(el('summary', '', '사건의 구성 단계'));
      detail.append(el('p', '', '작품에 정해진 구성 단계입니다. 실제 진행 비트 수와는 다를 수 있습니다.'));
      const steps = el('ol', 'vn-progress-steps');
      for (const step of current.steps) { const li = el('li', '', `${step.title}${step.status === 'COMPLETED' ? ' · 완료' : step.status === 'SKIPPED_EARLY' ? ' · 조기 종결로 생략' : step.current ? ' · 현재' : ' · 대기'}`); li.dataset.current = String(step.current); steps.append(li); }
      detail.append(steps); panel.append(detail);
    }
  }
  function refresh() {
    if (!dialog.open || document.hidden) return;
    const data = read(), signature = JSON.stringify([selected, data]); if (signature === last) return;
    last = signature;
    const scroll = dialog.scrollTop, openDetails = [...panel.querySelectorAll('details[open]')].map(node => node.dataset.key);
    panel.replaceChildren();
    if (selected === 0) renderCurrent(data.current);
    else if (selected === 1) {
      if (!data.history.length) panel.append(empty('아직 저장된 비트 기록이 없습니다.'));
      for (const beat of data.history) {
        const card = el('article', 'vn-progress-card'); card.append(heading(`${beat.index}번째 비트 · ${beat.eventTitle}`, beat.status));
        card.append(el('p', 'vn-progress-reason', beat.adjudicated ? beat.reason || '판정이 저장되었습니다.' : beat.status === 'ADJUDICATION_PENDING' ? '본문은 보존되어 있으며 판정 보완이 필요합니다.' : '저장된 판정 사유가 없습니다.'));
        if (beat.requirements.length) { const detail = el('details', 'vn-progress-details'); detail.dataset.key = beat.id; detail.append(el('summary', '', '이 비트의 조건 판정'), conditionList(beat.requirements)); card.append(detail); }
        panel.append(card);
      }
    } else {
      if (!data.closures.length) panel.append(empty('아직 종결된 사건이 없습니다.'));
      for (const event of data.closures) {
        const card = el('article', 'vn-progress-card'); card.append(heading(event.title, event.status), el('p', 'vn-progress-reason', event.reason));
        card.append(stats([['진행 비트', shown(event.beats)], ['연장', shown(event.extensions)], ['이월 조건', String(event.missing)]]));
        if (event.review) { const detail = reviewDetails(event.review); detail.dataset.key = event.id; card.append(detail); } panel.append(card);
      }
    }
    [...panel.querySelectorAll('details')].forEach((node, i) => { node.dataset.key ||= `detail-${i}`; node.open = openDetails.includes(node.dataset.key); });
    dialog.scrollTop = scroll;
  }
  dialog.addEventListener('close', () => { clearInterval(timer); timer = undefined; });
  return { open() { if (dialog.open) return; beforeOpen(); dialog.showModal(); select(0); dialog.scrollTop = 0; close.focus(); timer = setInterval(refresh, 1000); }, close() { dialog.close(); } };
}
