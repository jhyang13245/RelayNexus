import { objectStorage, ownerPathHash } from "./simulation-store";

export const R2_JSON_POINTER = JSON.stringify({
  format: "RELAY_NEXUS_R2_JSON_POINTER_V1",
});

export type StoredJsonPointer = {
  key: string;
  sha256: string;
  byteLength: number;
};

type StoredJsonRow = Record<string, unknown>;
type PreparedRuntimeJson = Readonly<{ text: string; sha256: string; byteLength: number }>;
const preparedRuntimeJson = new WeakSet<PreparedRuntimeJson>();

const encode = (value: unknown): { text: string; bytes: Uint8Array<ArrayBuffer> } => {
  const text = typeof value === "string" ? value : JSON.stringify(value);
  if (!text) throw new Error("R2에 저장할 JSON 데이터가 비어 있습니다.");
  JSON.parse(text);
  return { text, bytes: new TextEncoder().encode(text) };
};

const sha256 = async (bytes: Uint8Array<ArrayBuffer>) => {
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
};

export async function runtimeJsonDigest(value: unknown) {
  const text = typeof value === 'string' ? value : JSON.stringify(value);
  if(!text)throw new Error('R2에 저장할 JSON 데이터가 비어 있습니다.');
  // Large embedded-image saves must not allocate a second full UTF-8 copy merely
  // to hash it. nodejs_compat is already enabled by the existing Worker build.
  if(text.length>=1024*1024){
    if(typeof value==='string')JSON.parse(text);
    const {createHash}=await import('node:crypto'),hash=createHash('sha256'),encoder=new TextEncoder();
    let byteLength=0;
    for(let offset=0;offset<text.length;){
      let end=Math.min(text.length,offset+32768);
      if(end<text.length&&/[\uD800-\uDBFF]/u.test(text[end-1]))end--;
      const chunk=encoder.encode(text.slice(offset,end));hash.update(chunk);byteLength+=chunk.byteLength;offset=end;
    }
    const result=Object.freeze({text,sha256:hash.digest('hex'),byteLength});preparedRuntimeJson.add(result);return result;
  }
  const { bytes } = encode(value);
  const result = Object.freeze({
    text,
    sha256: await sha256(bytes),
    byteLength: bytes.byteLength,
  });
  preparedRuntimeJson.add(result);
  return result;
}

const safeSegment = (value: string) =>
  value.replace(/[^A-Za-z0-9._-]/g, "_").slice(0, 180) || "unknown";

export async function storeRuntimeJson(input: {
  ownerKey: string;
  projectId: string;
  sessionId?: string;
  category: "pack" | "revision" | "checkpoint";
  revision?: number;
  value: unknown;
  prepared?: PreparedRuntimeJson;
}): Promise<StoredJsonPointer> {
  // Reuse only a digest produced in this process for this exact immutable text.
  // Client-supplied hashes and changed payloads still take the validation path.
  const prepared = input.prepared && preparedRuntimeJson.has(input.prepared) && input.prepared.text === input.value
    ? input.prepared : await runtimeJsonDigest(input.value);
  const {text, sha256: digest, byteLength} = prepared;
  const ownerHash = await ownerPathHash(input.ownerKey);
  const projectId = safeSegment(input.projectId);
  const sessionId = input.sessionId ? safeSegment(input.sessionId) : "project";
  const revision = Number.isInteger(input.revision) ? `r${input.revision}` : "snapshot";
  const key = [
    "users",
    ownerHash,
    "projects",
    projectId,
    "runtime",
    sessionId,
    input.category,
    `${revision}-${crypto.randomUUID()}.json`,
  ].join("/");
  await (await objectStorage()).put(key, text, {
    httpMetadata: { contentType: "application/json; charset=utf-8" },
    customMetadata: {
      sha256: digest,
      byteLength: String(byteLength),
      format: "RELAY_NEXUS_R2_JSON_V1",
    },
  });
  return { key, sha256: digest, byteLength };
}

export async function readRuntimeJsonText(
  row: StoredJsonRow,
  fields: {
    inline: string;
    key: string;
    sha256: string;
    byteLength: string;
  },
): Promise<string> {
  const key = String(row[fields.key] ?? "").trim();
  if (!key) {
    const inline = String(row[fields.inline] ?? "");
    JSON.parse(inline);
    return inline;
  }
  const object = await (await objectStorage()).get(key);
  if (!object) throw new Error("온라인 저장소에서 세션 본문을 찾지 못했습니다.");
  const bytes = new Uint8Array(await object.arrayBuffer());
  const expectedBytes = Number(row[fields.byteLength] ?? 0);
  if (expectedBytes > 0 && bytes.byteLength !== expectedBytes) {
    throw new Error("온라인 세션 본문의 크기 검증에 실패했습니다.");
  }
  const expectedHash = String(row[fields.sha256] ?? "").trim().toLowerCase();
  if (expectedHash && (await sha256(bytes)) !== expectedHash) {
    throw new Error("온라인 세션 본문의 SHA-256 검증에 실패했습니다.");
  }
  const text = new TextDecoder().decode(bytes);
  JSON.parse(text);
  return text;
}

export const readProjectPackText = (row: StoredJsonRow) =>
  readRuntimeJsonText(row, {
    inline: "pack_json",
    key: "pack_r2_key",
    sha256: "pack_sha256",
    byteLength: "pack_byte_length",
  });

export const readSessionSnapshotText = (row: StoredJsonRow) =>
  readRuntimeJsonText(row, {
    inline: "snapshot_json",
    key: "snapshot_r2_key",
    sha256: "snapshot_sha256",
    byteLength: "snapshot_byte_length",
  });

export const readCheckpointSnapshotText = (row: StoredJsonRow) =>
  readRuntimeJsonText(row, {
    inline: "snapshot_json",
    key: "snapshot_r2_key",
    sha256: "snapshot_sha256",
    byteLength: "snapshot_byte_length",
  });

export async function deleteRuntimeObject(key: string | null | undefined) {
  if (!key) return;
  await (await objectStorage()).delete(key);
}

const deleteRuntimePrefix = async (prefix: string) => {
  const bucket = await objectStorage();
  let cursor: string | undefined;
  do {
    const listed = await bucket.list({ prefix, cursor, limit: 1000 });
    if (listed.objects.length) {
      // Room snapshots/media are immutable and may also back other participants'
      // personal continuations. Deleting the source work must not revoke them.
      const disposable=listed.objects.map((object: {key: string}) => object.key).filter((key:string)=>!key.includes('/runtime/multiplayer-'));
      if(disposable.length)await bucket.delete(disposable);
    }
    cursor = listed.truncated ? listed.cursor : undefined;
  } while (cursor);
};

export async function deleteProjectRuntimeObjects(ownerKey: string, projectId: string) {
  const ownerHash = await ownerPathHash(ownerKey);
  const prefix = `users/${ownerHash}/projects/${safeSegment(projectId)}/runtime/`;
  await deleteRuntimePrefix(prefix);
}

export async function deleteSessionRuntimeObjects(
  ownerKey: string,
  projectId: string,
  sessionId: string,
) {
  const ownerHash = await ownerPathHash(ownerKey);
  const prefix = `users/${ownerHash}/projects/${safeSegment(projectId)}/runtime/${safeSegment(sessionId)}/`;
  await deleteRuntimePrefix(prefix);
}
