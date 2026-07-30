import { body, clearCookie, clearFailures, createSession, currentUser, hashPassword, hashToken, json, rateLimit, recordFailure, sessionCookie, verifyPassword } from '../../_lib/auth.js';

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const nicknamePattern = /^[\p{L}\p{N}]+$/u;

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
  if (method === 'POST' && path === 'delete-account') {
    const user = await currentUser(context);
    if (!user) return json({ error: '로그인이 필요합니다.' }, 401);
    const data = await body(context.request);
    const password = String(data.password || '');
    const record = await context.env.DB.prepare(
      'SELECT id, email, password_hash, password_salt FROM users WHERE id = ?'
    ).bind(user.id).first();
    if (!record || !(await verifyPassword(password, record.password_salt, record.password_hash))) {
      return json({ error: '비밀번호가 올바르지 않습니다.' }, 401);
    }
    await context.env.DB.batch([
      context.env.DB.prepare('DELETE FROM reviews WHERE user_id = ?').bind(user.id),
      context.env.DB.prepare('DELETE FROM user_data WHERE user_id = ?').bind(user.id),
      context.env.DB.prepare('UPDATE activity_events SET user_id = NULL WHERE user_id = ?').bind(user.id),
      context.env.DB.prepare('DELETE FROM email_verifications WHERE email = ?').bind(record.email),
      context.env.DB.prepare('DELETE FROM auth_attempts WHERE attempt_key = ?').bind(`user-login:${record.email}`),
      context.env.DB.prepare('DELETE FROM users WHERE id = ?').bind(user.id)
    ]);
    return json({ ok: true }, 200, { 'set-cookie': clearCookie('mukdang_session') });
  }
  if (method === 'POST' && path === 'request-code') {
    const data = await body(context.request);
    const email = String(data.email || '').trim().toLowerCase();
    if (!emailPattern.test(email)) return json({ error: '올바른 이메일을 입력해 주세요.' }, 400);
    if (!context.env.RESEND_API_KEY || !context.env.EMAIL_FROM) {
      return json({ error: '이메일 발송 설정이 완료되지 않았습니다.' }, 503);
    }
    const existing = await context.env.DB.prepare('SELECT id FROM users WHERE email = ?').bind(email).first();
    if (existing) return json({ error: '이미 가입된 이메일입니다.' }, 409);
    const clientIp = context.request.headers.get('CF-Connecting-IP') || 'unknown';
    const emailKey = `email-code:${email}`;
    const ipKey = `email-code-ip:${clientIp}`;
    const [emailLimit, ipLimit] = await Promise.all([
      rateLimit(context.env, emailKey, 3, 15 * 60 * 1000),
      rateLimit(context.env, ipKey, 10, 15 * 60 * 1000)
    ]);
    if (!emailLimit.allowed || !ipLimit.allowed) {
      return json({ error: '인증번호 요청이 너무 많습니다. 15분 후 다시 시도해 주세요.' }, 429);
    }
    await Promise.all([
      recordFailure(context.env, emailKey, 15 * 60 * 1000),
      recordFailure(context.env, ipKey, 15 * 60 * 1000)
    ]);
    const random = new Uint32Array(1);
    crypto.getRandomValues(random);
    const code = String(random[0] % 10000).padStart(4, '0');
    const codeHash = await hashToken(context.env.SESSION_SECRET, `${email}:${code}`);
    const now = Date.now();
    await context.env.DB.prepare(`INSERT INTO email_verifications (email, code_hash, expires_at, attempts, created_at)
      VALUES (?, ?, ?, 0, ?) ON CONFLICT(email) DO UPDATE SET
      code_hash = excluded.code_hash, expires_at = excluded.expires_at, attempts = 0, created_at = excluded.created_at`)
      .bind(email, codeHash, now + 10 * 60 * 1000, now).run();
    const mailResponse = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        authorization: `Bearer ${context.env.RESEND_API_KEY}`,
        'content-type': 'application/json'
      },
      body: JSON.stringify({
        from: context.env.EMAIL_FROM,
        to: [email],
        subject: '[먹당] 회원가입 인증번호',
        html: `<div style="font-family:Arial,sans-serif;padding:24px;color:#222"><h2 style="margin:0 0 16px">먹당 이메일 인증</h2><p>아래 인증번호를 회원가입 화면에 입력해 주세요.</p><strong style="display:block;margin:24px 0;font-size:32px;letter-spacing:8px">${code}</strong><p style="color:#777;font-size:13px">인증번호는 10분 동안 한 번만 사용할 수 있습니다.</p></div>`
      })
    });
    if (!mailResponse.ok) {
      await context.env.DB.prepare('DELETE FROM email_verifications WHERE email = ?').bind(email).run();
      return json({ error: '인증 메일을 보내지 못했습니다. 잠시 후 다시 시도해 주세요.' }, 502);
    }
    return json({ ok: true, message: '인증번호를 이메일로 보냈습니다.' });
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
    const clientIp = context.request.headers.get('CF-Connecting-IP') || 'unknown';
    const emailLimitKey = `user-register-email:${email}`;
    const ipLimitKey = `user-register-ip:${clientIp}`;
    const [emailLimit, ipLimit] = await Promise.all([
      rateLimit(context.env, emailLimitKey, 3, 24 * 60 * 60 * 1000),
      rateLimit(context.env, ipLimitKey, 5, 24 * 60 * 60 * 1000)
    ]);
    if (!emailLimit.allowed || !ipLimit.allowed) {
      return json({ error: '가입 요청이 너무 많습니다. 잠시 후 다시 시도해 주세요.', code: 'RATE_LIMITED' }, 429);
    }
    await Promise.all([
      recordFailure(context.env, emailLimitKey, 24 * 60 * 60 * 1000),
      recordFailure(context.env, ipLimitKey, 24 * 60 * 60 * 1000)
    ]);
    const name = String(data.name || '').trim().slice(0, 40);
    if (!name) return json({ error: '이름을 입력해 주세요.' }, 400);
    if (!nicknamePattern.test(name)) return json({ error: '닉네임은 문자와 숫자만 사용할 수 있습니다.' }, 400);
    const verificationCode = String(data.code || '').trim();
    if (!/^\d{4}$/.test(verificationCode)) return json({ error: '이메일로 받은 4자리 인증번호를 입력해 주세요.' }, 400);
    const verification = await context.env.DB.prepare(
      'SELECT code_hash, expires_at, attempts FROM email_verifications WHERE email = ?'
    ).bind(email).first();
    if (!verification || verification.expires_at < Date.now()) {
      return json({ error: '인증번호가 만료되었습니다. 다시 받아 주세요.' }, 400);
    }
    if (verification.attempts >= 5) {
      return json({ error: '인증번호 입력 횟수를 초과했습니다. 새 인증번호를 받아 주세요.' }, 429);
    }
    const submittedHash = await hashToken(context.env.SESSION_SECRET, `${email}:${verificationCode}`);
    if (submittedHash !== verification.code_hash) {
      await context.env.DB.prepare('UPDATE email_verifications SET attempts = attempts + 1 WHERE email = ?').bind(email).run();
      return json({ error: '인증번호가 올바르지 않습니다.' }, 400);
    }
    const existing = await context.env.DB.prepare('SELECT id FROM users WHERE email = ?').bind(email).first();
    if (existing) return json({ error: '이미 가입된 이메일입니다.' }, 409);
    const existingName = await context.env.DB.prepare('SELECT id FROM users WHERE name = ? COLLATE NOCASE').bind(name).first();
    if (existingName) return json({ error: '이미 사용 중인 닉네임입니다.' }, 409);
    const passwordData = await hashPassword(password);
    const createdAt = Date.now();
    let result;
    try {
      result = await context.env.DB.prepare(
        'INSERT INTO users (email, name, password_hash, password_salt, created_at) VALUES (?, ?, ?, ?, ?)'
      ).bind(email, name, passwordData.hash, passwordData.salt, createdAt).run();
    } catch (error) {
      if (/unique/i.test(String(error?.message || error))) return json({ error: '이미 가입된 이메일 또는 사용 중인 닉네임입니다.' }, 409);
      throw error;
    }
    await context.env.DB.prepare('DELETE FROM email_verifications WHERE email = ?').bind(email).run();
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
