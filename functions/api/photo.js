export async function onRequestGet(context) {
  const url = new URL(context.request.url);
  const name = (url.searchParams.get('name') || '').trim();
  if (!name || !/^places\/[^/]+\/photos\/[^/]+$/.test(name)) return new Response('Invalid photo', { status: 400 });
  if (!context.env.GOOGLE_PLACES_API_KEY) return new Response('API key is not configured', { status: 503 });

  const cache = caches.default;
  const cacheKey = new Request(url.toString());
  const cached = await cache.match(cacheKey);
  if (cached) return cached;
  const source = `https://places.googleapis.com/v1/${name}/media?maxWidthPx=900&skipHttpRedirect=false&key=${encodeURIComponent(context.env.GOOGLE_PLACES_API_KEY)}`;
  const response = await fetch(source, { redirect: 'follow' });
  if (!response.ok) return new Response('Photo unavailable', { status: response.status });
  const outgoing = new Response(response.body, response);
  outgoing.headers.set('cache-control', 'public, max-age=86400');
  context.waitUntil(cache.put(cacheKey, outgoing.clone()));
  return outgoing;
}
