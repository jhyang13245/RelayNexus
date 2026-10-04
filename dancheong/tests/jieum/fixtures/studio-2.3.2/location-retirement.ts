import type { Project } from './studio-model';

/** Retired location IDs are read only to recover authored names, never to infer a route. */
export function retireLocationGraph(project: Project): Project {
  if (project.packageTarget !== 'cortex') return project;
  const nodes = project.locationGraph?.nodes || [];
  const label = (ref: string) => nodes.find(n => n.locationRef === ref)?.label || '';
  const world = { ...project.world };
  if (!world.location && world.locationEntityRef) world.location = label(world.locationEntityRef);
  delete world.locationEntityRef;
  // Keep descriptive prose in the existing world notes; discard adjacency and IDs.
  const descriptions = nodes.map(n => [n.label, (n as {description?: string}).description].filter(Boolean).join(': ')).filter(Boolean);
  if (descriptions.length) {
    const note = `장소 배경: ${[...new Set(descriptions)].join(' / ')}`;
    if (!(world.fixedCanon || '').includes(note)) world.fixedCanon = [world.fixedCanon, note].filter(Boolean).join('\n\n');
  }
  return { ...project, world, package15: { ...project.package15, requiredFeatures: project.package15.requiredFeatures.filter(f => String(f) !== "location_graph_v1"), optionalFeatures: project.package15.optionalFeatures.filter(f => String(f) !== "location_graph_v1") }, locationGraph: { schema:'CORTEX_LOCATION_GRAPH_V1',nodes:[],links:[] },
    events: project.events.map(e => {
      const observation = [...new Set((e.observationLocationRefs || []).map(label).filter(Boolean))];
      const related = (e.locations || []).map(n => n.label || label(n.locationRef)).filter(Boolean);
      const notes = [observation.length ? `관측 장면 배경: ${observation.join(', ')}` : '', related.length ? `관련 장면 배경: ${[...new Set(related)].join(', ')}` : ''].filter(Boolean).join('\n');
      const { locationEntityRef: _old, ...event } = e as typeof e & {locationEntityRef?:string};
      return { ...event, canonLocation: e.canonLocation || label(e.canonLocationRef),
        description: notes && !e.description.includes(notes) ? [e.description,notes].filter(Boolean).join('\n\n') : e.description,
        canonLocationRef:'', locationAliases:[], locations:[], transitionLocationRefs:[], observationLocationRefs:[] };
    }) };
}

/** Export retired fields neither in runtime JSON nor in editor snapshots. Preserve Blobs by identity. */
export function omitRetiredLocationFields<T>(value: T): T {
  if (!value || typeof value !== 'object' || value instanceof Blob) return value;
  if (Array.isArray(value)) return value.map(omitRetiredLocationFields) as T;
  const retired = new Set(['locationGraph','locationRef','canonLocationRef','locationEntityRef','locationAliases','transitionLocationRefs','observationLocationRefs']);
  return Object.fromEntries(Object.entries(value).filter(([key, v]) => !retired.has(key) && !(key === 'locations' && Array.isArray(v) && v.every(n => n && typeof n === 'object' && 'locationRef' in n))).map(([key,v]) => [key,omitRetiredLocationFields(v)])) as T;
}
