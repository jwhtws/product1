import assert from 'node:assert/strict';
import test from 'node:test';
import { anomalyFlags, sourceHealthFor } from '../scripts/lib/source-health.mjs';

test('정상·빈 결과·구조 변경·요청 실패를 구분한다',()=>{
 const base={startedAt:'2026-08-04T00:00:00Z',finishedAt:'2026-08-04T00:00:01Z',stats:{discoveredCount:1,fetchedCount:1,rejectionReasons:{}},rows:[{}]};
 assert.equal(sourceHealthFor(base).healthStatus,'healthy');
 assert.equal(sourceHealthFor({...base,rows:[],stats:{...base.stats,discoveredCount:0}}).healthStatus,'empty');
 assert.equal(sourceHealthFor({...base,rows:[],sourceHealth:{status:'source_structure_changed'}}).healthStatus,'structure_changed');
 assert.equal(sourceHealthFor({...base,rows:[],error:new Error('timeout')}).healthStatus,'failed');
});
test('급감·급증·오류율·연속 실패와 빈 결과를 감지한다',()=>{
 const history=Array.from({length:2},()=>({discoveredCount:20,acceptedCount:10,healthStatus:'failed',consecutiveFailureCount:1}));
 assert.ok(anomalyFlags({discoveredCount:0,acceptedCount:0,rejectedCount:1,healthStatus:'failed'},history).includes('consecutive_failure_3'));
 assert.ok(anomalyFlags({discoveredCount:100,acceptedCount:1,rejectedCount:2,healthStatus:'healthy'},[{discoveredCount:20,acceptedCount:10}]).includes('discovered_spike_300'));
});
