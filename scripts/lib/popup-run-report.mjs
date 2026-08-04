import { mkdir, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { randomUUID } from 'node:crypto';

const SECRET_QUERY_KEY = /(token|secret|key|api[-_]?key|authorization|cookie|session|password|credential)/iu;

export function sanitizeReportError(error) {
  const raw = String(error?.message || error || 'Unknown error');
  const urls = raw.match(/https?:\/\/[^\s)\]}>,]+/giu) || [];
  const sanitizeUrl = value => {
    try {
      const url = new URL(value);
      for (const key of [...url.searchParams.keys()]) {
        if (SECRET_QUERY_KEY.test(key)) url.searchParams.set(key, '[REDACTED]');
      }
      url.username = '';
      url.password = '';
      return url.href;
    } catch {
      return value.replace(/([?&](?:token|secret|key|api[-_]?key|password)=[^&\s]+)/giu, '$1[REDACTED]');
    }
  };
  let message = raw;
  for (const url of urls) message = message.replace(url, sanitizeUrl(url));
  message = message
    .replace(/\b(Bearer|Basic)\s+[A-Za-z0-9._~+\/-]+=*/giu, '$1 [REDACTED]')
    .replace(/\b(token|secret|api[-_]?key|password|cookie|authorization)\s*[:=]\s*[^\s,;]+/giu, '$1=[REDACTED]');
  return { message, ...(urls[0] ? { url: sanitizeUrl(urls[0]) } : {}) };
}

function rejectionReason(row) {
  if (!row?.id) return 'missing_id';
  if (!row?.name) return 'missing_name';
  if (!row?.startDate) return 'invalid_date';
  if (row.endDate && row.endDate < row.startDate) return 'invalid_date';
  return '';
}

export function buildPopupRunReport({ runId = randomUUID(), scope, startedAt, finishedAt, sourceRuns, normalize, identity, finalRows = [] }) {
  const finalByIdentity = new Map(finalRows.map(row => [identity(row), row]));
  const sources = sourceRuns.map(run => {
    const rejectionReasons = {};
    let acceptedCount = 0;
    let rejectedCount = 0;
    let duplicateCount = 0;
    for (const row of run.rows || []) {
      const reason = rejectionReason(row);
      if (reason) {
        rejectedCount += 1;
        rejectionReasons[reason] = (rejectionReasons[reason] || 0) + 1;
        continue;
      }
      const normalized = normalize(row);
      const winner = finalByIdentity.get(identity(normalized));
      const normalizedReason = rejectionReason(normalized);
      if (normalizedReason || !winner) {
        const finalReason = normalizedReason || 'not_accepted';
        rejectedCount += 1;
        rejectionReasons[finalReason] = (rejectionReasons[finalReason] || 0) + 1;
      } else if (winner.id !== normalized.id) duplicateCount += 1;
      else acceptedCount += 1;
    }
    const errors = run.error ? [sanitizeReportError(run.error)] : [];
    return {
      source: run.source,
      fetchedCount: (run.rows || []).length,
      acceptedCount,
      rejectedCount,
      duplicateCount,
      errorCount: errors.length,
      rejectionReasons,
      errors,
      startedAt: run.startedAt,
      finishedAt: run.finishedAt
    };
  });
  const sum = key => sources.reduce((total, source) => total + source[key], 0);
  return {
    runId,
    scope,
    startedAt,
    finishedAt,
    durationMs: Math.max(0, new Date(finishedAt).getTime() - new Date(startedAt).getTime()),
    totalFetched: sum('fetchedCount'),
    totalAccepted: sum('acceptedCount'),
    totalRejected: sum('rejectedCount'),
    totalDuplicates: sum('duplicateCount'),
    totalErrors: sum('errorCount'),
    sources
  };
}

export async function writePopupRunReport(report, path = 'data/food-popups/run-report.json') {
  try {
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, `${JSON.stringify(report, null, 2)}\n`);
    return true;
  } catch (error) {
    console.warn(`팝업 실행 보고서 작성 실패(수집 결과는 유지): ${sanitizeReportError(error).message}`);
    return false;
  }
}

export async function safelyBuildAndWritePopupRunReport(options, path = 'data/food-popups/run-report.json') {
  try {
    return await writePopupRunReport(buildPopupRunReport(options), path);
  } catch (error) {
    console.warn(`팝업 실행 보고서 생성 실패(수집 결과는 유지): ${sanitizeReportError(error).message}`);
    return false;
  }
}
