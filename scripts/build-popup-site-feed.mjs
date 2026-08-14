import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { calculatePopupStatus, daysBetween, seoulDate } from './lib/popup-content-quality.mjs';

export const SITE_FEED_FIELDS = Object.freeze([
  'id', 'title', 'brand', 'venue', 'branch', 'address', 'latitude', 'longitude',
  'category', 'status', 'startDate', 'endDate', 'dDay', 'image', 'officialUrl',
  'sourceName', 'sourceItemId', 'tags', 'isNew', 'isEndingSoon', 'lastUpdated'
]);

const VALUE_REQUIRED = Object.freeze([
  'id', 'title', 'brand', 'venue', 'branch', 'address', 'category', 'status',
  'startDate', 'officialUrl', 'sourceName', 'sourceItemId', 'lastUpdated'
]);
const STATUS = new Set(['upcoming', 'ongoing', 'ended']);
const MANUALLY_EXCLUDED_POPUP_IDS = new Set([
  'lotte:discovered:0002:SNM00000000000548809', // 식품닷: 비식품 팝업
  'lotte:discovered:0399:SNM00000000000549036', // 컵빙수의 정석: 요아정 컵빙수 중복
  'lotte:discovered:0349:SNM00000000000549702' // 주얼리: 비식품 팝업
]);

