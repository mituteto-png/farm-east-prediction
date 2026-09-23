import test from 'node:test';
import assert from 'node:assert/strict';
import {buildTeamHistory,careerStepKind,parseDraftLabel} from '../player-career.js';
import {parsePlayerProfile} from '../scripts/update-player-careers.mjs';

test('draft labels distinguish regular and development drafts',()=>{
  assert.deepEqual(parseDraftLabel('2024年ドラフト3位'),{raw:'2024年ドラフト3位',year:2024,round:3,type:'regular'});
  assert.deepEqual(parseDraftLabel('2025年育成選手ドラフト2位'),{raw:'2025年育成選手ドラフト2位',year:2025,round:2,type:'development'});
  assert.equal(parseDraftLabel(''),null);
  assert.equal(parseDraftLabel(null),null);
});

test('team history only combines consecutive official-stat seasons',()=>{
  assert.deepEqual(buildTeamHistory([{year:2022,team:'球団A'},{year:2023,team:'球団A'},{year:2025,team:'球団B'}]),[{team:'球団A',startYear:2022,endYear:2023},{team:'球団B',startYear:2025,endYear:2025}]);
});

test('NPB profile parser keeps the player id and official facts',()=>{
  const html=`<table><tr><th>ポジション</th><td>投手</td></tr><tr><th>投打</th><td>左投左打</td></tr><tr><th>身長／体重</th><td>182cm／93kg</td></tr><tr><th>生年月日</th><td>1992年6月3日</td></tr><tr><th>経歴</th><td>拓大紅陵高 - 新日鉄住金かずさマジック</td></tr><tr><th>ドラフト</th><td>2015年ドラフト2位</td></tr></table><table id="tablefix_p"><tbody><tr class="registerStats"><td>2016</td><td>北海道日本ハム</td><td>30</td></tr><tr class="registerStats"><td>2017</td><td>北海道日本ハム</td><td>20</td></tr></tbody></table>`;
  const p=parsePlayerProfile(html,'41545132','2026-09-23T00:00:00.000Z');
  assert.equal(p.playerId,'41545132');assert.equal(p.profile.height,182);assert.equal(p.profile.birthDate,'1992-06-03');
  assert.equal(p.career.steps[0].kind,'高校');assert.equal(p.draft.round,2);assert.equal(p.teamHistory[0].startYear,2016);
});

test('career categorization does not invent dates',()=>{
  assert.equal(careerStepKind('早稲田大'),'大学');
  assert.equal(careerStepKind('カブス'),'所属歴');
});
