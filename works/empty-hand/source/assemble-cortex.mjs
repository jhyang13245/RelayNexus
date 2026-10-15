// 단청 소스의 scripts/vendor-cortex.mjs와 같은 방식으로 vendor/cortex/parts를 Cortex_v1.42.0.html로 조립한다(검증 전용).
//   node assemble-cortex.mjs <단청 소스>/vendor/cortex <출력 HTML> [--test-timeout]
// 단청 v1.34 기준 확장 순서: [저장 코덱 + 공개 시계 + 정사 복구 + 작가 출력] → [Instant] → [발생 + 지음].
// --test-timeout: Node의 fake-indexeddb는 실제 브라우저보다 훨씬 느려서, 저장 상태가 커지면 Cortex의
// 저장 감시(유휴 4초·최대 20초, PERSIST_WRITE_TIMEOUT)에 걸린다. 검증용 사본에서만 그 제한을 늘린다.
import fs from "node:fs";
import path from "node:path";

const [vendor, out, flag] = process.argv.slice(2);
const read = (file) => fs.readFileSync(file, "utf8");
const names = fs.readdirSync(`${vendor}/parts`).filter((x) => x.endsWith(".part")).sort();
if (names.length !== 11 || names.some((name, i) => name !== String(i).padStart(2, "0") + ".part")) throw new Error("Incomplete Cortex source parts");
const assembled = Buffer.concat(names.map((x) => fs.readFileSync(`${vendor}/parts/${x}`))).toString("utf8");
const clock = path.join(vendor, "..", "..", "public", "cortex-published-clock.js");
let codec = read(`${vendor}/save-codec-runtime.js`);
if (flag === "--test-timeout") {
  const limits = "idleMs=4000,maxMs=20000";
  if (codec.split(limits).length !== 2) throw new Error("저장 감시 제한 위치를 찾지 못했습니다.");
  codec = codec.replace(limits, "idleMs=120000,maxMs=600000");
}
const bundles = [
  [codec, read(clock), read(`${vendor}/canon-recovery-runtime.js`), read(`${vendor}/author-output-runtime.js`)],
  [read(`${vendor}/instant-runtime.js`)],
  [read(`${vendor}/occurrence-runtime.js`), read(`${vendor}/jieum-runtime.js`)],
];
const html = assembled.replace("<head>", () => "<head>\n" + bundles.map((b) => "<script>" + b.join("\n") + "</script>").join("\n"));
fs.writeFileSync(out, html);
console.log(`조립: ${out} (${fs.statSync(out).size} bytes)${flag === "--test-timeout" ? " · 검증용 저장 감시 유휴 120초·최대 600초" : ""}`);
