import { access, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

export const REGISTRY_PATH = 'data/data-source-registry.json';
export const SOURCE_TYPES = ['department_store','outlet','shopping_mall','popup_venue','brand_newsroom','brand_official_site','official_blog','press_release','local_government','festival','user_submission','social_official','other'];
export const COLLECTION_METHODS = ['official_api','html','sitemap','rss','json_embedded','manual_review','user_submission','unsupported','unverified'];
export const IMPLEMENTATION_STATUSES = ['active','partial','broken','planned','manual','unverified','excluded'];
export const PRIORITIES = ['S','A','B','C'];
export const EXPECTED_VOLUMES = ['high','medium','low','unknown'];
export const UPDATE_FREQUENCIES = ['realtime','daily','weekly','irregular','unknown'];
export const LEVELS = ['high','medium','low','unknown'];
export const ROBOTS_STATUSES = ['allowed','restricted','disallowed','unknown'];
export const PAGINATION_TYPES = ['none','page','cursor','infinite','unknown'];

export const REQUIRED_FIELDS = [
  'id','name','operator','sourceType','officialUrl','eventUrl','branches','regions','implementationStatus',
  'collectionMethod','priority','foodPopupRelevance','expectedVolume','updateFrequency','stability',
  'maintenanceCost','legalRisk','robotsStatus','authRequired','jsRequired','paginationType','fieldsAvailable',
  'currentCollector','collectorFile','testFile','lastVerifiedAt','verificationEvidence','notes','priorityScore','priorityReason'
];

export function priorityFor(score) {
  if (score >= 75) return 'S';
  if (score >= 60) return 'A';
  if (score >= 40) return 'B';
  return 'C';
}

function isUrl(value) {
  try { return ['http:','https:'].includes(new URL(value).protocol); } catch { return false; }
}

async function exists(path) {
  try { await access(path); return true; } catch { return false; }
}

function countBy(sources, field, allowed) {
  return Object.fromEntries(allowed.map(value => [value, sources.filter(source => source[field] === value).length]));
}

export async function validateRegistry(registry, { now = new Date(), checkFiles = true } = {}) {
  const errors = [];
  const warnings = [];
  const sources = Array.isArray(registry?.sources) ? registry.sources : [];
  if (!Array.isArray(registry?.sources)) errors.push('최상위 sources는 배열이어야 합니다.');
  const ids = new Set();

  for (const [index, source] of sources.entries()) {
    const label = source?.id || `sources[${index}]`;
    for (const field of REQUIRED_FIELDS) if (!(field in (source || {}))) errors.push(`${label}: 필수 필드 ${field} 누락`);
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(source.id || '')) errors.push(`${label}: id는 kebab-case여야 합니다.`);
    if (ids.has(source.id)) errors.push(`${label}: 중복 id`);
    ids.add(source.id);
    if (!SOURCE_TYPES.includes(source.sourceType)) errors.push(`${label}: 허용되지 않은 sourceType ${source.sourceType}`);
    if (!COLLECTION_METHODS.includes(source.collectionMethod)) errors.push(`${label}: 허용되지 않은 collectionMethod ${source.collectionMethod}`);
    if (!IMPLEMENTATION_STATUSES.includes(source.implementationStatus)) errors.push(`${label}: 허용되지 않은 implementationStatus ${source.implementationStatus}`);
    if (!PRIORITIES.includes(source.priority)) errors.push(`${label}: 허용되지 않은 priority ${source.priority}`);
    if (!EXPECTED_VOLUMES.includes(source.expectedVolume)) errors.push(`${label}: 허용되지 않은 expectedVolume ${source.expectedVolume}`);
    if (!UPDATE_FREQUENCIES.includes(source.updateFrequency)) errors.push(`${label}: 허용되지 않은 updateFrequency ${source.updateFrequency}`);
    if (!LEVELS.includes(source.stability)) errors.push(`${label}: 허용되지 않은 stability ${source.stability}`);
    if (!LEVELS.includes(source.maintenanceCost)) errors.push(`${label}: 허용되지 않은 maintenanceCost ${source.maintenanceCost}`);
    if (!LEVELS.includes(source.legalRisk)) errors.push(`${label}: 허용되지 않은 legalRisk ${source.legalRisk}`);
    if (!ROBOTS_STATUSES.includes(source.robotsStatus)) errors.push(`${label}: 허용되지 않은 robotsStatus ${source.robotsStatus}`);
    if (!PAGINATION_TYPES.includes(source.paginationType)) errors.push(`${label}: 허용되지 않은 paginationType ${source.paginationType}`);
    if (!isUrl(source.officialUrl)) errors.push(`${label}: officialUrl 형식 오류`);
    if (!isUrl(source.eventUrl)) errors.push(`${label}: eventUrl 형식 오류`);
    if (!Array.isArray(source.branches) || !Array.isArray(source.regions) || !Array.isArray(source.fieldsAvailable) || !Array.isArray(source.verificationEvidence)) errors.push(`${label}: 배열 필드 형식 오류`);
    if (typeof source.authRequired !== 'boolean' || typeof source.jsRequired !== 'boolean') errors.push(`${label}: authRequired/jsRequired는 boolean이어야 합니다.`);
    if (!Number.isInteger(source.priorityScore) || source.priorityScore < 0 || source.priorityScore > 100) errors.push(`${label}: priorityScore 범위 오류`);
    const expectedPriority = priorityFor(source.priorityScore);
    if (source.priority !== expectedPriority) errors.push(`${label}: priorityScore ${source.priorityScore}는 ${expectedPriority}이나 priority는 ${source.priority}`);
    if (source.foodPopupRelevance < 0 || source.foodPopupRelevance > 30) errors.push(`${label}: foodPopupRelevance 범위 오류`);
    const automatic = ['official_api','html','sitemap','rss','json_embedded'].includes(source.collectionMethod);
    if ((source.legalRisk === 'high' || source.robotsStatus === 'disallowed') && automatic) errors.push(`${label}: 법적/robots 위험 출처가 자동 수집 방식으로 분류됨`);
    if (source.collectionMethod === 'unverified' && source.implementationStatus === 'active') errors.push(`${label}: unverified 수집 방식은 active일 수 없음`);
    if (source.implementationStatus === 'active' && !source.collectorFile) errors.push(`${label}: active인데 collectorFile 없음`);
    if (checkFiles && source.collectorFile && !await exists(source.collectorFile)) errors.push(`${label}: collectorFile이 존재하지 않음 (${source.collectorFile})`);
    if (checkFiles && source.currentCollector && !source.collectorFile) errors.push(`${label}: currentCollector가 있으나 collectorFile 없음`);
    if (checkFiles && source.testFile && !await exists(source.testFile)) errors.push(`${label}: testFile이 존재하지 않음 (${source.testFile})`);
    if (source.implementationStatus === 'active' && source.verificationEvidence.length === 0) warnings.push(`${label}: active인데 verificationEvidence 없음`);
    if (source.lastVerifiedAt) {
      const verified = new Date(source.lastVerifiedAt);
      if (Number.isNaN(verified.getTime())) errors.push(`${label}: lastVerifiedAt가 ISO 날짜가 아님`);
      else if ((now - verified) / 86_400_000 > 90) warnings.push(`${label}: 마지막 검증 후 90일 초과`);
    }
  }
  return {
    errors,warnings,
    counts:{
      total:sources.length,
      sourceType:countBy(sources,'sourceType',SOURCE_TYPES),
      priority:countBy(sources,'priority',PRIORITIES),
      implementationStatus:countBy(sources,'implementationStatus',IMPLEMENTATION_STATUSES)
    }
  };
}

export async function loadRegistry(path = REGISTRY_PATH) {
  return JSON.parse(await readFile(path, 'utf8'));
}

async function main() {
  const result = await validateRegistry(await loadRegistry());
  console.log(`등록 출처: ${result.counts.total}`);
  console.log(`sourceType: ${JSON.stringify(result.counts.sourceType)}`);
  console.log(`priority: ${JSON.stringify(result.counts.priority)}`);
  console.log(`implementationStatus: ${JSON.stringify(result.counts.implementationStatus)}`);
  for (const warning of result.warnings) console.warn(`WARN ${warning}`);
  for (const error of result.errors) console.error(`ERROR ${error}`);
  if (result.errors.length) process.exitCode = 1;
  else console.log(`정합성 검사 통과 (경고 ${result.warnings.length}건)`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) await main();
