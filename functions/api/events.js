import { body, currentUser, json } from '../_lib/auth.js';

const allowedTypes = new Set(['search', 'save', 'list']);

export async function onRequestGet(context) {
  const url = new URL(context.request.url);
  if (url.searchParams.get('type') !== 'popular-searches') return json({ error: '지원하지 않는 조회입니다.' }, 400);
  const since = Date.now() - (30 * 24 * 60 * 60 * 1000);
  const result = await context.env.DB.prepare(`
    SELECT TRIM(detail) AS query, COUNT(*) AS search_count, MAX(created_at) AS last_searched_at
    FROM activity_events
    WHERE event_type = 'search' AND created_at >= ? AND LENGTH(TRIM(detail)) >= 2
    GROUP BY LOWER(TRIM(detail))
    ORDER BY search_count DESC, last_searched_at DESC
    LIMIT 20
  `).bind(since).all();
  return new Response(JSON.stringify({
    searches: (result.results || []).map(row => ({
      query: row.query,
      count: Number(row.search_count) || 0
    }))
  }), {
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'public, max-age=300',
      'access-control-allow-origin': '*'
    }
  });
}

export async function onRequestPost(context) {
  const data = await body(context.request);
  const eventType = String(data.type || '');
  if (!allowedTypes.has(eventType)) return json({ error: '지원하지 않는 활동입니다.' }, 400);
  const detail = String(data.detail || '').trim().slice(0, 500);
  if (!detail) return json({ error: '활동 내용이 필요합니다.' }, 400);
  const user = await currentUser(context);
  await context.env.DB.prepare('INSERT INTO activity_events (user_id, event_type, detail, created_at) VALUES (?, ?, ?, ?)')
    .bind(user?.id || null, eventType, detail, Date.now()).run();
  return json({ ok: true }, 201);
}
