import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import {createHash, webcrypto} from 'node:crypto';
import {IDBFactory} from 'fake-indexeddb';
import {BlobMemoryCache} from '../lib/blob-memory-cache';
import {rememberPackageArchive, restorePackageArchive} from '../lib/package-media-vault';

function load(source: string, dependencies: Record<string, unknown>, globals: Record<string, unknown> = {}) {
  const exports: any = {};
  const code = ts.transpileModule(fs.readFileSync(source, 'utf8'), {compilerOptions: {target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS}}).outputText;
  vm.runInNewContext(code, {exports, require: (id: string) => {
    assert.ok(id in dependencies, `unexpected dependency: ${id}`); return dependencies[id];
  }, TextEncoder, TextDecoder, URL, Request, Error, ...globals});
  return exports;
}

test('archive cache evicts only disposable least-recently-used blobs and accounts for replacements', () => {
  const cache = new BlobMemoryCache<string>(6);
  cache.set('a', new Blob(['aaa'])); cache.set('b', new Blob(['bbb']));
  cache.get('a'); cache.set('c', new Blob(['ccc']));
  assert.equal(cache.get('b'), undefined); assert.equal(cache.byteLength, 6);
  cache.set('a', new Blob(['a'])); assert.equal(cache.byteLength, 4);
  cache.set('large', new Blob(['1234567'])); assert.equal(cache.get('large'), undefined);
  assert.equal(cache.byteLength, 4); cache.delete('a'); cache.delete('a'); assert.equal(cache.byteLength, 3);
});

test('archives larger than memory budget restore from IndexedDB; failed writes retain recovery bytes', async () => {
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'window');
  try {
    Object.defineProperty(globalThis, 'window', {configurable: true, value: {indexedDB: new IDBFactory()}});
    const large = new Blob([new Uint8Array(33 * 1024 * 1024), 'end']);
    await rememberPackageArchive('optimization-large', large, 'large.zip');
    const restored = await restorePackageArchive('optimization-large');
    assert.equal(restored?.size, large.size); assert.equal(await restored?.slice(-3).text(), 'end');
    Object.defineProperty(globalThis, 'window', {configurable: true, value: {}});
    await assert.rejects(() => restorePackageArchive('optimization-large'), /저장소/);
    const pending = new Blob(['unsaved-original']);
    await assert.rejects(() => rememberPackageArchive('optimization-pending', pending, 'pending.zip'), /저장소/);
    assert.equal(await (await restorePackageArchive('optimization-pending'))?.text(), 'unsaved-original');
  } finally {
    if (previous) Object.defineProperty(globalThis, 'window', previous);
    else Reflect.deleteProperty(globalThis, 'window');
  }
});

test('prepared JSON skips duplicate hashing but rejects forged or changed digest inputs and remains integrity checked', async () => {
  let hashes = 0; const objects = new Map<string, string>();
  const store = load('lib/runtime-json-store.ts', {'./simulation-store': {
    ownerPathHash: async () => 'owner-hash', objectStorage: async () => ({put: async (key: string, value: string) => objects.set(key, value), get: async (key: string) => ({arrayBuffer: async () => new TextEncoder().encode(objects.get(key)).buffer})}),
  }}, {crypto: {randomUUID: () => webcrypto.randomUUID(), subtle: {digest: (...args: any[]) => {hashes++; return (webcrypto.subtle.digest as any)(...args);}}}});
  const value = JSON.stringify({text: '한글 본문', media: ['original']});
  const prepared = await store.runtimeJsonDigest(value);
  assert.ok(Object.isFrozen(prepared)); assert.equal(hashes, 1);
  const input = {ownerKey: 'a', projectId: 'p', category: 'revision', value, prepared};
  const pointer = await store.storeRuntimeJson(input); assert.equal(hashes, 1);
  assert.equal(pointer.sha256, createHash('sha256').update(value).digest('hex'));
  assert.equal(pointer.byteLength, Buffer.byteLength(value));
  await store.storeRuntimeJson({...input, prepared: {...prepared, sha256: 'forged'}}); assert.equal(hashes, 2);
  await store.storeRuntimeJson({...input, value: '{"changed":true}'}); assert.equal(hashes, 3);
  const row = {snapshot_r2_key: pointer.key, snapshot_sha256: pointer.sha256, snapshot_byte_length: pointer.byteLength};
  assert.equal(await store.readSessionSnapshotText(row), value);
  objects.set(pointer.key, value.replace('한글', '변경'));
  await assert.rejects(() => store.readSessionSnapshotText(row), /SHA-256/);
  await assert.rejects(() => store.storeRuntimeJson({...input, value: 'not json'}));
});

test('large Unicode JSON hashing has bounded encoding buffers and matches native SHA-256',async()=>{
 let largest=0;class Encoder extends TextEncoder{encode(value?:string){const bytes=super.encode(value);largest=Math.max(largest,bytes.length);return bytes;}}
 const store=load('lib/runtime-json-store.ts',{'./simulation-store':{},'node:crypto':{createHash}},{TextEncoder:Encoder});
 const text=JSON.stringify({text:'가'.repeat(32754)+'😀'+'한글🎨'.repeat(400000)});
 const digest=await store.runtimeJsonDigest(text);
 assert.equal(digest.sha256,createHash('sha256').update(text).digest('hex'));assert.equal(digest.byteLength,Buffer.byteLength(text));assert.ok(largest<=32768*4);
});

