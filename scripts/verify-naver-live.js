const fs = require('fs');
const path = require('path');

const baseUrl = process.argv[2];
const perRegion = Number(process.argv[3] || 2);
if (!baseUrl) throw new Error('배포 URL이 필요합니다.');

const previews = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data', 'restaurants', 'previews.json'), 'utf8'));
const samples = Object.entries(previews).flatMap(([region, rows]) =>
  rows.slice(0, perRegion).map(restaurant => ({ region, ...restaurant }))
);
const key = value => String(value || '').toLocaleLowerCase('ko-KR').replace(/[^\p{L}\p{N}]+/gu, '');
const addressKey = value => key(value).slice(0, 14);

(async () => {
  const results = [];
  for (const restaurant of samples) {
    const query = new URLSearchParams({ name: restaurant.name, address: restaurant.address });
    try {
      const response = await fetch(`${baseUrl}/api/restaurant?${query}`);
      const data = await response.json();
      const nameMatch = data.found && (key(data.displayName).includes(key(restaurant.name)) || key(restaurant.name).includes(key(data.displayName)));
      const addressMatch = data.found && (key(data.formattedAddress).includes(addressKey(restaurant.address)) || key(restaurant.address).includes(addressKey(data.formattedAddress)));
      results.push({
        region: restaurant.region,
        requested: restaurant.name,
        matched: data.displayName || null,
        status: response.status,
        nameMatch: Boolean(nameMatch),
        addressMatch: Boolean(addressMatch),
        photo: Boolean(data.photoUrl)
      });
    } catch (error) {
      results.push({ region: restaurant.region, requested: restaurant.name, status: 0, error: error.message });
    }
  }
  const summary = {
    total: results.length,
    found: results.filter(row => row.status === 200).length,
    nameMatched: results.filter(row => row.nameMatch).length,
    addressMatched: results.filter(row => row.addressMatch).length,
    withPhoto: results.filter(row => row.photo).length,
    failures: results.filter(row => row.status !== 200 || !row.nameMatch || !row.addressMatch)
  };
  console.log(JSON.stringify(summary, null, 2));
  if (summary.failures.length) process.exitCode = 1;
})();
