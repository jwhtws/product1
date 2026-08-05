import assert from 'node:assert/strict';
import test from 'node:test';
import { COLLECTOR_SCOPES, selectCollectors } from '../scripts/collectors/registry.mjs';

const all=[...new Set(Object.values(COLLECTOR_SCOPES).flat())].map(name=>[name,()=>name]);
for (const [scope,names] of Object.entries(COLLECTOR_SCOPES)) test(`부분 실행 ${scope}`,()=>{
  assert.deepEqual(selectCollectors(all,scope).map(([name])=>name),names);
});
test('알 수 없는 scope 거부',()=>assert.throws(()=>selectCollectors(all,'unknown'),/지원하지 않는/u));
test('Batch 3 신규 source는 전체 실행에 포함되고 unverified 후보는 dispatch되지 않는다',()=>{
  const names=all.map(([name])=>name);
  assert.ok(names.includes('신세계사이먼 프리미엄 아울렛'));
  assert.ok(names.includes('IFC몰'));
  assert.ok(names.includes('두타몰'));
  assert.ok(!names.includes('엔터식스'));
  assert.ok(!names.includes('스퀘어원'));
});
test('부분 실행 report 대상은 선택 source 하나뿐이다',()=>{
  for(const scope of ['premiumoutlets','ifc','doota']) assert.equal(selectCollectors(all,scope).length,1);
});
test('Batch 4 검증 브랜드는 전체 실행과 source별 부분 실행에 연결된다',()=>{
  const scopes=['brand-cj-cheiljedang','brand-samyang-foods','brand-orion','brand-ediya','brand-pulmuone','brand-kyochon'];
  for(const scope of scopes) {
    assert.equal(selectCollectors(all,scope).length,1);
    assert.ok(all.map(([name])=>name).includes(COLLECTOR_SCOPES[scope][0]));
  }
});
