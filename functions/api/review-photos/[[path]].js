export async function onRequestGet(context) {
  const key = Array.isArray(context.params.path) ? context.params.path.join('/') : String(context.params.path || '');
  if (!/^reviews\/\d+\/[0-9a-f-]+\.(?:jpg|png|webp)$/iu.test(key) || !context.env.REVIEW_PHOTOS) {
    return new Response('Not found', { status: 404 });
  }
  const { value, metadata } = await context.env.REVIEW_PHOTOS.getWithMetadata(key, { type: 'arrayBuffer' });
  if (!value) return new Response('Not found', { status: 404 });
  const headers = new Headers({ 'content-type': metadata?.contentType || 'application/octet-stream' });
  headers.set('cache-control', 'public, max-age=31536000, immutable');
  headers.set('x-content-type-options', 'nosniff');
  return new Response(value, { headers });
}
