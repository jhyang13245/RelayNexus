// Publishes a CortexPack through 너름 exactly like app/neoreum/upload-client.tsx:
// POST /api/neoreum/uploads → PUT cover → PUT parts → POST complete.
// Usage: node publish-neoreum.mjs <origin> <cookieHeader> <zip> <cover.webp> <metadata.json>
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";

const [origin, cookie, zipPath, coverPath, metaPath] = process.argv.slice(2);
const zip = readFileSync(zipPath), cover = readFileSync(coverPath), meta = JSON.parse(readFileSync(metaPath, "utf8"));
const headers = { Cookie: cookie, Origin: origin };
async function api(path, init) {
  const response = await fetch(origin + path, { ...init, headers: { ...headers, ...(init.headers || {}) } });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(`${init.method} ${path} → ${response.status} ${JSON.stringify(payload)}`);
  return payload;
}
const packageSha256 = createHash("sha256").update(zip).digest("hex");
const init = await api("/api/neoreum/uploads", {
  method: "POST", headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ ...meta, packageBytes: zip.length, packageSha256, packageContentType: "application/zip", coverBytes: cover.length, coverContentType: "image/webp" }),
});
console.log("upload session", init.uploadId, "partSize", init.partSize);
await api(`/api/neoreum/uploads/${init.uploadId}/cover`, { method: "PUT", headers: { "Content-Type": "image/webp" }, body: cover });
const partSize = Number(init.partSize), parts = [];
for (let index = 0; index * partSize < zip.length; index++) {
  const part = await api(`/api/neoreum/uploads/${init.uploadId}/parts/${index + 1}`, { method: "PUT", body: zip.subarray(index * partSize, Math.min(zip.length, (index + 1) * partSize)) });
  parts.push({ partNumber: index + 1, etag: part.etag });
}
const done = await api(`/api/neoreum/uploads/${init.uploadId}/complete`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ parts }) });
console.log(JSON.stringify({ published: meta.slug, packageSha256, parts: parts.length, response: done }, null, 2));
