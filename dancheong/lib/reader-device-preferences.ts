/** Device-local reading preferences shared by the single and multiplayer shells. */
export function readerDevicePreferences(){
  let saved:Record<string,unknown>={};
  try{saved=JSON.parse(localStorage.getItem('relay-nexus-appearance-v1')||'{}')}catch{}
  const choose=(value:unknown,allowed:string[],fallback:string)=>typeof value==='string'&&allowed.includes(value)?value:fallback;
  return {
    theme:choose(saved.theme,['light','dark'],typeof matchMedia==='function'&&matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light'),
    readingWidth:choose(saved.readingWidth,['narrow','normal','wide'],'normal'),
    fontSize:choose(saved.readingFontSize,['small','medium','large'],'small'),
    typingSpeed:choose(saved.typingSpeed,['slow','natural','fast','instant'],'natural'),
  };
}
