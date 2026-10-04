// Shared by standalone chat requests and the combined room heartbeat.
export async function readMultiplayerChat(db:any,roomId:string,accountId:string,after=0){
  const cursor=Number.isSafeInteger(after)&&after>0?after:0;
  const rows=await db.prepare(cursor ? 'SELECT * FROM multiplayer_chat_messages WHERE room_id=? AND seq>? ORDER BY seq ASC LIMIT 100' : 'SELECT * FROM (SELECT * FROM multiplayer_chat_messages WHERE room_id=? AND seq>? ORDER BY seq DESC LIMIT 100) ORDER BY seq ASC').bind(roomId,cursor).all();
  return (rows.results||[]).map((m:any)=>({seq:m.seq,clientId:m.account_id===accountId?m.client_id:undefined,name:m.display_name,body:m.body,createdAt:m.created_at,isSelf:m.account_id===accountId}));
}
