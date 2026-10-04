/* Local computation only. No network, storage, model calls or engine mutations. */
self.onmessage = async ({data}) => {
  try {
    const sorted = value => Array.isArray(value) ? value.map(sorted) : value && typeof value === 'object'
      ? Object.fromEntries(Object.keys(value).sort().map(key => [key, sorted(value[key])])) : value;
    const bytes = new TextEncoder().encode(JSON.stringify(sorted(data.content)));
    const hash = await crypto.subtle.digest('SHA-256', bytes);
    self.postMessage({id:data.id,key:'v1:'+Array.from(new Uint8Array(hash), b=>b.toString(16).padStart(2,'0')).join('')});
  } catch { self.postMessage({id:data.id,error:true}); }
};
