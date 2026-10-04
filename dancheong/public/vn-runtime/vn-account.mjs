import { hostServices } from './vn-host.mjs?v=a63fa2266034';
export async function fetchAccount(fetchImpl = globalThis.fetch) {
  const response = await fetchImpl(hostServices().accountEndpoint, {
    credentials: 'same-origin', cache: 'no-store', signal: AbortSignal.timeout(8000),
    headers: { Accept: 'application/json' },
  });
  if (!response.ok) throw new Error('account unavailable');
  const data = await response.json();
  if (typeof data?.authenticated !== 'boolean' ||
      (data.authenticated && (typeof data.displayName !== 'string' || !data.displayName.trim()))) {
    throw new Error('invalid account response');
  }
  return { authenticated: data.authenticated, displayName: data.authenticated ? data.displayName : null };
}

export function createAccountMenu(host) {
  host.className = 'vn-account';
  host.innerHTML = `
    <button class="vn-account-toggle" type="button" aria-expanded="false" aria-controls="vn-account-panel">
      <span class="vn-account-dot" aria-hidden="true"></span><span class="vn-account-label">계정</span><span aria-hidden="true">⌄</span>
    </button>
    <section id="vn-account-panel" class="vn-account-panel" aria-label="내 계정" hidden>
      <strong class="vn-account-heading">내 계정</strong>
      <p class="vn-account-status" role="status">로그인 상태 확인 중…</p>
      <a class="vn-account-action" href="/signin-with-chatgpt?return_to=%2Fcortex" target="_top" hidden>ChatGPT로 로그인</a>
      <button class="vn-account-retry" type="button" hidden>다시 확인</button>
      <button class="vn-account-cloud" type="button">계정 클라우드 저장</button>
      <p class="vn-account-note">클라우드에 저장한 진행은 다른 기기에서 불러올 수 있습니다. 자동 저장은 작품별로 켤 수 있으며, API 키는 이 기기에만 보관됩니다.</p>
    </section>`;
  const doc = host.ownerDocument, win = doc.defaultView;
  const toggle = host.querySelector('.vn-account-toggle');
  const label = host.querySelector('.vn-account-label');
  const panel = host.querySelector('.vn-account-panel');
  const status = host.querySelector('.vn-account-status');
  const action = host.querySelector('.vn-account-action');
  const retry = host.querySelector('.vn-account-retry');
  let pending = null;
  function close() { panel.hidden = true; toggle.setAttribute('aria-expanded', 'false'); }
  function refresh() {
    if (pending) return pending;
    status.textContent = '로그인 상태 확인 중…';
    action.hidden = true; retry.hidden = true;
    pending = fetchAccount().then(account => {
      host.dataset.authenticated = String(account.authenticated);
      label.textContent = account.authenticated ? '내 계정' : '로그인';
      // Account names are always plain text, including names containing markup.
      status.textContent = account.authenticated ? `${account.displayName} · 로그인됨` : '로그인하지 않은 상태입니다.';
      action.textContent = account.authenticated ? '로그아웃' : 'ChatGPT로 로그인';
      action.setAttribute('href', account.authenticated
        ? hostServices().signOut
        : hostServices().signIn);
      action.hidden = false;
    }).catch(() => {
      delete host.dataset.authenticated;
      label.textContent = '계정';
      status.textContent = '로그인 상태를 확인하지 못했습니다.';
      retry.hidden = false;
    }).finally(() => { pending = null; });
    return pending;
  }
  toggle.addEventListener('click', () => {
    if (!panel.hidden) { close(); return; }
    panel.hidden = false; toggle.setAttribute('aria-expanded', 'true');
    void refresh();
  });
  retry.addEventListener('click', refresh);
  host.querySelector('.vn-account-cloud').onclick = () => { close(); host.dispatchEvent(new CustomEvent('vn-cloud-open')); };
  doc.addEventListener('click', event => { if (!host.contains(event.target)) close(); });
  host.addEventListener('keydown', event => {
    if (event.key === 'Escape') { close(); toggle.focus(); event.stopPropagation(); }
  });
  // Refresh after returning from platform authentication, including bfcache.
  win.addEventListener('pageshow', () => { if (!host.hidden) void refresh(); });
  doc.addEventListener('visibilitychange', () => { if (!doc.hidden && !host.hidden) void refresh(); });
  void refresh();
  return {
    setVisible(visible) { host.hidden = !visible; close(); if (visible) void refresh(); },
    close,
  };
}
