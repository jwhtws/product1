import { body, currentUser, json } from '../../_lib/auth.js';

const allowedKeys = new Set(['profile', 'saved', 'lists']);

export async function onRequest(context) {
  const path = Array.isArray(context.params.path) ? context.params.path.join('/') : (context.params.path || '');
  const user = await currentUser(context);
  if (!user) return json({ error: '로그인이 필요합니다.' }, 401);

  if (context.request.method === 'GET' && !path) {
    const result = await context.env.DB.prepare('SELECT data_key, data_value, updated_at FROM user_data WHERE user_id = ?')
      .bind(user.id).all();
    const data = {};
    for (const item of result.results) {
      try { data[item.data_key] = JSON.parse(item.data_value); } catch { data[item.data_key] = null; }
    }
    return json({ data });
  }

  if (context.request.method === 'PUT' && allowedKeys.has(path)) {
    const data = await body(context.request);
    const value = JSON.stringify(data.value ?? null);
    if (value.length > 100000) return json({ error: '저장 데이터가 너무 큽니다.' }, 413);
    const statements = [context.env.DB.prepare(`INSERT INTO user_data (user_id, data_key, data_value, updated_at)
        VALUES (?, ?, ?, ?) ON CONFLICT(user_id, data_key)
        DO UPDATE SET data_value = excluded.data_value, updated_at = excluded.updated_at`)
      .bind(user.id, path, value, Date.now())];
    const profileName = path === 'profile' ? String(data.value?.name || '').trim().slice(0, 40) : '';
    if (profileName) statements.push(context.env.DB.prepare('UPDATE users SET name = ? WHERE id = ?').bind(profileName, user.id));
    await context.env.DB.batch(statements);
    return json({ ok: true });
  }
  return json({ error: 'Not found' }, 404);
}
