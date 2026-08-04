import test from 'node:test';
import assert from 'node:assert/strict';
import { buildPopupRunReport, sanitizeReportError } from './popup-run-report.mjs';

const identity = row => `${row.name}|${row.venue}|${row.startDate}|${row.endDate || ''}`;

test('부분 실행 출처만 집계하고 제외·중복·오류를 합산한다', () => {
  const report = buildPopupRunReport({
    runId: 'run-1', scope: 'lotte',
    startedAt: '2026-08-04T00:00:00.000Z', finishedAt: '2026-08-04T00:00:01.000Z',
    normalize: row => row, identity,
    finalRows: [{ id: 'winner', name: '빵', venue: '롯데', startDate: '2026-08-01', endDate: '' }],
    sourceRuns: [{
      source: '롯데', startedAt: '2026-08-04T00:00:00.000Z', finishedAt: '2026-08-04T00:00:00.500Z',
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
  assert.deepEqual([report.totalFetched, report.totalAccepted, report.totalRejected, report.totalDuplicates, report.totalErrors], [3, 1, 1, 1, 1]);
  assert.deepEqual(report.sources[0].rejectionReasons, { invalid_date: 1 });
  assert.doesNotMatch(JSON.stringify(report), /secret/u);
});

test('오류의 인증 헤더 값을 가린다', () => {
  assert.equal(sanitizeReportError(new Error('Authorization: Bearer abc.def')).message, 'Authorization=[REDACTED] [REDACTED]');
});
