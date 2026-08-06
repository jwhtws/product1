import assert from 'node:assert/strict';
import test from 'node:test';
import { anomalyFlags, sourceHealthFor } from '../scripts/lib/source-health.mjs';
import { buildPopupRunReport } from '../scripts/lib/popup-run-report.mjs';

test('정상·빈 결과·구조 변경·요청 실패를 구분한다',()=>{
 const base={startedAt:'2026-08-04T00:00:00Z',finishedAt:'2026-08-04T00:00:01Z',stats:{discoveredCount:1,fetchedCount:1,rejectionReasons:{}},rows:[{}]};
 assert.equal(sourceHealthFor(base).healthStatus,'healthy');
 assert.equal(sourceHealthFor({...base,rows:[],stats:{...base.stats,discoveredCount:0}}).healthStatus,'empty');
 assert.equal(sourceHealthFor({...base,rows:[],sourceHealth:{status:'source_structure_changed'}}).healthStatus,'structure_changed');
 assert.equal(sourceHealthFor({...base,rows:[],sourceHealth:{status:'unverified',message:'검증 보류'}}).healthStatus,'unverified');
 assert.equal(sourceHealthFor({...base,rows:[],error:new Error('timeout')}).healthStatus,'failed');
});
test('급감·급증·오류율·연속 실패와 빈 결과를 감지한다',()=>{
 const history=Array.from({length:2},()=>({discoveredCount:20,acceptedCount:10,healthStatus:'failed',consecutiveFailureCount:1}));
 assert.ok(anomalyFlags({discoveredCount:0,acceptedCount:0,rejectedCount:1,healthStatus:'failed'},history).includes('consecutive_failure_3'));
 assert.ok(anomalyFlags({discoveredCount:100,acceptedCount:1,rejectedCount:2,healthStatus:'healthy'},[{discoveredCount:20,acceptedCount:10}]).includes('discovered_spike_300'));
});

test('실행 보고서에 source 복구 경로와 정확한 최종 상태를 보존한다',()=>{
 const row={id:'source:1',name:'커피 팝업',startDate:'2026-08-01'};
 const report=buildPopupRunReport({runId:'run',scope:'source',startedAt:'2026-08-06T00:00:00Z',finishedAt:'2026-08-06T00:00:01Z',sourceRuns:[{
   source:'source',rows:[row],stats:{discoveredCount:1,fetchedCount:2,rejectionReasons:{}},startedAt:'2026-08-06T00:00:00Z',finishedAt:'2026-08-06T00:00:01Z',
   sourceHealth:{sourceId:'source',primaryPath:'https://official.example/api',fallbackPathsTried:['https://official.example/events'],recoveredPath:'https://official.example/events',recovered:true,recoveryReason:'fallback',discoveryAttempts:[{method:'official_api',status:'failed'}],detailPagesChecked:1,imageCandidatesFound:1,menuCandidatesFound:1,finalStatus:'recovered',status:'recovered'}
 }],normalize:value=>value,identity:value=>value.id,finalRows:[row]});
 assert.equal(report.sources[0].finalStatus,'recovered');
 assert.equal(report.sources[0].recovered,true);
 assert.equal(report.sources[0].discoveryAttempts[0].method,'official_api');
});
