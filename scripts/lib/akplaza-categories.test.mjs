import assert from 'node:assert/strict';
import test from 'node:test';
import { parseAkPlazaPopupCategories } from './akplaza-categories.mjs';

test('AK 지점별 식품 및 팝업 카테고리를 공식 목록에서 발견한다', () => {
  const html = `
    <input onclick="clickCategory('11')" value="식품관">
    <input onclick="clickCategory('12')" value="푸드">
    <input onclick="clickCategory('22')" value="팝토피아">
    <input onclick="clickCategory('01')" value="화장품">
  `;
  assert.deepEqual(parseAkPlazaPopupCategories(html), [
    { code: '11', label: '식품관', isFood: true },
    { code: '12', label: '푸드', isFood: true },
    { code: '22', label: '팝토피아', isFood: false }
  ]);
});

test('AK 카테고리 메뉴를 못 읽어도 알려진 지점별 코드를 모두 순회한다', () => {
  assert.deepEqual(parseAkPlazaPopupCategories(''), [
    { code: '11', label: '식품관', isFood: true },
    { code: '12', label: '식품', isFood: true },
    { code: '22', label: '팝토피아', isFood: false }
  ]);
});
