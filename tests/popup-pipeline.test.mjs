import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

test('일일 workflow가 한국시간 06:20에 단일 실행되고 실패를 알린다', async () => {
  const workflow = await readFile('.github/workflows/food-popup-refresh.yml', 'utf8');
  assert.match(workflow, /cron:\s*"20 21 \* \* \*"/u);
  assert.match(workflow, /workflow_dispatch:/u);
  assert.match(workflow, /group:\s*food-popup-refresh/u);
  assert.match(workflow, /cancel-in-progress:\s*false/u);
  assert.match(workflow, /refresh-popup-site-feed\.mjs --strict/u);
  assert.match(workflow, /audit:data-sources/u);
  assert.match(workflow, /seo:build/u);
  assert.match(workflow, /verify-popup-deployment\.mjs/u);
  assert.match(workflow, /if:\s*failure\(\)/u);
  assert.match(workflow, /issues\.create/u);
});

test('collector 실패·0건·급감에서 기존 사용자 feed를 원자적으로 보존한다', async () => {
  const refresh = await readFile('scripts/refresh-popup-site-feed.mjs', 'utf8');
  const collector = await readFile('scripts/refresh-food-popups.mjs', 'utf8');
  assert.match(refresh, /candidatePath/u);
  assert.match(refresh, /maxPublishDrop/u);
  assert.match(refresh, /rename\(candidatePath, outputPath\)/u);
  assert.match(collector, /기존 데이터 보존/u);
  assert.match(collector, /공식 수집 결과 급감 보호/u);
  assert.match(collector, /retainedPrevious/u);
});

test('Home·Search·Detail은 같은 운영 feed와 ID를 사용하고 fixture는 포함하지 않는다', async () => {
  const [app, seo, payload] = await Promise.all([
    readFile('app.js', 'utf8'), readFile('scripts/build-seo-pages.mjs', 'utf8'),
    readFile('data/popups.json', 'utf8').then(JSON.parse)
  ]);
  assert.match(app, /new URL\('data\/popups\.json', location\.href\)/u);
  assert.match(app, /state\.popups = Array\.isArray\(popupData\.popups\)/u);
  assert.match(app, /state\.popups\.find\(item => item\.id ===/u);
  assert.match(seo, /readFileSync\('data\/popups\.json'/u);
  assert.ok(payload.popups.every(row => !/(?:fixture|example\.com|테스트)/iu.test(`${row.id} ${row.sourceUrl}`)));
});

test('종료 팝업도 운영 feed와 SEO 생성 대상에 보존한다', async () => {
  const [payload, seo] = await Promise.all([
    readFile('data/popups.json', 'utf8').then(JSON.parse),
    readFile('scripts/build-seo-pages.mjs', 'utf8')
  ]);
  assert.ok(payload.popups.some(row => row.status === 'ended'));
  assert.match(seo, /for \(const popup of detailPopups\)/u);
  assert.match(seo, /popupDetailLinks/u);
});
