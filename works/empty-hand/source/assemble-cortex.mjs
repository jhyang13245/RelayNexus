// 단청 소스의 scripts/vendor-cortex.mjs와 같은 방식으로 vendor/cortex/parts를 Cortex_v1.42.0.html로 조립한다(검증 전용).
//   node assemble-cortex.mjs <단청 소스>/vendor/cortex <출력 HTML> [--test-timeout]
// --test-timeout: Node의 fake-indexeddb는 실제 브라우저보다 훨씬 느려서, 저장 상태가 커지는 두 번째 이야기에서
// Cortex의 4초 저장 제한(PERSIST_WRITE_TIMEOUT)에 걸린다. 검증용 사본에서만 그 제한을 120초로 늘린다.
import fs from "node:fs";

const [vendor, out, flag] = process.argv.slice(2);
const names = fs.readdirSync(`${vendor}/parts`).filter((x) => x.endsWith(".part")).sort();
if (names.length !== 11) throw new Error("Incomplete Cortex source parts");
const assembled = Buffer.concat(names.map((x) => fs.readFileSync(`${vendor}/parts/${x}`))).toString("utf8");
const extensions = ["instant-runtime", "occurrence-runtime"].map((name) => "<script>" + fs.readFileSync(`${vendor}/${name}.js`, "utf8") + (name === "occurrence-runtime" ? "\n" + fs.readFileSync(`${vendor}/jieum-runtime.js`, "utf8") : "") + "</script>").join("\n");
let html = assembled.replace("<head>", "<head>\n" + extensions);
if (flag === "--test-timeout") {
  const timer = "const timer=setTimeout(()=>{error=new Error('PERSIST_WRITE_TIMEOUT');try{tx.abort()}catch{}reject(error)},4000);";
  if (html.split(timer).length !== 2) throw new Error("저장 제한 위치를 찾지 못했습니다.");
  html = html.replace(timer, timer.replace("},4000);", "},120000);"));
}
fs.writeFileSync(out, html);
console.log(`조립: ${out} (${fs.statSync(out).size} bytes)${flag === "--test-timeout" ? " · 검증용 저장 제한 120초" : ""}`);
