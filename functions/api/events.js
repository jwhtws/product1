import { body, currentUser, json } from '../_lib/auth.js';

const allowedTypes = new Set(['search', 'save', 'list']);

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
