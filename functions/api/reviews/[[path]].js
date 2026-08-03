import { body, currentUser, json } from '../../_lib/auth.js';

const photoUrl = key => key ? `/api/review-photos/${key.split('/').map(encodeURIComponent).join('/')}` : null;

const row = (value, viewerId = null) => ({
  id: value.id,
  author: value.author,
  restaurant: value.restaurant_id,
  restaurantName: value.restaurant_name,
  rating: value.rating,
  text: value.text,
  photoUrl: photoUrl(value.photo_key),
  helpful: value.helpful,
  createdAt: value.created_at,
  canEdit: Number(value.user_id) === Number(viewerId)
});

const validReview = data => {
  const rating = Number(data.rating);
  const text = String(data.text || '').trim().slice(0, 1000);
  return { rating, text, valid: Boolean(text) && Number.isInteger(rating) && rating >= 1 && rating <= 5 };
};

const reviewPhoto = data => {
  const encoded = String(data?.data || '');
  const mime = String(data?.mime || '').toLowerCase();
  if (!encoded && !mime) return null;
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(mime) || !/^[A-Za-z0-9+/]+={0,2}$/.test(encoded)) {
    throw new Error('INVALID_REVIEW_PHOTO');
  }
  const binary = atob(encoded);
  if (!binary.length || binary.length > 2 * 1024 * 1024) throw new Error('INVALID_REVIEW_PHOTO');
  const bytes = Uint8Array.from(binary, character => character.charCodeAt(0));
  const validMagic = mime === 'image/jpeg' ? bytes[0] === 0xff && bytes[1] === 0xd8
    : mime === 'image/png' ? bytes.slice(0, 4).every((value, index) => value === [0x89, 0x50, 0x4e, 0x47][index])
      : String.fromCharCode(...bytes.slice(0, 4)) === 'RIFF' && String.fromCharCode(...bytes.slice(8, 12)) === 'WEBP';
  if (!validMagic) throw new Error('INVALID_REVIEW_PHOTO');
  return { bytes, mime, extension: mime === 'image/png' ? 'png' : mime === 'image/webp' ? 'webp' : 'jpg' };
};

async function reviewSettings(env) {
  const result = await env.DB.prepare(
    `SELECT setting_key, setting_value FROM service_settings
     WHERE setting_key IN ('daily_review_limit', 'restaurant_daily_review_limit', 'duplicate_review_block')`
  ).all();
  const values = Object.fromEntries((result.results || []).map(row => [row.setting_key, row.setting_value]));
  return {
    dailyLimit: Math.max(1, Number(values.daily_review_limit) || 5),
    restaurantDailyLimit: Math.max(1, Number(values.restaurant_daily_review_limit) || 1),
    duplicateBlock: values.duplicate_review_block !== '0'
  };
}

