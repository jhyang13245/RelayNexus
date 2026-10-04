import { readdir, readFile, mkdir, rm, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { strToU8, zipSync } from "fflate";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const exportDirectory = path.join(root, "public", "downloads");
const appVersionSource = await readFile(
  path.join(root, "lib", "app-version.ts"),
  "utf8",
);
const appVersion = appVersionSource.match(/APP_VERSION\s*=\s*"([^"]+)"/u)?.[1];
if (!appVersion) throw new Error("단청 앱 버전을 읽지 못했습니다.");
const exportFileName = `Dancheong_v${appVersion}_Source.zip`;
const excludedDirectories = new Set([
  ".git",
  ".next",
  ".sites-runtime",
  ".muse-copies",
  ".wrangler",
  "coverage",
  "dist",
  "node_modules",
  "outputs",
  "work",
]);

const shouldExclude = (relativePath, directoryEntry) => {
  const normalized = relativePath.replaceAll(path.sep, "/");
  const baseName = path.posix.basename(normalized);
  if (directoryEntry.isDirectory() && excludedDirectories.has(baseName)) return true;
  if (directoryEntry.isDirectory() && baseName.startsWith(".sites-")) return true;
  // Old exported snapshots are not runtime source. Keep build/sites-vite-plugin.ts.
  if (/^build\/(?:cortex|Dancheong_Cortex)/u.test(normalized)) return true;
  // Rebuilt byte-for-byte from vendor/cortex by npm run build.
  if (normalized === "vendor/cortex/Cortex_v1.42.0.html" || normalized === "public/cortex.html" || normalized === "scripts/connect-cortex-shell.mjs") return true;
  if (normalized === "public/downloads" || normalized.startsWith("public/downloads/")) return true;
  // Pinned third-party models/WASM are reproducible binary dependencies, like
  // node_modules. Keep their loader, licenses, URLs, checksums and installer in
  // the full source ZIP; ship the actual binaries with the runtime Site assets.
  if (/^public\/vn-vision\/[^/]+\/.*\.(?:task|wasm)$/u.test(normalized)) return true;
  if (baseName.startsWith(".env") && baseName !== ".env.example") return true;
  if (baseName.endsWith(".tsbuildinfo")) return true;
  if (/\.(?:log|pem)$/iu.test(baseName)) return true;
  if (/_Sites(?:_[^/]*)?\.tar$/iu.test(baseName)) return true;
  return false;
};

const files = {};

const collect = async (absoluteDirectory, relativeDirectory = "") => {
  const entries = await readdir(absoluteDirectory, { withFileTypes: true });
  entries.sort((left, right) => left.name.localeCompare(right.name));
  for (const entry of entries) {
    const relativePath = path.join(relativeDirectory, entry.name);
    if (shouldExclude(relativePath, entry)) continue;
    const absolutePath = path.join(absoluteDirectory, entry.name);
    if (entry.isDirectory()) {
      await collect(absolutePath, relativePath);
      continue;
    }
    if (!entry.isFile()) continue;
    files[relativePath.replaceAll(path.sep, "/")] = new Uint8Array(await readFile(absolutePath));
  }
};

await collect(root);
const sourceContentHash = createHash("sha256");
for (const relativePath of Object.keys(files).sort()) {
  sourceContentHash.update(relativePath);
  sourceContentHash.update("\0");
  sourceContentHash.update(files[relativePath]);
  sourceContentHash.update("\0");
}
const sourceFileCount = Object.keys(files).length + 1;
files["SOURCE_EXPORT_MANIFEST.json"] = strToU8(`${JSON.stringify({
  product: "단청",
  siteVersion: appVersion,
  generatedAt: new Date().toISOString(),
  fileCount: sourceFileCount,
  sourceContentSha256: `sha256:${sourceContentHash.digest("hex")}`,
  operatingUrl: "https://relay-novel-nexus.juno12345.chatgpt.site",
  contents: "현재 배포 소스, 테스트, 실행 스크립트와 설정 예시",
  excluded: ["API keys", "environment secrets", "dependencies", "build outputs", "runtime caches", "pinned vision binary dependencies: restore with node scripts/install-vn-vision.mjs"],
}, null, 2)}\n`);

await mkdir(exportDirectory, { recursive: true });
const previousExports = await readdir(exportDirectory).catch(() => []);
await Promise.all(previousExports
  .filter((name) => /^(?:RelayNexus|Dancheong)_v[\d.]+_Source\.zip$/u.test(name) && name !== exportFileName)
  .map((name) => rm(path.join(exportDirectory, name), { force: true })));
const archive = zipSync(files, { level: 6 });
await writeFile(path.join(exportDirectory, exportFileName), archive);
console.log(`Prepared ${exportFileName} (${archive.byteLength} bytes, ${Object.keys(files).length} files).`);