const clean = value => String(value ?? '').replace(/<[^>]*>/gu, ' ').replace(/\s+/gu, ' ').trim();
const normalizeKey = value => clean(value).normalize('NFKC').replace(/[\s·.,()[\]{}'"`~!@#$%^&*+_=|:;?<>/\\-]/gu, '').toLowerCase();

export function normalizeFeedDate(value) {
  const match = clean(value).match(/^(20\d{2})[.\-/년]\s*(\d{1,2})[.\-/월]\s*(\d{1,2})(?:일)?$/u);
  if (!match) return '';
  const normalized = `${match[1]}-${String(match[2]).padStart(2, '0')}-${String(match[3]).padStart(2, '0')}`;
  const date = new Date(`${normalized}T00:00:00Z`);
  return Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== normalized ? '' : normalized;
}

export function popupFeedStatus(startDate, endDate, today) {
  return calculatePopupStatus({ startDate, endDate }, today);
}

function normalizeBrand(row) {
  return clean(row.brand || row.title || row.name)
    .replace(/^(?:\(주\)|㈜|주식회사)\s*/u, '')
    .replace(/^\[(?:POP[\s-]*UP(?:\s*STORE)?|팝업(?:스토어)?|디저트\s*카라반|푸드파크)\]\s*/iu, '')
    .replace(/\s*(?:POP[\s-]*UP(?:\s*STORE)?|팝업(?:스토어)?|신규\s*오픈|NEW\s*OPEN|NOW\s*OPEN|OPEN)\s*$/iu, '')
    .replace(/^\[([^\]]+)\]$/u, '$1') || clean(row.name);
}

function normalizeCategory(value) {
  const category = clean(value).toLowerCase();
  if (!category || /food|푸드|식품|음식/u.test(category)) return 'food-popup';
  return category.replace(/[\s_]+/gu, '-');
}

function sourceItemId(row) {
  const explicit = clean(row.sourceItemId);
  if (explicit) return explicit;
  const id = clean(row.id);
  return id.includes(':') ? id.slice(id.indexOf(':') + 1) : id;
}

function normalizeTags(row, brand, venue, category) {
  const values = [
    ...(Array.isArray(row.tags) ? row.tags : []), brand, venue, clean(row.branch),
    clean(row.region), clean(row.venueType), category,
    ...(Array.isArray(row.menuItems) ? row.menuItems.slice(0, 5) : [])
  ].map(clean).filter(Boolean);
  return [...new Map(values.map(value => [normalizeKey(value), value])).values()].slice(0, 16);
}

function reject(stats, reason) {
  stats.rejectionReasons[reason] = (stats.rejectionReasons[reason] || 0) + 1;
  stats.rejectedCount += 1;
}

function feedRow(row, { today, generatedAt }) {
  const title = clean(row.name || row.title);
  const brand = normalizeBrand(row);
  const venue = clean(row.venue);
  const branch = clean(row.branch || venue);
  const address = clean(row.address);
  const startDate = normalizeFeedDate(row.startDate);
  const endDate = normalizeFeedDate(row.endDate) || null;
  const officialUrl = clean(row.sourceUrl || row.officialUrl);
  const image = clean(row.image || row.imageUrl || row.officialImageUrls?.[0]) || null;
  const category = normalizeCategory(row.category);
  const status = startDate ? popupFeedStatus(startDate, endDate, today) : '';
  const dDay = status === 'upcoming' ? daysBetween(today, startDate) : endDate ? daysBetween(today, endDate) : null;
  const firstSeenAt = normalizeFeedDate(row.firstSeenAt || row.registeredAt || row.createdAt);
  const age = firstSeenAt ? daysBetween(firstSeenAt, today) : null;
  const endingIn = endDate ? daysBetween(today, endDate) : null;
  const latitude = row.latitude !== null && row.latitude !== undefined && row.latitude !== '' && Number.isFinite(Number(row.latitude)) ? Number(row.latitude) : null;
  const longitude = row.longitude !== null && row.longitude !== undefined && row.longitude !== '' && Number.isFinite(Number(row.longitude)) ? Number(row.longitude) : null;
  return {
    ...row,
    id: clean(row.id), title, name: title, brand, venue, branch, address,
    latitude, longitude, category, status, startDate, endDate, dDay,
    image, officialUrl, sourceName: clean(row.sourceName), sourceItemId: sourceItemId(row),
    tags: normalizeTags(row, brand, venue, category),
    isNew: age !== null && age >= 0 && age <= 7,
    isEndingSoon: status === 'ongoing' && endingIn >= 0 && endingIn <= 3,
    lastUpdated: clean(row.lastUpdated || row.lastSeenAt || row.lastVerifiedAt || generatedAt),
    // 기존 Site 소비자와 SEO 생성기의 하위 호환 필드다.
    imageUrl: row.imageUrl ?? null,
    sourceUrl: clean(row.sourceUrl || row.officialUrl)
  };
}

function invalidReason(row) {
  for (const field of SITE_FEED_FIELDS) if (!(field in row)) return `missing_field_${field}`;
  for (const field of VALUE_REQUIRED) if (row[field] === null || row[field] === undefined || row[field] === '') return `missing_value_${field}`;
  if (!Array.isArray(row.tags)) return 'invalid_tags';
  if (!STATUS.has(row.status)) return 'invalid_status';
  if (!row.startDate || (row.endDate && row.endDate < row.startDate)) return 'invalid_date';
  if (row.dDay !== null && !Number.isInteger(row.dDay)) return 'invalid_d_day';
  if (!/^https:\/\//u.test(row.officialUrl)) return 'invalid_official_url';
  if (row.image !== null && !/^https:\/\//u.test(row.image)) return 'invalid_image_url';
  if ((row.latitude === null) !== (row.longitude === null)) return 'incomplete_coordinates';
  return '';
}

function preferredRow(current, candidate) {
  const score = row => Number(row.sourceGrade === 'official') * 8
    + Number(row.contentQuality === 'A') * 4 + Number(Boolean(row.image)) * 2 + Number(Boolean(row.latitude));
  return score(candidate) > score(current) ? candidate : current;
}

export function buildSiteFeedPayload(payload, options = {}) {
  const today = options.today || seoulDate();
  const generatedAt = options.generatedAt || new Date().toISOString();
  const inputRows = Array.isArray(payload?.popups) ? payload.popups : [];
  const stats = {
    inputCount: inputRows.length, outputCount: 0, rejectedCount: 0,
    qualityExcludedCount: 0, duplicateRemovedCount: 0, rejectionReasons: {}
  };
  const byId = new Map();
  for (const raw of inputRows) {
    if (MANUALLY_EXCLUDED_POPUP_IDS.has(clean(raw.id))) {
      reject(stats, 'manually_excluded');
      continue;
    }
    if (raw.publishStatus !== 'published' || !['A', 'B'].includes(raw.contentQuality)) {
      reject(stats, raw.publishStatus === 'rejected' ? 'quality_rejected' : 'quality_review_required');
      stats.qualityExcludedCount += 1;
      continue;
    }
    const row = feedRow(raw, { today, generatedAt });
    const reason = invalidReason(row);
    if (reason) { reject(stats, reason); continue; }
    if (byId.has(row.id)) {
      reject(stats, 'duplicate_id');
      stats.duplicateRemovedCount += 1;
      byId.set(row.id, preferredRow(byId.get(row.id), row));
      continue;
    }
    byId.set(row.id, row);
  }
  const byIdentity = new Map();
  for (const row of byId.values()) {
    const identity = `${normalizeKey(row.brand)}|${normalizeKey(row.venue)}|${row.startDate}|${row.endDate}`;
    if (byIdentity.has(identity)) {
      reject(stats, 'duplicate_identity');
      stats.duplicateRemovedCount += 1;
      byIdentity.set(identity, preferredRow(byIdentity.get(identity), row));
      continue;
    }
    byIdentity.set(identity, row);
  }
  const statusRank = { ongoing: 0, upcoming: 1, ended: 2 };
  const popups = [...byIdentity.values()].sort((left, right) =>
    statusRank[left.status] - statusRank[right.status]
    || (left.status === 'ended' ? right.endDate.localeCompare(left.endDate) : left.startDate.localeCompare(right.startDate))
    || left.title.localeCompare(right.title, 'ko')
  );
  const statusDistribution = Object.fromEntries(['upcoming', 'ongoing', 'ended'].map(status => [status, popups.filter(row => row.status === status).length]));
  Object.assign(stats, {
    outputCount: popups.length,
    statusDistribution,
    newCount: popups.filter(row => row.isNew).length,
    endingSoonCount: popups.filter(row => row.isEndingSoon).length,
    missingImageCount: popups.filter(row => row.image === null).length,
    missingMenuCount: popups.filter(row => !row.menus?.length).length,
    missingCoordinateCount: popups.filter(row => row.latitude === null || row.longitude === null).length,
    generatedAt
  });
  return {
    feed: {
      ...payload,
      feedVersion: 1,
      updatedAt: generatedAt,
      stats: {
        ...(payload?.stats || {}), final: popups.length, status: statusDistribution,
        photos: {
          popupCount: popups.filter(row => row.officialImageUrls?.length).length,
          imageCount: popups.reduce((sum, row) => sum + (row.officialImageUrls?.length || 0), 0),
          missingCount: popups.filter(row => !row.officialImageUrls?.length).length
        },
        siteFeed: stats
      },
      popups
    },
    stats
  };
}

export async function buildPopupSiteFeed({ inputPath = 'data/popups.json', outputPath = inputPath, reportPath = 'data/food-popups/run-report.json', today, generatedAt } = {}) {
  const payload = JSON.parse(await readFile(inputPath, 'utf8'));
  const result = buildSiteFeedPayload(payload, { today, generatedAt });
  await mkdir(dirname(outputPath), { recursive: true });
  const temporaryPath = `${outputPath}.tmp-${process.pid}`;
  await writeFile(temporaryPath, `${JSON.stringify(result.feed, null, 2)}\n`);
  await rename(temporaryPath, outputPath);
  let report = {};
  try { report = JSON.parse(await readFile(reportPath, 'utf8')); } catch {}
  await mkdir(dirname(reportPath), { recursive: true });
  await writeFile(reportPath, `${JSON.stringify({ ...report, siteFeed: result.stats }, null, 2)}\n`);
  return result;
}

async function main() {
  const args = process.argv.slice(2);
  const value = (name, fallback) => args.find(arg => arg.startsWith(`--${name}=`))?.slice(name.length + 3) || fallback;
  const inputPath = value('input', 'data/popups.json');
  const outputPath = value('output', inputPath);
  const reportPath = value('run-report', 'data/food-popups/run-report.json');
  const result = await buildPopupSiteFeed({ inputPath, outputPath, reportPath, today: value('today', undefined) });
  console.log(`사이트 Feed ${result.stats.inputCount}→${result.stats.outputCount}건 · 중복 ${result.stats.duplicateRemovedCount}건 · 누락 거절 ${result.stats.rejectedCount - result.stats.duplicateRemovedCount}건`);
  console.log(`상태 upcoming=${result.stats.statusDistribution.upcoming} ongoing=${result.stats.statusDistribution.ongoing} ended=${result.stats.statusDistribution.ended} · NEW ${result.stats.newCount}건 · 종료 임박 ${result.stats.endingSoonCount}건`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();
