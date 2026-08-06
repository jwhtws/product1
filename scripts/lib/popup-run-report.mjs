import { mkdir, readFile, readdir, unlink, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { randomUUID } from 'node:crypto';
import { sourceHealthFor } from './source-health.mjs';

const SECRET_QUERY_KEY = /(token|secret|key|api[-_]?key|authorization|cookie|session|password|credential)/iu;

export function createCollectorStats() {
  return { discoveredCount: 0, fetchedCount: 0, rejectionReasons: {}, duplicateSourceItemCount: 0 };
}

export function recordCollectorRejection(stats, reason) {
  stats.rejectionReasons[reason] = (stats.rejectionReasons[reason] || 0) + 1;
  if (reason === 'duplicate_source_item') stats.duplicateSourceItemCount = (stats.duplicateSourceItemCount || 0) + 1;
}

export function mergeCollectorStats(target, source = {}) {
  target.discoveredCount += Number(source.discoveredCount || 0);
  target.fetchedCount += Number(source.fetchedCount || 0);
  target.duplicateSourceItemCount += Number(source.duplicateSourceItemCount || 0);
  for (const [reason, count] of Object.entries(source.rejectionReasons || {})) {
    target.rejectionReasons[reason] = (target.rejectionReasons[reason] || 0) + Number(count || 0);
  }
  return target;
}

export function normalizeCollectorResult(result) {
  if (Array.isArray(result)) {
    return { rows: result, stats: { discoveredCount: result.length, fetchedCount: result.length, rejectionReasons: {}, duplicateSourceItemCount: 0 }, sourceHealth: result.sourceHealth || null };
  }
  const rows = Array.isArray(result?.rows) ? result.rows : [];
  return {
    rows,
    stats: {
      discoveredCount: Number.isFinite(result?.stats?.discoveredCount) ? result.stats.discoveredCount : rows.length,
      fetchedCount: Number.isFinite(result?.stats?.fetchedCount) ? result.stats.fetchedCount : rows.length,
      rejectionReasons: { ...(result?.stats?.rejectionReasons || {}) },
      duplicateSourceItemCount: Number(result?.stats?.duplicateSourceItemCount || result?.stats?.rejectionReasons?.duplicate_source_item || 0),
      errorCount: Number(result?.stats?.errorCount || 0),
      errors: Array.isArray(result?.stats?.errors) ? result.stats.errors : []
    },
    sourceHealth: result?.sourceHealth || null
  };
}

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

export function buildPopupRunReport({ runId = randomUUID(), scope, startedAt, finishedAt, sourceRuns, normalize, identity, finalRows = [], historyBySource = {} }) {
  const finalByIdentity = new Map(finalRows.map(row => [identity(row), row]));
  const sources = sourceRuns.map(run => {
    const rejectionReasons = { ...(run.stats?.rejectionReasons || {}) };
    let acceptedCount = 0;
    let rejectedCount = Object.values(rejectionReasons).reduce((total, count) => total + Number(count || 0), 0);
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
    const errors = [
      ...(run.error ? [sanitizeReportError(run.error)] : []),
      ...(run.stats?.errors || []).map(error => sanitizeReportError(
        error?.message || `${error?.errorType || 'request_failed'}${error?.httpStatus ? ` HTTP ${error.httpStatus}` : ''}${error?.url ? ` ${error.url}` : ''}`
      ))
    ];
    const health = sourceHealthFor({ ...run, acceptedCount, rejectedCount, duplicateCount, errorCount: errors.length, rejectionReasons }, historyBySource[run.source] || []);
    const recovery = run.sourceHealth ? Object.fromEntries(Object.entries(run.sourceHealth).filter(([key]) => [
      'sourceId', 'primaryPath', 'fallbackPathsTried', 'recoveredPath', 'recovered', 'recoveryReason',
      'discoveryAttempts', 'detailPagesChecked', 'imageCandidatesFound', 'menuCandidatesFound', 'finalStatus'
    ].includes(key))) : {};
    return {
      source: run.source,
      discoveredCount: Number.isFinite(run.stats?.discoveredCount) ? run.stats.discoveredCount : (run.rows || []).length,
      fetchedCount: Number.isFinite(run.stats?.fetchedCount) ? run.stats.fetchedCount : (run.rows || []).length,
      acceptedCount,
      rejectedCount,
      duplicateCount,
      errorCount: errors.length,
      rejectionReasons,
      errors,
      startedAt: run.startedAt,
      finishedAt: run.finishedAt,
      ...health,
      ...recovery
    };
  });
  const sum = key => sources.reduce((total, source) => total + source[key], 0);
  return {
    runId,
    scope,
    startedAt,
    finishedAt,
    durationMs: Math.max(0, new Date(finishedAt).getTime() - new Date(startedAt).getTime()),
    totalDiscovered: sum('discoveredCount'),
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

export async function readRunHistory(directory = 'data/food-popups/run-history') {
  try {
    const names = (await readdir(directory)).filter(name => name.endsWith('.json')).sort().slice(-30);
    const reports = await Promise.all(names.map(async name => JSON.parse(await readFile(`${directory}/${name}`, 'utf8'))));
    const bySource = {};
    for (const report of reports) for (const source of report.sources || []) (bySource[source.source] ||= []).push(source);
    return bySource;
  } catch { return {}; }
}

export async function writeRunHistory(report, directory = 'data/food-popups/run-history', now = new Date()) {
  await mkdir(directory, { recursive: true });
  const filename = `${report.finishedAt.replace(/:/gu, '-').replace(/\.\d{3}/u, '')}.json`;
  await writeFile(`${directory}/${filename}`, `${JSON.stringify(report, null, 2)}\n`);
  const cutoff = now.getTime() - 30 * 86_400_000;
  const names = (await readdir(directory)).filter(name => name.endsWith('.json')).sort().reverse();
  for (const [index, name] of names.entries()) {
    const timestamp = Date.parse(name.replace(/-(\d{2})-(\d{2})Z\.json$/u, ':$1:$2Z'));
    if (index >= 30 || !Number.isFinite(timestamp) || timestamp < cutoff) await unlink(`${directory}/${name}`);
  }
}

export async function safelyBuildAndWritePopupRunReport(options, path = 'data/food-popups/run-report.json') {
  try {
    const historyDirectory = `${dirname(path)}/run-history`;
    const historyBySource = await readRunHistory(historyDirectory);
    const report = buildPopupRunReport({ ...options, historyBySource });
    const latestWritten = await writePopupRunReport(report, path);
    try { await writeRunHistory(report, historyDirectory); } catch (error) { console.warn(`팝업 실행 이력 작성 실패: ${sanitizeReportError(error).message}`); }
    return latestWritten;
  } catch (error) {
    console.warn(`팝업 실행 보고서 생성 실패(수집 결과는 유지): ${sanitizeReportError(error).message}`);
    return false;
  }
}
