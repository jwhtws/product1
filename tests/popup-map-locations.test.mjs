import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { popupMapLocations } from '../js/popup-map-locations.js';

test('활성 팝업 지점은 검증 좌표 원장에 있고 좌표가 서로 뒤바뀌지 않는다', async () => {
  const feed = JSON.parse(await readFile('data/popups.json', 'utf8'));
  const today = '2026-08-17';
  const active = feed.popups.filter(popup => (!popup.startDate || popup.startDate <= today) && (!popup.endDate || popup.endDate >= today));
  const venues = [...new Set(active.map(popup => popup.venue))];
  assert.deepEqual(venues.filter(venue => !popupMapLocations.has(venue)), []);
  const points = venues.map(venue => popupMapLocations.get(venue)).map(point => `${point.latitude.toFixed(5)},${point.longitude.toFixed(5)}`);
  assert.equal(new Set(points).size, points.length);
  assert.deepEqual(popupMapLocations.get('롯데백화점 본점'), { latitude: 37.5649826, longitude: 126.9818747, name: '롯데백화점 본점' });
  assert.deepEqual(popupMapLocations.get('롯데백화점 미아점'), { latitude: 37.6145723, longitude: 127.0305114, name: '롯데백화점 미아점' });
});
