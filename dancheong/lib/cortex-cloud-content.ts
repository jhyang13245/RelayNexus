// Equality is deliberately conservative: no turn-count, name or timestamp heuristics.
// These are device presentation/transport fields, not narrative/HUD/memory state.
export function cloudContentText(snapshot:Record<string,any>):string {
 const {exportedAt,storageDiagnostics,settings,...content}=snapshot;
 const {baseUrl,model,fontSize,typingSpeed,imageQuality,...storySettings}=settings||{};
 const sorted=(value:any):any=>Array.isArray(value)?value.map(sorted):value&&typeof value==='object'
  ?Object.fromEntries(Object.keys(value).sort().map(key=>[key,sorted(value[key])])):value;
 return JSON.stringify(sorted({...content,settings:storySettings}));
}
export function sameCloudContent(a:Record<string,any>,b:Record<string,any>):boolean {
 return cloudContentText(a)===cloudContentText(b);
}
