// Injected inside the pinned Cortex closure by build-cortex.mjs. The original
// vendor file stays unchanged. Use its revision-checked writer and conflict
// isolation; never discard saves/media or continue from a failed restore.
async function retryStorageVN() {
  if (busy) return { ok: false, code: 'RECOVERY_BUSY' };
  if (restoreFailedV1390) return { ok: false, code: 'RESTORE_REQUIRED' };
  if (!storageBlockedV1390) return { ok: true, skipped: true };
  busy = true;
  const failure = clone(storageFailureV1396);
  const turn = turns.find(row => row.id === failure?.turnId) || turns.at(-1);
  const committed = turn?.status === 'COMMITTED' ? turn : null;
  try {
    await persistenceQueueV1363;
    storageBlockedV1390 = false;
    const result = await persist({ committedTurnId: committed?.id });
    if (!result.ok) throw new Error(result.code || 'PERSIST_FAILED');
    if (committed) {
      committed.metrics = committed.metrics || {};
      committed.metrics.persistence = { ...committed.metrics.persistence, status: 'SAVED', sequence: result.sequence, savedAt: result.savedAt };
      committed.metrics.lifecycle = { ...committed.metrics.lifecycle, stage: 'DURABLE', at: result.savedAt };
    }
    storageFailureV1396 = { ...failure, ...storageFailureV1396, resolvedAt: new Date().toISOString(), resolution: result.recovery?.resolution || 'AUTO_RETRY_SAVED' };
    $('recoveryNotice').hidden = true;
    return result;
  } catch (error) {
    storageFailureV1396 = { ...failure, ...storageFailureV1396, code: String(error?.message || 'PERSIST_FAILED'), saveError: String(error?.message || 'PERSIST_FAILED') };
    storageNoticeV1390('저장을 자동으로 복구하고 있습니다. 본문은 그대로 보존됩니다.');
    return { ok: false, code: storageFailureV1396.code };
  } finally { busy = false; syncSameTurnUiV13914(); renderTelemetry(); }
}