test('summary library retains owner authorization and project/session lists while default response retains cost diagnostics', async () => {
  const calls: string[] = []; let denied = false;
  const route = load('app/api/library/route.ts', {
    'next/server': {NextResponse: Response},
    '../../../lib/simulation-store': {requireOwnerKey: async () => {calls.push('auth'); if (denied) throw new Error('denied'); return 'owner';}, listLibrary: async (owner: string) => {assert.equal(owner, 'owner'); calls.push('library'); return {projects: [{id: 'p'}], sessions: [{id: 's'}]};}},
    '../../../lib/cost-meter-store': {listCumulativeCostMeter: async () => {calls.push('cost'); return [1];}},
    '../../../lib/live-reliability-store': {listLiveReliabilityAttempts: async () => {calls.push('diagnostics'); return [2];}},
  });
  const summary = await route.GET(new Request('https://example.test/api/library?summary=1'));
  assert.deepEqual(calls, ['auth', 'library']); assert.equal(summary.headers.get('cache-control'), 'no-store');
  assert.deepEqual(await summary.json(), {projects: [{id: 'p'}], sessions: [{id: 's'}]});
  const full = await (await route.GET()).json(); assert.deepEqual(full.costMeterTurns, [1]); assert.deepEqual(full.liveReliabilityAttempts, [2]);
  calls.length = 0; denied = true;
  assert.equal((await route.GET(new Request('https://example.test/api/library?summary=1'))).status, 401);
  assert.deepEqual(calls, ['auth']);
});

test('lease heartbeat coalesces overlapping requests and retains handoff, reacquisition and retry paths', async () => {
  const source = fs.readFileSync('app/cortex-player.tsx', 'utf8');
  const body = source.slice(source.indexOf('    let renewing = false;'), source.indexOf('    const onVisible ='));
  let resolveFetch!: (value: Response) => void, calls = 0, yielded = 0, acquired = 0;
  const deadlines: number[] = [], exports: any = {};
  const compiled = ts.transpileModule(`let owned=true,cancelled=false,reacquiring=false,renewTimer=1,validUntil=0,leaseTask=null;${body};exports.renew=renew;exports.cancel=()=>{cancelled=true};`, {compilerOptions: {target: ts.ScriptTarget.ES2022}}).outputText;
  vm.runInNewContext(compiled, {exports, endpoint: '/lease', payload: () => '{}', AbortSignal: {timeout: (ms: number) => {deadlines.push(ms); return AbortSignal.timeout(ms);}},
    fetch: () => {calls++; return new Promise(resolve => {resolveFetch = resolve;});},
    beginYield: () => yielded++, acquire: async () => {acquired++;}, send: () => {}, window: {clearInterval: () => {}},
    ensureLease:{current:null},resumeSync:{current:false},conflictPending:{current:false},readerBusy:{current:false},cloudCheckedRef:{current:''},scope:'s',
  });
  const first = exports.renew(); await exports.renew(); await exports.renew(); assert.equal(calls, 1);
  resolveFetch(Response.json({})); await first;
  const second = exports.renew(); assert.equal(calls, 2);
  resolveFetch(Response.json({code: 'CORTEX_TAKEOVER_REQUESTED'}, {status: 409})); await second; assert.equal(yielded, 1);
  const third = exports.renew(); resolveFetch(Response.json({code: 'CORTEX_SESSION_IN_USE'}, {status: 409})); await third; assert.equal(acquired, 1);
  assert.deepEqual(deadlines, [15000, 15000, 15000]);
  exports.cancel(); await exports.renew(); assert.equal(calls, 3);
});

test('superseded catalog responses cannot overwrite the newest refresh or its loading state', async () => {
  const source = fs.readFileSync('app/neoreum/catalog-client.tsx', 'utf8');
  const start = source.indexOf('async (refresh = false) => {'), end = source.indexOf('}, []);', start);
  const exports: any = {}, pending: Array<{signal: AbortSignal; resolve: (response: Response) => void}> = [];
  const state: Record<string, unknown> = {}, requestRef = {current: null};
  const compiled = ts.transpileModule('exports.load='+source.slice(start, end+1), {compilerOptions: {target: ts.ScriptTarget.ES2022}}).outputText;
  vm.runInNewContext(compiled, {exports, requestRef, AbortController, AbortSignal, Date, Error, setTimeout, clearTimeout,
    setLoading: (value: boolean) => state.loading = value, setRefreshing: (value: boolean) => state.refreshing = value,
    setError: (value: string) => state.error = value, setWorks: (value: unknown) => state.works = value,
    fetch: (_url: string, options: {signal: AbortSignal}) => new Promise<Response>(resolve => pending.push({signal: options.signal, resolve})),
  });
  const old = exports.load(), recent = exports.load(true); assert.equal(pending[0].signal.aborted, true);
  pending[0].resolve(Response.json({works: [{id: 'old'}]})); await old;
  assert.equal(state.refreshing, true); assert.equal(state.works, undefined);
  pending[1].resolve(Response.json({works: [{id: 'current'}]})); await recent;
  assert.deepEqual(state.works, [{id: 'current'}]); assert.equal(state.loading, false); assert.equal(state.refreshing, false);
});
