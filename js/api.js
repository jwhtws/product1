export async function api(path, options = {}) {
  const response = await fetch(path, {
    ...options,
    headers: {
      'content-type': 'application/json',
      ...(options.headers || {})
    }
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw Object.assign(new Error(data.error || '서버 요청에 실패했습니다.'), {
      status: response.status,
      code: data.code || 'REQUEST_FAILED'
    });
  }
  return data;
}
