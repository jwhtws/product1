import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const INTERNAL_FIELDS = new Set([
  'contentSearch', 'menuCandidates', 'imageCandidates', 'imageValidation',
  'qualityReasons', 'lastContentCheckedAt', 'ocrStatus', 'imageOriginalUrl',
  'sourceItemId', 'officialUrl', 'editorialEvidence', 'editorialSource',
  'editorialDescription', 'editorialVerifiedAt', 'menuItems', 'image'
]);

function publicPopup(row) {
  const popup = Object.fromEntries(Object.entries(row).filter(([key]) => !INTERNAL_FIELDS.has(key)));
  popup.imageUrl ||= row.image || '';
  popup.menus = (Array.isArray(row.menus) ? row.menus : [])
    .map(item => typeof item === 'string' ? { name: item } : { name: item?.name || '', price: item?.price || '' })
    .filter(item => item.name)
    .slice(0, 20);
  return popup;
}

export async function buildPopupPublicFeed({
  inputPath = 'data/popups.json',
  outputPath = 'data/popups-public.json'
} = {}) {
  const source = JSON.parse(await readFile(inputPath, 'utf8'));
  const payload = {
    updatedAt: source.updatedAt,
    feedVersion: source.feedVersion,
    popups: (source.popups || [])
      .filter(row => (!row.publishStatus || row.publishStatus === 'published'))
      .map(publicPopup)
  };
  await writeFile(outputPath, `${JSON.stringify(payload)}\n`);
  return payload;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  await buildPopupPublicFeed();
}