export async function onRequest(context) {
  const path = Array.isArray(context.params.path) ? context.params.path.join('/') : (context.params.path || '');
  const method = context.request.method;
  const url = new URL(context.request.url);

  if (method === 'GET' && !path) {
    const viewer = await currentUser(context);
    const restaurant = url.searchParams.get('restaurant');
    const query = restaurant
      ? context.env.DB.prepare(`SELECT reviews.*, users.name AS author FROM reviews JOIN users ON users.id = reviews.user_id
          WHERE restaurant_id = ? AND hidden = 0 ORDER BY created_at DESC LIMIT 200`).bind(restaurant)
      : context.env.DB.prepare(`SELECT reviews.*, users.name AS author FROM reviews JOIN users ON users.id = reviews.user_id
          WHERE hidden = 0 ORDER BY created_at DESC LIMIT 100`);
    const result = await query.all();
    if (restaurant) {
      const summary = await context.env.DB.prepare(
        'SELECT COUNT(*) AS count, ROUND(AVG(rating), 1) AS average FROM reviews WHERE restaurant_id = ? AND hidden = 0'
      ).bind(restaurant).first();
      return json({
        reviews: result.results.map(value => row(value, viewer?.id)),
        summary: { count: Number(summary?.count) || 0, average: Number(summary?.average) || 0 }
      });
    }
    const summaries = await context.env.DB.prepare(
      'SELECT restaurant_id, COUNT(*) AS count, ROUND(AVG(rating), 1) AS average FROM reviews WHERE hidden = 0 GROUP BY restaurant_id'
    ).all();
    return json({
      reviews: result.results.map(value => row(value, viewer?.id)),
      summaries: Object.fromEntries((summaries.results || []).map(value => [
        value.restaurant_id,
        { count: Number(value.count) || 0, average: Number(value.average) || 0 }
      ]))
    });
  }

  if (method === 'POST' && !path) {
    const user = await currentUser(context);
    if (!user) return json({ error: '로그인이 필요합니다.' }, 401);
    const data = await body(context.request);
    const { rating, text, valid } = validReview(data);
    const restaurantId = String(data.restaurantId || '').trim().slice(0, 500);
    const restaurantName = String(data.restaurantName || '').trim().slice(0, 150);
    if (!restaurantId || !restaurantName || !valid) {
      return json({ error: '리뷰 내용을 확인해 주세요.' }, 400);
    }
    let photo = null;
    try { photo = reviewPhoto(data.photo); }
    catch { return json({ error: '사진은 JPG, PNG, WebP 형식으로 2MB 이하만 등록할 수 있습니다.' }, 400); }
    if (photo && !context.env.REVIEW_PHOTOS) return json({ error: '사진 저장소가 준비되지 않았습니다.' }, 503);
    const createdAt = Date.now();
    const limits = await reviewSettings(context.env);
    if (limits.duplicateBlock) {
      const duplicate = await context.env.DB.prepare(
        'SELECT id FROM reviews WHERE user_id = ? AND restaurant_id = ? AND LOWER(TRIM(text)) = LOWER(?) AND hidden = 0 LIMIT 1'
      ).bind(user.id, restaurantId, text).first();
      if (duplicate) return json({ error: '같은 내용의 리뷰는 중복 등록할 수 없습니다.', code: 'DUPLICATE_REVIEW' }, 409);
    }
    const koreaOffset = 9 * 60 * 60 * 1000;
    const dayStart = Math.floor((createdAt + koreaOffset) / 86400000) * 86400000 - koreaOffset;
    const [dailyCount, restaurantDailyCount] = await Promise.all([
      context.env.DB.prepare('SELECT COUNT(*) AS count FROM reviews WHERE user_id = ? AND created_at >= ?')
        .bind(user.id, dayStart).first(),
      context.env.DB.prepare('SELECT COUNT(*) AS count FROM reviews WHERE user_id = ? AND restaurant_id = ? AND created_at >= ?')
        .bind(user.id, restaurantId, dayStart).first()
    ]);
    if (Number(dailyCount?.count) >= limits.dailyLimit) {
      return json({ error: `리뷰는 하루에 최대 ${limits.dailyLimit}개까지 등록할 수 있습니다.`, code: 'DAILY_REVIEW_LIMIT' }, 409);
    }
    if (Number(restaurantDailyCount?.count) >= limits.restaurantDailyLimit) {
      return json({ error: `같은 식당에는 하루에 최대 ${limits.restaurantDailyLimit}개까지 등록할 수 있습니다.`, code: 'RESTAURANT_DAILY_REVIEW_LIMIT' }, 409);
    }
    const photoKey = photo ? `reviews/${user.id}/${crypto.randomUUID()}.${photo.extension}` : null;
    if (photo) await context.env.REVIEW_PHOTOS.put(photoKey, photo.bytes.buffer, { metadata: { contentType: photo.mime } });
    let result;
    try {
      result = await context.env.DB.prepare(
        'INSERT INTO reviews (user_id, restaurant_id, restaurant_name, rating, text, photo_key, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)'
      ).bind(user.id, restaurantId, restaurantName, rating, text, photoKey, createdAt).run();
    } catch (error) {
      if (photoKey) await context.env.REVIEW_PHOTOS.delete(photoKey);
      throw error;
    }
    return json({ review: { id: result.meta.last_row_id, author: user.name, restaurant: restaurantId, restaurantName, rating, text, photoUrl: photoUrl(photoKey), helpful: 0, createdAt, canEdit: true } }, 201);
  }

  const review = path.match(/^(\d+)$/);
  if (review && method === 'PATCH') {
    const user = await currentUser(context);
    if (!user) return json({ error: '로그인이 필요합니다.' }, 401);
    const data = await body(context.request);
    const { rating, text, valid } = validReview(data);
    if (!valid) return json({ error: '리뷰 내용을 확인해 주세요.' }, 400);
    const existing = await context.env.DB.prepare(
      'SELECT id, restaurant_id FROM reviews WHERE id = ? AND user_id = ? AND hidden = 0'
    ).bind(Number(review[1]), user.id).first();
    if (!existing) return json({ error: '본인이 작성한 리뷰만 수정할 수 있습니다.' }, 403);
    const limits = await reviewSettings(context.env);
    if (limits.duplicateBlock) {
      const duplicate = await context.env.DB.prepare(
        'SELECT id FROM reviews WHERE user_id = ? AND restaurant_id = ? AND id != ? AND LOWER(TRIM(text)) = LOWER(?) AND hidden = 0 LIMIT 1'
      ).bind(user.id, existing.restaurant_id, Number(review[1]), text).first();
      if (duplicate) return json({ error: '같은 내용의 리뷰가 이미 있습니다.', code: 'DUPLICATE_REVIEW' }, 409);
    }
    await context.env.DB.prepare('UPDATE reviews SET rating = ?, text = ? WHERE id = ? AND user_id = ?')
      .bind(rating, text, Number(review[1]), user.id).run();
    return json({ ok: true });
  }
  if (review && method === 'DELETE') {
    const user = await currentUser(context);
    if (!user) return json({ error: '로그인이 필요합니다.' }, 401);
    const existing = await context.env.DB.prepare(
      'SELECT id, photo_key FROM reviews WHERE id = ? AND user_id = ? AND hidden = 0'
    ).bind(Number(review[1]), user.id).first();
    if (!existing) return json({ error: '본인이 작성한 리뷰만 삭제할 수 있습니다.' }, 403);
    await context.env.DB.prepare('UPDATE reviews SET hidden = 1 WHERE id = ? AND user_id = ?').bind(Number(review[1]), user.id).run();
    if (existing.photo_key && context.env.REVIEW_PHOTOS) await context.env.REVIEW_PHOTOS.delete(existing.photo_key);
    return json({ ok: true });
  }

  const helpful = path.match(/^(\d+)\/helpful$/);
  if (method === 'POST' && helpful) {
    await context.env.DB.prepare('UPDATE reviews SET helpful = helpful + 1 WHERE id = ? AND hidden = 0').bind(Number(helpful[1])).run();
    return json({ ok: true });
  }
  return json({ error: 'Not found' }, 404);
}
