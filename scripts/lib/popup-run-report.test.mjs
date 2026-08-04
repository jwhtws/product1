import test from 'node:test';
import assert from 'node:assert/strict';
import { buildPopupRunReport, normalizeCollectorResult, sanitizeReportError } from './popup-run-report.mjs';

const identity = row => `${row.name}|${row.venue}|${row.startDate}|${row.endDate || ''}`;

test('부분 실행 출처만 집계하고 제외·중복·오류를 합산한다', () => {
  const report = buildPopupRunReport({
    runId: 'run-1', scope: 'lotte',
    startedAt: '2026-08-04T00:00:00.000Z', finishedAt: '2026-08-04T00:00:01.000Z',
    normalize: row => row, identity,
    finalRows: [{ id: 'winner', name: '빵', venue: '롯데', startDate: '2026-08-01', endDate: '' }],
    sourceRuns: [{
      source: '롯데', startedAt: '2026-08-04T00:00:00.000Z', finishedAt: '2026-08-04T00:00:00.500Z',
      stats: { discoveredCount: 5, rejectionReasons: { not_popup: 1, expired: 1 } },
      rows: [
        { id: 'winner', name: '빵', venue: '롯데', startDate: '2026-08-01', endDate: '' },
        { id: 'duplicate', name: '빵', venue: '롯데', startDate: '2026-08-01', endDate: '' },
        { id: 'bad', name: '떡', venue: '롯데', startDate: '', endDate: '' }
      ],
      error: new Error('https://example.com/feed?token=secret 응답 실패')
    }]
  });
  assert.equal(report.scope, 'lotte');
  assert.equal(report.sources.length, 1);
  assert.deepEqual([report.totalDiscovered, report.totalFetched, report.totalAccepted, report.totalRejected, report.totalDuplicates, report.totalErrors], [5, 3, 1, 3, 1, 1]);
  assert.deepEqual(report.sources[0].rejectionReasons, { not_popup: 1, expired: 1, invalid_date: 1 });
  assert.doesNotMatch(JSON.stringify(report), /secret/u);
});

test('배열 반환 collector를 하위 호환 구조로 정규화한다', () => {
  const rows = [{ id: 'one' }, { id: 'two' }];
  assert.deepEqual(normalizeCollectorResult(rows), {
    rows,
    stats: { discoveredCount: 2, fetchedCount: 2, rejectionReasons: {}, duplicateSourceItemCount: 0 },
    sourceHealth: null
  });
});

test('stats 포함 collector 결과를 보존한다', () => {
  const result = normalizeCollectorResult({
    rows: [{ id: 'one' }],
    stats: { discoveredCount: 4, rejectionReasons: { not_food: 2, expired: 1 } }
  });
  assert.equal(result.stats.discoveredCount, 4);
  assert.deepEqual(result.stats.rejectionReasons, { not_food: 2, expired: 1 });
});

test('오류의 인증 헤더 값을 가린다', () => {
  assert.equal(sanitizeReportError(new Error('Authorization: Bearer abc.def')).message, 'Authorization=[REDACTED] [REDACTED]');
});
