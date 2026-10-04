import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

// Local-only fixtures: no production account, publication or API writes.
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE_PATH || 'playwright');
const origin = 'http://127.0.0.1:5198';
const output = fileURLToPath(new URL('../outputs/neoreum-responsive/', import.meta.url));
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ headless: true, channel: process.env.PLAYWRIGHT_CHANNEL || 'chrome' });
const context = await browser.newContext({ extraHTTPHeaders: { 'oai-authenticated-user-email': 'responsive-qa@example.test' } });
const fixture = {
  id: 'fixture', slug: 'qa-dancheong', title: '단청 검수 작품', subtitle: '첫 번째 이야기',
  description: '모바일 세로 화면의 작품 정보·표지·작업 원본·덧칠 관리를 확인하는 테스트용 작품입니다.',
  genre: '미스터리, 스릴러', tags: ['미스터리', '스릴러'], runtime: 'intelligent_canon',
  minNexusVersion: '1.41.9', uploaderEmail: 'responsive-qa@example.test', visibility: 'public', status: 'published',
  hasCustomCover: false, coverContentType: 'image/webp', coverUrl: '/qa-cover.svg', updatedAt: '2026-09-11T00:00:00Z',
  currentRevision: 3, revisionCount: 3, packageVersion: '1.5', packageBytes: 1024, downloadUrl: '/unused',
  sourceProjectId: 'qa-source', packageContract: { packageTarget: 'cortex', engineScope: 'cortex_only', targetEngine: 'dancheong-cortex', minimumTargetVersion: '1.41.9', compatibilitySchema: 'CORTEX_STUDIO_PACKAGE_CONTRACT_V2' },
};
const works = [fixture, { ...fixture, id: 'second', slug: 'qa-second', title: '아주 긴 제목이 들어간 두 번째 출간 작품', sourceProjectId: 'qa-second-source' }];
const mutations = [];
await context.route('**/api/**', async route => {
  const request = route.request();
  const path = new URL(request.url()).pathname;
  if (path === '/api/device-owner' || path === '/api/account') return route.fulfill({ json: { authenticated: true, id: 'qa-account', email: 'responsive-qa@example.test', displayName: '단청 검수', role: 'USER', storageMode: 'account' } });
  if (request.method() !== 'GET') { mutations.push(path); return route.fulfill({ status: 403, json: { error: 'QA_WRITE_BLOCKED' } }); }
  if (path === '/api/neoreum/manage/works' || path === '/api/hub/works') return route.fulfill({ json: { works } });
  if (path.endsWith('/editor-source')) return route.fulfill({ json: { status: 'legacy' } });
  if (path === '/api/cortex/sessions') return route.fulfill({ json: { sessions: [] } });
  return route.fulfill({ json: { projects: [], sessions: [] } });
});
await context.route('**/qa-cover.svg*', route => route.fulfill({ contentType: 'image/svg+xml', body: '<svg xmlns="http://www.w3.org/2000/svg" width="300" height="400"><rect width="300" height="400" fill="#214b41"/><text x="150" y="210" text-anchor="middle" font-size="30" fill="#dfce99">QA BOOK</text></svg>' }));
await context.addInitScript(() => {
  localStorage.setItem('nexus-runtime-engine', 'cortex');
  localStorage.setItem('nexus-cortex-catalog-v1', JSON.stringify([1, 2].map(revision => ({ id: `qa-session-${revision}`, projectId: `cortex-import-neoreum:qa-dancheong:r${revision}`, sourceProjectId: 'qa-source', name: '단청 검수 작품', turn: revision, thumbnailUrl: '/qa-cover.svg', lastPlayedAt: '2026-09-11T00:00:00Z' }))));
});
const page = await context.newPage();
const errors = [];
page.on('pageerror', error => errors.push(error.message));
try {
  for (const width of [320, 390, 430, 768, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto(`${origin}/neoreum/manage`);
    await page.getByRole('button', { name: '작품 정보 저장', exact: true }).waitFor();
    const overflow = await page.locator('.neoreum-site').evaluate(site => [...site.querySelectorAll('form, input:not([type=hidden]), textarea, select, .info-save-button, .editor-source-status')].filter(el => {
      const r = el.getBoundingClientRect();
      return r.width > 0 && (r.left < -1 || r.right > innerWidth + 1);
    }).map(el => ({ tag: el.tagName, class: el.className, right: el.getBoundingClientRect().right })));
    assert.deepEqual(overflow, [], `form overflow at ${width}`);
    await page.getByRole('button', { name: '작품 정보 저장', exact: true }).scrollIntoViewIfNeeded();
    await page.screenshot({ path: `${output}/manage-${width}.png` });
    const scroll = await page.locator('.neoreum-site').evaluate(el => ({ top: el.scrollTop, height: el.clientHeight, content: el.scrollHeight }));
    assert.ok(scroll.top > 0 && scroll.content > scroll.height, `scroll works at ${width}`);
    await page.goto(`${origin}/neoreum`);
    await page.getByRole('heading', { name: '내 출간작', exact: true }).waitFor();
    assert.equal(await page.locator('.neoreum-grid > article').count(), 2);
    assert.equal(await page.getByRole('heading', { name: '공개 작품', exact: true }).count(), 0);
    const bounds = await page.locator('.neoreum-main').evaluate(el => ({ width: el.scrollWidth, client: el.clientWidth }));
    assert.ok(bounds.width <= bounds.client + 1, `home overflow at ${width}: ${JSON.stringify(bounds)}`);
    await page.screenshot({ path: `${output}/home-${width}.png` });
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(origin);
  await page.locator('.book-revision-seal').first().waitFor();
  assert.equal(await page.locator('.book-revision-seal').count(), 1);
  await page.locator('#bookshelf').scrollIntoViewIfNeeded();
  await page.screenshot({ path: `${output}/bookshelf-390.png` });
  const books = page.locator('.library-book');
  assert.equal(await books.count(), 1);
  await books.first().locator('.book-options-trigger').click();
  await page.locator('.book-revision-options button').filter({hasText:'덧칠 v1'}).click();
  await page.getByText('덧칠 v1 전용 세션', { exact: false }).waitFor();
  assert.equal(await page.locator('.continue-session-choice').count(), 1);
  await books.first().locator('.book-options-trigger').click();
  await page.locator('.book-revision-options button').filter({hasText:'덧칠 v2'}).click();
  await page.getByText('덧칠 v2 전용 세션', { exact: false }).waitFor();
  assert.equal(await page.locator('.continue-session-choice').count(), 1);
  assert.deepEqual(errors, []);
  console.log(JSON.stringify({ widths: [320,390,430,768,1440], formOverflow: false, ownCatalog: true, revisionSessionsSeparated: true, blockedMutations: mutations, screenshots: output }));
} finally { await browser.close(); }
