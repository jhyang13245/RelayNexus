// Monotonic clock: changing the device clock cannot jump a server turn deadline.
export function createRoomClock(mono=()=>performance.now(),wall=()=>Date.now()){
 let anchor:{server:number;mono:number}|null=null;
 return {sample(server:unknown,started:number){const end=mono(),rtt=end-started;if(typeof server!=='number'||!Number.isFinite(server)||server<=0||rtt<0||rtt>5000)return;anchor={server:server+rtt/2,mono:end}},now:()=>anchor?anchor.server+mono()-anchor.mono:wall()};
}
export function roomPollDelay(generating:boolean,ownGeneration:boolean,watchingTurn=false){return generating&&!ownGeneration?800:watchingTurn&&!ownGeneration?1200:2500}
// Self presence is refreshed on every read; it does not change anything rendered
// in the reader. Preserve every other field, including other members' presence.
export function sameReaderRoom(a:any,b:any){
 const key=(room:any)=>JSON.stringify(room?{...room,members:room.members.map((member:any)=>member.isSelf?{...member,lastSeenAt:''}:member)}:room);
 return key(a)===key(b);
}
// A single status/chat/live request chain; slow requests cannot accumulate timers.
export function scheduleRoomPoll(work:()=>Promise<unknown>,delay:()=>number,visible:()=>boolean,timers={set:(fn:()=>void,ms:number)=>setTimeout(fn,ms),clear:(id:ReturnType<typeof setTimeout>)=>clearTimeout(id)}){
 let stopped=false,running=false,timer:ReturnType<typeof setTimeout>|undefined,again=false;
 const cancel=()=>{if(timer!==undefined)timers.clear(timer);timer=undefined};
 const run=async()=>{cancel();if(stopped||!visible())return;if(running){again=true;return}running=true;try{await work()}finally{running=false;if(!stopped&&visible()){const wait=again?0:delay();again=false;timer=timers.set(()=>void run(),wait)}}};
 return {wake:()=>void run(),suspend:()=>{again=false;cancel()},stop:()=>{stopped=true;cancel()}};
}
