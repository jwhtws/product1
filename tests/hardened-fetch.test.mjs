import assert from 'node:assert/strict';
import test from 'node:test';
import { assertNotBlockedPage, BlockPageError, hardenedFetch, RequestFailedError } from '../scripts/lib/hardened-fetch.mjs';

test('429와 5xx만 제한 재시도하고 User-Agent를 보낸다',async()=>{
 let calls=0,headers;
 const response=await hardenedFetch('https://official.example.test/events',{requestIntervalMs:0,retries:2,fetchImpl:async(_url,options)=>{
   calls+=1; headers=options.headers; return new Response(calls<3?'busy':'ok',{status:calls<3?429:200});
 }});
 assert.equal(await response.text(),'ok');
 assert.equal(calls,3);
 assert.match(headers['user-agent'],/mukdang-popup-indexer/u);
});

test('비재시도 HTTP, 응답 크기와 차단 페이지를 구분한다',async()=>{
 await assert.rejects(()=>hardenedFetch('https://official.example.test/events',{requestIntervalMs:0,retries:2,fetchImpl:async()=>new Response('no',{status:404})}),RequestFailedError);
 await assert.rejects(()=>hardenedFetch('https://official.example.test/events',{requestIntervalMs:0,fetchImpl:async()=>new Response('large',{headers:{'content-length':String(9*1024*1024)}})}),RequestFailedError);
 assert.throws(()=>assertNotBlockedPage('<title>Access Denied</title>','official'),BlockPageError);
});
