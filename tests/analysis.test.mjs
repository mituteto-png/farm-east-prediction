import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {createLeagueModel} from '../model-core.js';
import {scenarioData,gameKey,powerRanking,championshipSimulation,borderStatus,bestRoster} from '../analysis-models.js';
import {getFarmChampionshipEligibility} from '../farmchamp-eligibility.js';
import {parseStats} from '../scripts/update-analysis-data.mjs';
const root=new URL('../',import.meta.url),read=p=>fs.readFileSync(new URL(p,root),'utf8');
const context={window:{location:{search:''}},URLSearchParams};vm.runInNewContext(read('auto-data.js'),context);const data=context.window.FARM_AUTO_DATA;
vm.runInNewContext(read('farmchamp-data.js'),context);const elig=context.window.FARM_CHAMP_DATA;

test('V3.0 20,000 iterations are unchanged after shared-module extraction',()=>{
 vm.runInNewContext(read('app.js'),context);
 const before=context.window.FARM_MODEL.simulate(20000),after=createLeagueModel(data).simulate(20000);
 assert.equal(JSON.stringify(after),JSON.stringify(before));
});
test('multiple scenario outcomes change only copied W/L/T and remaining schedule',()=>{
 const original=JSON.stringify(data),choices={};data.schedule.slice(0,3).forEach((g,i)=>choices[gameKey(g)]=['home','away','draw'][i]);
 const changed=scenarioData(data,choices);assert.equal(JSON.stringify(data),original);assert.equal(changed.schedule.length,data.schedule.length-3);
 const totals=d=>Object.values(d.standings).reduce((a,r)=>({w:a.w+r.w,l:a.l+r.l,t:a.t+r.t}),{w:0,l:0,t:0});
 const a=totals(data),b=totals(changed);assert.equal(b.w-a.w,2);assert.equal(b.l-a.l,2);assert.equal(b.t-a.t,2);
 for(const t of Object.keys(data.standings)){assert.equal(data.standings[t].rs,changed.standings[t].rs);assert.equal(data.standings[t].ra,changed.standings[t].ra);}
 assert.equal(JSON.stringify(scenarioData(data,{})),original);
});
test('power scores reproduce existing district-index averages for all 14 teams',()=>{
 const rank=powerRanking(data),m=createLeagueModel(data);assert.equal(rank.length,14);assert.equal(new Set(rank.map(r=>r.team)).size,14);
 for(const d of m.strengthComparison()){const rows=rank.filter(r=>r.district===d.key);assert.ok(Math.abs(rows.reduce((s,r)=>s+r.score,0)/rows.length-d.score)<1e-10);}
});
test('tournament has exactly four entrants and one champion each iteration',()=>{
 const results=championshipSimulation(data,2000);assert.ok(Math.abs(results.reduce((s,r)=>s+r.entry,0)-4)<1e-12);assert.ok(Math.abs(results.reduce((s,r)=>s+r.title,0)-1)<1e-12);
 for(const r of results){assert.ok(r.title<=r.entry);if(r.conditional!==null)assert.ok(Math.abs(r.entry*r.conditional-r.title)<1e-12);}
});
test('baseball 24.1 innings toward 28 is a 3.2 inning shortage',()=>{
 const d={teams:{T:{gamesCompleted:100,projectedTeamGames:119,remaining:19}}},p={role:'pitcher',ipOuts:73,pa:0,farmGames:10,firstTeamRegistered:true,rookie:false,dataStatus:'complete',registeredAtCutoff:true,farmAppeared:true};
 const r=borderStatus(p,'T',d,new Date('2026-09-05'));assert.equal(r.shortage,11);assert.equal(r.shortageText,'3.2回');
 p.ipOuts=75;assert.equal(borderStatus(p,'T',d,new Date('2026-09-05')).status,'border');
});
test('best roster contains only eligible players, no duplicates or invented replacements',()=>{
 const stats=JSON.parse(read('analysis-data.json'));
 for(const team of Object.keys(elig.teams)){const r=bestRoster(team,elig,stats,new Date('2026-09-05'));assert.ok(r.batters.length<=9);const ids=[...r.batters,...r.pitchers].map(p=>p.id);assert.equal(ids.length,new Set(ids).size);for(const p of [...r.batters,...r.pitchers])assert.equal(getFarmChampionshipEligibility(p,team,elig,new Date('2026-09-05')).eligible,true);}
});
test('missing statistic remains null instead of fabricated zero',()=>{
 const html='<table class="tablefix2"><thead><tr><th>選手</th><th>打席</th><th>出塁率</th><th>長打率</th></tr></thead><tbody><tr><td>選手A</td><td>0</td><td>-</td><td>-</td></tr></tbody></table>';
 const r=parseStats(html,'batting')['選手A'];assert.equal(r.obp,null);assert.equal(r.slg,null);
});
