// Creation is the only place that chooses a room's reader. Old rooms stay novel.
export function roomPresentation(engine: unknown, mode: unknown): 'novel' | 'visual' {
  return engine === 'cortex' && mode === 'visual' ? 'visual' : 'novel';
}

export async function readSubmittedInput(db: any, roomId: string) {
  const row = await db.prepare("SELECT id,actor_display_name,detail_json,created_at FROM multiplayer_room_events WHERE room_id=? AND type='CORTEX_INPUT_ACCEPTED' AND created_at>? ORDER BY created_at DESC LIMIT 1")
    .bind(roomId, new Date(Date.now() - 10000).toISOString()).first();
  if (!row) return null;
  try { const detail = JSON.parse(row.detail_json); return { id: String(row.id), name: String(row.actor_display_name), text: String(detail.input || '').slice(0,12000), createdAt: String(row.created_at) }; }
  catch { return null; }
}
