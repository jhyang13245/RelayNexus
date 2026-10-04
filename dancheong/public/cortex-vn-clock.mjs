// Story metadata only. Do not advance this clock using device time or the
// environment plate's deliberately held lighting/time cache.
export function storyClockLabel({page,turns=[],scenario,openingWorld}={}) {
  let world=scenario?.world, pending=false;
  if(page?.turnIndex<0) world=openingWorld || (!turns.length ? world : null);
  else if(Number.isInteger(page?.turnIndex)) {
    const turn=turns[page.turnIndex];
    const latest=page.turnIndex===turns.length-1;
    pending=Boolean(turn && turn.status!=='COMMITTED');
    world=latest ? (pending ? scenario?.world : turn?.vnScene?.world || scenario?.world) : turn?.vnScene?.world;
  }
  const time=typeof world?.time==='string' ? world.time.trim() : '';
  const day=typeof world?.day==='number' && Number.isFinite(world.day) ? `D${world.day>=0?'+':''}${world.day}` : '';
  return `${pending?'마지막 확인 · ':''}${[day,time].filter(Boolean).join(' · ') || '시간 미정'}`;
}
export function updateStoryClock(element,context) {
  if(!element)return;
  const label=storyClockLabel(context);
  const prefix='마지막 확인 · ', pending=label.startsWith(prefix);
  const caption=pending?'작중 · 마지막 확인':'작중 시간';
  if(element.querySelector('span').textContent!==caption)element.querySelector('span').textContent=caption;
  const time=pending?label.slice(prefix.length):label;
  const value=element.querySelector('strong');
  if(value.textContent!==time)value.textContent=time;
  if(element.title!==`작중 시간 · ${label}`)element.title=`작중 시간 · ${label}`;
}
