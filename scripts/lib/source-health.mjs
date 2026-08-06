export const HEALTH_STATUSES = ['healthy','empty','degraded','failed','structure_changed','unverified'];

const average = values => values.length ? values.reduce((a,b)=>a+b,0)/values.length : 0;

export function anomalyFlags(current, history = []) {
  const recent = history.slice(-7);
  if (!recent.length) return [];
  const flags = [];
  const discoveredAverage = average(recent.map(x => Number(x.discoveredCount || 0)));
  const acceptedAverage = average(recent.map(x => Number(x.acceptedCount || 0)));
  if (discoveredAverage >= 10 && current.discoveredCount === 0) flags.push('unexpected_empty');
  if (discoveredAverage > 0 && current.discoveredCount <= discoveredAverage * .2) flags.push('discovered_drop_80');
  if (acceptedAverage > 0 && current.acceptedCount <= acceptedAverage * .2) flags.push('accepted_drop_80');
  if (discoveredAverage > 0 && current.discoveredCount >= discoveredAverage * 4) flags.push('discovered_spike_300');
  const attempts = current.acceptedCount + current.rejectedCount;
  if (attempts > 0 && current.rejectedCount / attempts >= .5) flags.push('error_rate_50');
  const lastTwo = recent.slice(-2);
  if (lastTwo.length === 2 && [...lastTwo,current].every(x => x.healthStatus === 'failed')) flags.push('consecutive_failure_3');
  if (lastTwo.length === 2 && [...lastTwo,current].every(x => x.healthStatus === 'empty')) flags.push('consecutive_empty_3');
  return [...new Set(flags)];
}

export function sourceHealthFor(run, previous = []) {
  const discoveryStatus = run.sourceHealth?.finalStatus || run.sourceHealth?.status;
  const structureChanged = ['source_structure_changed', 'structure_changed', 'parse_failed'].includes(discoveryStatus) || run.error?.name === 'SourceStructureChangedError';
  const unverified = ['unverified', 'search_incomplete', 'unresolved'].includes(discoveryStatus);
  const requestFailed = (Boolean(run.error) || ['request_failed', 'blocked'].includes(discoveryStatus)) && !structureChanged;
  const discoveredCount = Number(run.stats?.discoveredCount ?? run.rows?.length ?? 0);
  const acceptedCount = Number(run.acceptedCount ?? run.rows?.length ?? 0);
  const rejectedCount = Number(run.rejectedCount ?? Object.values(run.stats?.rejectionReasons || {}).reduce((sum,n)=>sum+Number(n),0));
  const base = {
    healthStatus: structureChanged ? 'structure_changed' : unverified ? 'unverified' : requestFailed ? 'failed' : acceptedCount ? 'healthy' : 'empty',
    healthMessage: run.sourceHealth?.message || (structureChanged ? '공식 응답의 필수 구조가 변경됨' : unverified ? '자동 검증 보류' : requestFailed ? '공식 출처 요청 실패' : acceptedCount ? `${acceptedCount}건 승인` : '정상 응답, 승인 항목 없음'),
    discoveredCount, fetchedCount: Number(run.stats?.fetchedCount ?? run.rows?.length ?? 0), acceptedCount, rejectedCount,
    duplicateCount: Number(run.duplicateCount ?? run.stats?.duplicateSourceItemCount ?? run.stats?.rejectionReasons?.duplicate_source_item ?? 0),
    errorCount: Number(run.errorCount ?? (run.error ? 1 : 0)), rejectionReasons: { ...(run.rejectionReasons || run.stats?.rejectionReasons || {}) },
    startedAt: run.startedAt, finishedAt: run.finishedAt,
    lastSuccessfulAt: requestFailed || structureChanged || unverified ? (previous.at(-1)?.lastSuccessfulAt || null) : run.finishedAt,
    consecutiveFailureCount: requestFailed || structureChanged ? Number(previous.at(-1)?.consecutiveFailureCount || 0) + 1 : 0,
    anomalyFlags: []
  };
  base.anomalyFlags = anomalyFlags(base, previous);
  if (base.anomalyFlags.length && base.healthStatus === 'healthy') base.healthStatus = 'degraded';
  return base;
}
