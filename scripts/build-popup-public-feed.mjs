import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const INTERNAL_FIELDS = new Set([
  'contentSearch', 'menuCandidates', 'imageCandidates', 'imageValidation',
  'qualityReasons', 'lastContentCheckedAt', 'ocrStatus', 'imageOriginalUrl',
  'sourceItemId', 'officialUrl'
]);

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
      .map(row => Object.fromEntries(Object.entries(row).filter(([key]) => !INTERNAL_FIELDS.has(key))))
  };
  await writeFile(outputPath, `${JSON.stringify(payload)}\n`);
  return payload;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  await buildPopupPublicFeed();
}
