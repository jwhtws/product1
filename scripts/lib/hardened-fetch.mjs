const RETRYABLE = new Set([408,425,429,500,502,503,504]);
const BLOCKED = /(captcha|access denied|요청을 처리할 수 없습니다|비정상적인 접근|로그인이 필요)/iu;
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

export class RequestFailedError extends Error { constructor(message) { super(message); this.name='RequestFailedError'; } }
export class BlockPageError extends Error { constructor(message) { super(message); this.name='BlockPageError'; } }

function retryDelay(response, attempt) {
  const retryAfter = response?.headers?.get?.('retry-after');
  if (retryAfter) {
    const seconds = Number(retryAfter);
    if (Number.isFinite(seconds)) return Math.min(20_000, Math.max(0, seconds * 1_000));
    const date = Date.parse(retryAfter);
    if (Number.isFinite(date)) return Math.min(20_000, Math.max(0, date - Date.now()));
  }
  return Math.min(4_000, 500 * 2 ** attempt);
}

function requestError(message, metadata = {}) {
  const error = new RequestFailedError(message);
  Object.assign(error, metadata);
  return error;
}

export async function hardenedFetch(url, { fetchImpl=fetch, timeoutMs=20_000, retries=2, maxBytes=8*1024*1024, requestIntervalMs=100, headers={}, ...options } = {}) {
  let lastError;
  for (let attempt=0; attempt<=retries; attempt+=1) {
    if (!attempt && requestIntervalMs) await sleep(requestIntervalMs);
    try {
      const response=await fetchImpl(url,{...options,redirect:'follow',headers:{accept:'text/html,application/json,application/xml;q=0.9,*/*;q=0.8','accept-language':'ko-KR,ko;q=0.9,en;q=0.6','user-agent':'mukdang-popup-indexer/1.0 (+https://mukdang.com)',...headers},signal:options.signal||AbortSignal.timeout(timeoutMs)});
      if (!response.ok) {
        const error=requestError(`${new URL(url).origin} 응답 ${response.status}`, {
          retryable: RETRYABLE.has(response.status), httpStatus: response.status,
          finalUrl: response.url || url, retryCount: attempt,
          contentType: response.headers.get('content-type') || null,
          responseSize: Number(response.headers.get('content-length') || 0) || null,
          timeout: false, occurredAt: new Date().toISOString()
        });
        if (!RETRYABLE.has(response.status) || attempt===retries) throw error;
        lastError=error; await sleep(retryDelay(response, attempt)); continue;
      }
      const length=Number(response.headers.get('content-length')||0);
      if (length>maxBytes) throw requestError(`${new URL(url).origin} 응답 크기 제한 초과`, { retryable: false, httpStatus: response.status, finalUrl: response.url || url, responseSize: length, retryCount: attempt });
      Object.defineProperty(response, 'requestMeta', { value: {
        url, finalUrl: response.url || url, httpStatus: response.status, retryCount: attempt,
        contentType: response.headers.get('content-type') || null, responseSize: length || null,
        timeout: false, occurredAt: new Date().toISOString()
      }, enumerable: false });
      return response;
    } catch(error) {
      const timeout = ['AbortError', 'TimeoutError'].includes(error?.name);
      const retryableNetwork = timeout || !('retryable' in error) || error.retryable === true;
      lastError = error instanceof RequestFailedError ? error : requestError(error?.message || String(error), {
        retryable: retryableNetwork, timeout, errorType: timeout ? 'timeout' : 'network_error', retryCount: attempt, finalUrl: url
      });
      if (!retryableNetwork || attempt===retries) throw lastError;
      await sleep(retryDelay(null, attempt));
    }
  }
  throw lastError;
}

export function assertNotBlockedPage(text, sourceId='source') {
  if (BLOCKED.test(String(text||''))) throw new BlockPageError(`${sourceId}: 차단 또는 로그인 페이지 감지`);
}
