import { body, currentUser, json } from '../../_lib/auth.js';

const row = value => ({
  id: value.id,
  author: value.author,
  restaurant: value.restaurant_id,
  restaurantName: value.restaurant_name,
  rating: value.rating,
  text: value.text,
  helpful: value.helpful,
  createdAt: value.created_at
});

export async function onRequest(context) {
  const path = Array.isArray(context.params.path) ? context.params.path.join('/') : (context.params.path || '');
  const method = context.request.method;
  const url = new URL(context.request.url);

  if (method === 'GET' && !path) {
    const restaurant = url.searchParams.get('restaurant');
    const query = restaurant
      ? context.env.DB.prepare(`SELECT reviews.*, users.name AS author FROM reviews JOIN users ON users.id = reviews.user_id
          WHERE restaurant_id = ? AND hidden = 0 ORDER BY created_at DESC LIMIT 200`).bind(restaurant)
      : context.env.DB.prepare(`SELECT reviews.*, users.name AS author FROM reviews JOIN users ON users.id = reviews.user_id
          WHERE hidden = 0 ORDER BY created_at DESC LIMIT 100`);
    const result = await query.all();
    return json({ reviews: result.results.map(row) });
  }

  if (method === 'POST' && !path) {
    const user = await currentUser(context);
    if (!user) return json({ error: '로그인이 필요합니다.' }, 401);
    const data = await body(context.request);
    const rating = Number(data.rating);
    const text = String(data.text || '').trim().slice(0, 1000);
    const restaurantId = String(data.restaurantId || '').trim().slice(0, 500);
    const restaurantName = String(data.restaurantName || '').trim().slice(0, 150);
    if (!restaurantId || !restaurantName || !text || !Number.isInteger(rating) || rating < 1 || rating > 5) {
      return json({ error: '리뷰 내용을 확인해 주세요.' }, 400);
    }
    const createdAt = Date.now();
    const result = await context.env.DB.prepare(
      'INSERT INTO reviews (user_id, restaurant_id, restaurant_name, rating, text, created_at) VALUES (?, ?, ?, ?, ?, ?)'
    ).bind(user.id, restaurantId, restaurantName, rating, text, createdAt).run();
    return json({ review: { id: result.meta.last_row_id, author: user.name, restaurant: restaurantId, restaurantName, rating, text, helpful: 0, createdAt } }, 201);
  }

  const helpful = path.match(/^(\d+)\/helpful$/);
  if (method === 'POST' && helpful) {
    await context.env.DB.prepare('UPDATE reviews SET helpful = helpful + 1 WHERE id = ? AND hidden = 0').bind(Number(helpful[1])).run();
    return json({ ok: true });
  }
  return json({ error: 'Not found' }, 404);
}
