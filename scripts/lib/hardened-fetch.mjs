const RETRYABLE = new Set([408,425,429,500,502,503,504]);
const BLOCKED = /(captcha|access denied|요청을 처리할 수 없습니다|비정상적인 접근|로그인이 필요)/iu;

export class RequestFailedError extends Error { constructor(message) { super(message); this.name='RequestFailedError'; } }
export class BlockPageError extends Error { constructor(message) { super(message); this.name='BlockPageError'; } }

export async function hardenedFetch(url, { fetchImpl=fetch, timeoutMs=15_000, retries=2, maxBytes=8*1024*1024, requestIntervalMs=100, headers={}, ...options } = {}) {
  let lastError;
  for (let attempt=0; attempt<=retries; attempt+=1) {
    if (attempt || requestIntervalMs) await new Promise(resolve=>setTimeout(resolve, attempt ? Math.min(2_000,250*2**attempt) : requestIntervalMs));
    try {
      const response=await fetchImpl(url,{...options,headers:{accept:'text/html,application/json,application/xml;q=0.9,*/*;q=0.8','user-agent':'mukdang-popup-indexer/1.0 (+https://mukdang.com)',...headers},signal:options.signal||AbortSignal.timeout(timeoutMs)});
      if (!response.ok) {
        const error=new RequestFailedError(`${new URL(url).origin} 응답 ${response.status}`);
        error.retryable=RETRYABLE.has(response.status);
        if (!RETRYABLE.has(response.status) || attempt===retries) throw error;
        lastError=error; continue;
      }
      const length=Number(response.headers.get('content-length')||0);
      if (length>maxBytes) { const error=new RequestFailedError(`${new URL(url).origin} 응답 크기 제한 초과`); error.retryable=false; throw error; }
      return response;
    } catch(error) { lastError=error; if(error.retryable===false || attempt===retries) throw new RequestFailedError(lastError.message); }
  }
  throw lastError;
}

export function assertNotBlockedPage(text, sourceId='source') {
  if (BLOCKED.test(String(text||''))) throw new BlockPageError(`${sourceId}: 차단 또는 로그인 페이지 감지`);
}
