import assert from 'node:assert/strict';
import test from 'node:test';
import { COLLECTOR_SCOPES, selectCollectors } from '../scripts/collectors/registry.mjs';

const all=[...new Set(Object.values(COLLECTOR_SCOPES).flat())].map(name=>[name,()=>name]);
for (const [scope,names] of Object.entries(COLLECTOR_SCOPES)) test(`부분 실행 ${scope}`,()=>{
  assert.deepEqual(selectCollectors(all,scope).map(([name])=>name),names);
});
test('알 수 없는 scope 거부',()=>assert.throws(()=>selectCollectors(all,'unknown'),/지원하지 않는/u));
