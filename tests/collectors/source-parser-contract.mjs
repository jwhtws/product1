import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { parseFixturePayload, SourceStructureChangedError } from '../../scripts/parsers/food-popup-source-parser.mjs';

export function runSourceParserContract(name) {
  test(`${name}: fixture parser 계약`, async () => {
    const fixture=JSON.parse(await readFile(new URL(`../fixtures/food-popups/${name}.json`,import.meta.url),'utf8'));
    const result=parseFixturePayload(fixture);
    assert.equal(result.rows.length,1);
    assert.deepEqual(result.rows[0],{
      id:`${fixture.sourceId}:evt-100`,sourceItemId:'evt-100',name:'여름 디저트 팝업',brand:'먹당베이커리',venue:fixture.detail.venue,
      startDate:'2026-08-01',endDate:'2026-08-31',sourceUrl:fixture.detail.sourceUrl,imageUrl:fixture.detail.imageUrl,sourceName:fixture.sourceName
    });
    assert.equal(result.stats.discoveredCount,6);
    assert.equal(result.stats.duplicateSourceItemCount,1);
    assert.deepEqual(result.stats.rejectionReasons,{duplicate_source_item:1,expired:1,not_food:1,not_popup:1,invalid_date:1});
    assert.equal(result.sourceHealth.status,'success_with_items');
    assert.equal(parseFixturePayload({...fixture,...fixture.emptyList}).sourceHealth.status,'search_incomplete');
    assert.equal(parseFixturePayload({...fixture,...fixture.emptyList,verifiedEmptyEvidence:true}).sourceHealth.status,'verified_empty');
    assert.throws(()=>parseFixturePayload({sourceId:fixture.sourceId,...fixture.malformed}),SourceStructureChangedError);
  });
}
