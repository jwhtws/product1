import { writeFile } from 'node:fs/promises';

const endpoint = 'https://overpass.kumi.systems/api/interpreter';
const query = `[out:json][timeout:240];
area(3600307756)->.kr;
(
  relation[route=subway](area.kr);
  relation[route=light_rail](area.kr);
  relation[route=train][service=commuter](area.kr);
);
out tags;`;

const response = await fetch(endpoint, {
  method: 'POST',
  headers: { 'content-type': 'application/x-www-form-urlencoded;charset=UTF-8', 'user-agent': 'Mukdang transit map builder/1.0 (https://mukdang.com)' },
  body: new URLSearchParams({ data: query })
});
if (!response.ok) throw new Error(`Overpass ${response.status}: ${await response.text()}`);
const payload = await response.json();
const features = [];
const routeKeys = new Set();

const simplify = geometry => {
  const points = geometry.map(point => [Number(point.lon.toFixed(5)), Number(point.lat.toFixed(5))]);
  if (points.length <= 2) return points;
  const result = [points[0]];
  for (let index = 1; index < points.length - 1; index += 1) {
    const previous = result.at(-1), current = points[index];
    if (Math.abs(current[0] - previous[0]) + Math.abs(current[1] - previous[1]) >= .0012) result.push(current);
  }
  result.push(points.at(-1));
  return result;
};
const validColour = value => /^#[0-9a-f]{6}$/iu.test(value || '') ? value.toUpperCase() : '#667085';

const selectedRoutes = [];
for (const element of payload.elements || []) {
  if (element.type !== 'relation') continue;
  const tags = element.tags || {};
  const ref = String(tags.ref || '').trim();
  const name = String(tags['name:ko'] || tags.name || ref || '철도').replace(/\s*[:：].*$/u, '');
  const colour = validColour(tags.colour);
  const routeKey = `${tags.network || ''}|${ref || name}|${colour}`;
  if (!ref || routeKeys.has(routeKey)) continue;
  routeKeys.add(routeKey);
  selectedRoutes.push({ id: element.id, tags, ref, name, colour });
}

for (let index = 0; index < selectedRoutes.length; index += 3) {
  const batch = selectedRoutes.slice(index, index + 3);
  const fullRoutes = await Promise.all(batch.map(async route => {
    const fullResponse = await fetch(`https://api.openstreetmap.org/api/0.6/relation/${route.id}/full.json`, { headers: { 'user-agent': 'Mukdang transit map builder/1.0 (https://mukdang.com)' } });
    if (!fullResponse.ok) throw new Error(`OSM relation ${route.id}: ${fullResponse.status}`);
    return { route, payload: await fullResponse.json() };
  }));
  for (const { route, payload: full } of fullRoutes) {
    const nodes = new Map(full.elements.filter(item => item.type === 'node').map(item => [item.id, { lat: item.lat, lon: item.lon }]));
    const relation = full.elements.find(item => item.type === 'relation' && item.id === route.id);
    const memberWays = new Set((relation?.members || []).filter(member => member.type === 'way').map(member => member.ref));
    const segments = full.elements.filter(item => item.type === 'way' && memberWays.has(item.id)).map(way => ({
      geometry: (way.nodes || []).map(nodeId => nodes.get(nodeId)).filter(Boolean)
    })).filter(member => member.geometry.length > 1);
    for (const member of segments) {
    features.push({
      type: 'Feature',
      properties: { kind: route.tags.route === 'train' ? 'commuter' : 'subway', ref: route.ref, name: route.name, colour: route.colour },
      geometry: { type: 'LineString', coordinates: simplify(member.geometry) }
    });
    }
    if (segments.length) {
    const longest = segments.reduce((best, member) => member.geometry.length > best.geometry.length ? member : best, segments[0]);
    const midpoint = longest.geometry[Math.floor(longest.geometry.length / 2)];
    features.push({
      type: 'Feature',
      properties: { kind: 'label', ref: route.ref, name: route.name, colour: route.colour },
      geometry: { type: 'Point', coordinates: [Number(midpoint.lon.toFixed(5)), Number(midpoint.lat.toFixed(5))] }
    });
    }
  }
}

const output = { type: 'FeatureCollection', generatedAt: new Date().toISOString(), source: 'OpenStreetMap Overpass · ODbL', features };
await writeFile('data/korea-transit-lines.geojson', `${JSON.stringify(output)}\n`);
console.log(`철도 노선 ${features.filter(item => item.properties.kind !== 'label').length}개 · 노선표시 ${features.filter(item => item.properties.kind === 'label').length}개`);
