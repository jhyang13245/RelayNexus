"use client";
import {useEffect} from "react";

// Pointer feedback also works in touch browsers that omit CSS :active.
export function useMultiplayerPressFeedback(){
 useEffect(()=>{
  let pressed:HTMLElement|null=null,timer:ReturnType<typeof setTimeout>|undefined;
  const clear=()=>{clearTimeout(timer);pressed?.removeAttribute('data-mp-pressed');pressed=null;};
  const down=(event:PointerEvent)=>{clear();const button=event.target instanceof Element?event.target.closest<HTMLElement>('button,a,summary'):null;if(!button||!button.closest('.multiplayer-page,.cortex-multiplayer-reader,.dancheong-room-chat,.mp-key-dialog')||button.matches(':disabled,[aria-disabled="true"]'))return;pressed=button;button.setAttribute('data-mp-pressed','');};
  const up=()=>{timer=setTimeout(clear,120)};
  document.addEventListener('pointerdown',down,true);window.addEventListener('pointerup',up,true);window.addEventListener('pointercancel',clear,true);window.addEventListener('scroll',clear,true);window.addEventListener('blur',clear);
  return()=>{clear();document.removeEventListener('pointerdown',down,true);window.removeEventListener('pointerup',up,true);window.removeEventListener('pointercancel',clear,true);window.removeEventListener('scroll',clear,true);window.removeEventListener('blur',clear);};
 },[]);
}
