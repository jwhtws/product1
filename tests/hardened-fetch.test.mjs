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
 assert.equal(response.requestMeta.retryCount,2);
 assert.match(headers['user-agent'],/mukdang-popup-indexer/u);
 assert.match(headers['accept-language'],/ko-KR/u);
});

test('429 Retry-After를 존중하고 timeout 진단을 보존한다', async () => {
 let calls=0;
 const response=await hardenedFetch('https://official.example.test/events',{requestIntervalMs:0,retries:1,fetchImpl:async()=>{
   calls+=1; return new Response(calls===1?'wait':'ok',{status:calls===1?429:200,headers:{'retry-after':'0'}});
 }});
 assert.equal(calls,2);
 assert.equal(response.requestMeta.retryCount,1);
 const timeout=Object.assign(new Error('timed out'),{name:'TimeoutError'});
 await assert.rejects(()=>hardenedFetch('https://official.example.test/events',{requestIntervalMs:0,retries:0,fetchImpl:async()=>{throw timeout;}}),error=>error.timeout===true&&error.errorType==='timeout');
});

test('비재시도 HTTP, 응답 크기와 차단 페이지를 구분한다',async()=>{
 let notFoundCalls=0;
 await assert.rejects(()=>hardenedFetch('https://official.example.test/events',{requestIntervalMs:0,retries:2,fetchImpl:async()=>{notFoundCalls+=1;return new Response('no',{status:404,headers:{'content-type':'text/html','content-length':'2'}});}}),error=>error instanceof RequestFailedError&&error.httpStatus===404&&error.contentType==='text/html'&&error.responseSize===2);
 assert.equal(notFoundCalls,1);
 await assert.rejects(()=>hardenedFetch('https://official.example.test/events',{requestIntervalMs:0,fetchImpl:async()=>new Response('large',{headers:{'content-length':String(9*1024*1024)}})}),RequestFailedError);
 assert.throws(()=>assertNotBlockedPage('<title>Access Denied</title>','official'),BlockPageError);
});
