export function onRequest() {
  return new Response('google-site-verification: googled7516561f5a49a59.html\n', {
    headers: {
      'content-type': 'text/html; charset=utf-8',
      'cache-control': 'public, max-age=300'
    }
  });
}
