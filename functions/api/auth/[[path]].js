import { body, clearCookie, clearFailures, createSession, currentUser, hashPassword, json, rateLimit, recordFailure, sessionCookie, verifyPassword } from '../../_lib/auth.js';

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function onRequest(context) {
  const path = Array.isArray(context.params.path) ? context.params.path.join('/') : (context.params.path || '');
  const method = context.request.method;
  if (method === 'GET' && path === 'me') {
    const user = await currentUser(context);
    return json({ user });
  }
  if (method === 'POST' && path === 'logout') {
    return json({ ok: true }, 200, { 'set-cookie': clearCookie('mukdang_session') });
  }
  if (method !== 'POST' || !['register', 'login'].includes(path)) return json({ error: 'Not found' }, 404);

  const data = await body(context.request);
  const email = String(data.email || '').trim().toLowerCase();
  const password = String(data.password || '');
  if (!emailPattern.test(email) || password.length < 8) {
    return json({ error: '올바른 이메일과 8자 이상의 비밀번호를 입력해 주세요.' }, 400);
  }

  let user;
  if (path === 'register') {
    const name = String(data.name || '').trim().slice(0, 40);
    if (!name) return json({ error: '이름을 입력해 주세요.' }, 400);
    const existing = await context.env.DB.prepare('SELECT id FROM users WHERE email = ?').bind(email).first();
    if (existing) return json({ error: '이미 가입된 이메일입니다.' }, 409);
    const passwordData = await hashPassword(password);
    const createdAt = Date.now();
    const result = await context.env.DB.prepare(
      'INSERT INTO users (email, name, password_hash, password_salt, created_at) VALUES (?, ?, ?, ?, ?)'
    ).bind(email, name, passwordData.hash, passwordData.salt, createdAt).run();
    user = { id: result.meta.last_row_id, email, name, role: 'member', status: 'active', created_at: createdAt };
  } else {
    const attemptKey = `user-login:${email}`;
    const limit = await rateLimit(context.env, attemptKey);
    if (!limit.allowed) return json({ error: '로그인 시도가 너무 많습니다. 15분 후 다시 시도해 주세요.', code: 'RATE_LIMITED' }, 429);
    const record = await context.env.DB.prepare('SELECT * FROM users WHERE email = ?').bind(email).first();
    if (!record || !(await verifyPassword(password, record.password_salt, record.password_hash))) {
      await recordFailure(context.env, attemptKey);
      return json({ error: '이메일 또는 비밀번호가 올바르지 않습니다.' }, 401);
    }
    if (record.status !== 'active') return json({ error: '정지된 계정입니다.' }, 403);
    await clearFailures(context.env, attemptKey);
    user = { id: record.id, email: record.email, name: record.name, role: record.role, status: record.status, created_at: record.created_at };
  }
  const token = await createSession(context.env.SESSION_SECRET, { userId: user.id });
  return json({ user }, 200, { 'set-cookie': sessionCookie('mukdang_session', token) });
}
