import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { extname } from 'node:path';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { auditPopupRows, seoulDate } from './lib/popup-content-quality.mjs';

async function repositoryAwareFetch(url, options) {
  try {
    const parsed = new URL(url);
    const path = decodeURIComponent(parsed.pathname).replace(/^\//u, '');
    if (parsed.hostname === 'mukdang.com' && path.startsWith('assets/popups/')) {
      const bytes = await readFile(path);
      const contentType = ({ '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp', '.gif': 'image/gif' })[extname(path).toLowerCase()] || 'application/octet-stream';
      return new Response(bytes, { status: 200, headers: { 'content-type': contentType, 'content-length': String(bytes.length) } });
    }
  } catch {}
  return fetch(url, options);
}

async function atomicWrite(path, value) {
  await mkdir(dirname(path), { recursive: true });
  const temporary = `${path}.tmp-${process.pid}`;
  await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`);
  await rename(temporary, path);
}

export async function auditPopupPayload(payload, options = {}) {
  const evidenceById = new Map((Array.isArray(options.evidenceRows) ? options.evidenceRows : []).map(row => [row.id, row]));
  const rows = (Array.isArray(payload?.popups) ? payload.popups : []).map(row => {
    const evidence = evidenceById.get(row.id);
    if (!evidence) return row;
    return {
      ...row,
      ...(evidence.contentSearch ? { contentSearch: evidence.contentSearch } : {}),
      ...(evidence.parserFailureReason ? { parserFailureReason: evidence.parserFailureReason } : {})
    };
  });
  const previousRows = Array.isArray(options.previousRows) ? options.previousRows : rows;
  const checkedAt = options.checkedAt || new Date().toISOString();
  const result = await auditPopupRows(rows, {
    today: options.today || seoulDate(), checkedAt,
    fetchImpl: options.fetchImpl || fetch,
    verifyImages: options.verifyImages !== false,
    concurrency: options.concurrency || 4,
    previousRows
  });
  const published = result.rows.filter(row => row.publishStatus === 'published');
  const reviewRequired = result.rows.filter(row => row.publishStatus === 'review_required');
  const rejected = result.rows.filter(row => row.publishStatus === 'rejected');
  return {
    evaluatedPayload: {
      ...payload,
      contentPolicyVersion: 1,
      contentAuditedAt: checkedAt,
      contentAudit: result.stats,
      popups: result.rows
    },
    reviewQueue: {
      generatedAt: checkedAt,
      stats: result.stats,
      reviewRequired,
      rejected
    },
    auditReport: {
      generatedAt: checkedAt,
      sourceFeedUpdatedAt: payload?.updatedAt || payload?.generatedAt || null,
      stats: result.stats,
      existingGradeC: result.rows.filter(row => row.contentQuality === 'C').map(row => ({
        id: row.id, name: row.name || row.title, venue: row.venue, status: row.status,
        publishStatus: row.publishStatus, qualityReasons: row.qualityReasons,
        contentSearchStatus: row.contentSearch?.status
      })),
      invariants: {
        publishedValidImageRate: published.length ? published.filter(row => row.imageValidation?.status === 'valid').length / published.length : 1,
        publishedMenuRate: published.length ? published.filter(row => row.menus?.length || row.officialListingVerified === true).length / published.length : 1,
        publishedBrokenImageCount: published.filter(row => row.qualityReasons?.includes('broken_image')).length,
        incompleteMisclassifiedMissingCount: result.rows.filter(row =>
          row.contentSearch?.status === 'search_incomplete'
          && row.qualityReasons?.some(reason => ['missing_valid_image', 'missing_menu'].includes(reason))
        ).length,
        parseFailedMisclassifiedMissingCount: result.rows.filter(row =>
          row.contentSearch?.status === 'parse_failed'
          && row.qualityReasons?.some(reason => ['missing_valid_image', 'missing_menu'].includes(reason))
        ).length
      },
      items: result.rows.map(row => ({
        id: row.id, name: row.name || row.title, venue: row.venue, sourceName: row.sourceName,
        status: row.status, contentQuality: row.contentQuality, publishStatus: row.publishStatus,
        qualityReasons: row.qualityReasons, imageValidation: row.imageValidation,
        contentSearch: row.contentSearch, imageCandidates: row.imageCandidates,
        menuCandidates: row.menuCandidates, parserFailureReason: row.parserFailureReason || null,
        ocrStatus: row.ocrStatus
      }))
    }
  };
}

export async function runPopupContentAudit({
  inputPath = 'data/popups.json', outputPath, reviewPath = 'data/popup-review-queue.json',
  reportPath = 'data/popup-content-audit.json', today, verifyImages = true, previousRows, evidenceRows, fetchImpl
} = {}) {
  const payload = JSON.parse(await readFile(inputPath, 'utf8'));
  const result = await auditPopupPayload(payload, { today, verifyImages, previousRows, evidenceRows, fetchImpl: fetchImpl || repositoryAwareFetch });
  if (outputPath) await atomicWrite(outputPath, result.evaluatedPayload);
  await atomicWrite(reviewPath, result.reviewQueue);
  await atomicWrite(reportPath, result.auditReport);
  return result;
}

async function main() {
  const args = process.argv.slice(2);
  const value = (name, fallback) => args.find(arg => arg.startsWith(`--${name}=`))?.slice(name.length + 3) || fallback;
  const evidencePath = value('evidence-input', '');
  let evidenceRows = [];
  if (evidencePath) {
    const evidencePayload = JSON.parse(await readFile(evidencePath, 'utf8'));
    evidenceRows = Array.isArray(evidencePayload.items) ? evidencePayload.items
      : [...(evidencePayload.popups || []), ...(evidencePayload.reviewRequired || []), ...(evidencePayload.rejected || [])];
  }
  const result = await runPopupContentAudit({
    inputPath: value('input', 'data/popups.json'),
    outputPath: value('output', undefined),
    reviewPath: value('review-output', 'data/popup-review-queue.json'),
    reportPath: value('report', 'data/popup-content-audit.json'),
    today: value('today', undefined),
    verifyImages: !args.includes('--no-image-http'),
    evidenceRows
  });
  const stats = result.auditReport.stats.total;
  console.log(`콘텐츠 품질 A=${stats.qualityDistribution.A} B=${stats.qualityDistribution.B} C=${stats.qualityDistribution.C}`);
  console.log(`공개 ${stats.publishedCount}건 · 검토 ${stats.reviewRequiredCount}건 · 거절 ${stats.rejectedCount}건`);
  console.log(`유효 이미지 ${stats.validImageCount}/${stats.totalCollected} · 메뉴 ${stats.menuCompleteCount}/${stats.totalCollected} · 가격 ${stats.priceKnownCount}/${stats.totalCollected}`);
  if (result.auditReport.invariants.incompleteMisclassifiedMissingCount || result.auditReport.invariants.parseFailedMisclassifiedMissingCount) {
    throw new Error('탐색 미완료 또는 파싱 실패 항목을 missing으로 오판했습니다.');
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();
