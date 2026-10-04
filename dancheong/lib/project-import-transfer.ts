export const PROJECT_IMPORT_INLINE_BODY_BUDGET_BYTES = 640 * 1024;
export const PROJECT_IMPORT_FORMDATA_HEADROOM_BYTES = 32 * 1024;

const utf8ByteLength = (value: string) => new TextEncoder().encode(value).byteLength;

export function serializeProjectImport<
  TPack,
  TSnapshot extends { pack: TPack },
>(fileSize: number, pack: TPack, snapshot: TSnapshot, auxiliaryBytes = 0) {
  const { pack: _embeddedPack, ...snapshotWithoutPack } = snapshot;
  void _embeddedPack;
  const packJson = JSON.stringify(pack);
  const snapshotJson = JSON.stringify(snapshotWithoutPack);
  const metadataBytes = utf8ByteLength(packJson) + utf8ByteLength(snapshotJson);
  const estimatedInlineBodyBytes =
    fileSize + metadataBytes + Math.max(0, auxiliaryBytes) +
    PROJECT_IMPORT_FORMDATA_HEADROOM_BYTES;

  return {
    packJson,
    snapshotJson,
    metadataBytes,
    estimatedInlineBodyBytes,
    usesMultipartUpload:
      estimatedInlineBodyBytes > PROJECT_IMPORT_INLINE_BODY_BUDGET_BYTES,
  };
}

export function hydrateProjectImportSnapshot<
  TPack,
  TSnapshot extends Record<string, unknown>,
>(pack: TPack, snapshotWithoutPack: TSnapshot) {
  return {
    ...snapshotWithoutPack,
    pack,
  };
}
