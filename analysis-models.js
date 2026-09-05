import { createLeagueModel } from './model-core.js';
import { getFarmChampionshipEligibility as eligibility, outsToInnings } from './farmchamp-eligibility.js';

export const ANALYSIS_CONFIG = Object.freeze({ iterations:20000, borderPA:12, borderOuts:9, battingShrinkPA:100, pitchingShrinkOuts:60 });
export const gameKey = g => `${g.date}|${g.home}|${g.away}`;
const clamp = (v,a=0,b=1) => Math.max(a,Math.min(b,v));
const pct = r => r.w/Math.max(1,r.w+r.l);
export function scenarioData(data, choices) {
  const copy=structuredClone(data);
  copy.schedule=copy.schedule.filter(g=>{
    const result=choices[gameKey(g)];
    if (!['home','away','draw'].includes(result)) return true;
    const h=copy.standings[g.home],a=copy.standings[g.away];
    if(result==='draw'){h.t++;a.t++;}else if(result==='home'){h.w++;a.l++;}else{a.w++;h.l++;}
    // Scores were not supplied: observed RS/RA remain unchanged; no invented score.
    return false;
  });
  return copy;
}

export function powerRanking(data) {
  const m=createLeagueModel(data), groups=m.strengthComparison();
  const scores=groups[0].teamScores;
  const totals=Object.values(data.standings).reduce((a,r)=>({games:a.games+r.w+r.l+r.t,rs:a.rs+r.rs,ra:a.ra+r.ra}),{games:0,rs:0,ra:0});
  return m.teams.map(team=>{
    const r=data.standings[team],games=r.w+r.l+r.t;
    const offense=100*clamp(.5*(r.rs/games)/(totals.rs/totals.games));
    const pitching=100*clamp(1-.5*(r.ra/games)/(totals.ra/totals.games));
    const pythag=r.rs**1.83/(r.rs**1.83+r.ra**1.83);
    return {team,district:m.teamDistrict[team],score:scores[team],offense,pitching,pythag,runDiff:(r.rs-r.ra)/games,pct:pct(r)};
  }).sort((a,b)=>b.score-a.score);
}

export function borderStatus(player,team,data,now=new Date()) {
  const e=eligibility(player,team,data,now), remaining=data.teams[team]?.remaining ?? null;
  const pitcher=player.role==='pitcher',shortage= Math.max(0,pitcher?e.requiredIP*3-player.ipOuts:e.requiredPA-player.pa);
  const shortageText=pitcher?`${outsToInnings(shortage)}回`:`${shortage}打席`;
  let status,label;
  if(e.status==='data_missing'){status='unknown';label='データ不足';}
  else if(e.eligible){status='eligible';label='資格あり（既存判定）';}
  else if(e.status==='provisional_clear'){status='clear';label='現時点で基準クリア';}
  else if(e.status==='ineligible'){status='no';label='基準未達／対象外';}
  else if(remaining===null){status='unknown';label='残り日程不明';}
  else if(remaining===0){status='no';label='追加出場機会なし';}
  else if(shortage<=(pitcher?ANALYSIS_CONFIG.borderOuts:ANALYSIS_CONFIG.borderPA)){status='border';label='ボーダー';}
  else {
    const played=Number(player.farmGames),current=pitcher?player.ipOuts:player.pa;
    // A pace scenario, not a probability or a baseball maximum. No "impossible" claim from PA/IP caps.
    const projected=played>0?current/played*remaining:0;
    status=shortage<=projected?'pace':'hard';label=status==='pace'?'平均ペースで到達圏':'平均ペースでは不足';
  }
  return {...e,status,label,shortage,shortageText,remaining};
}

export function bestRoster(team,eligData,stats,now=new Date()) {
  const teamData=eligData?.teams?.[team];
  if(!teamData) return {batters:[],pitchers:[],note:'資格名簿データなし'};
  const eligible=teamData.players.filter(p=>eligibility(p,team,eligData,now).eligible);
  const rows=stats?.teams?.[team]?.players||{};
  const batters=eligible.filter(p=>p.role==='batter'&&rows[p.id]?.batting?.obp!=null&&rows[p.id]?.batting?.slg!=null).map(p=>{
    const b=rows[p.id].batting,weight=b.pa/(b.pa+100);
    return {...p,stats:b,score:weight*(b.obp*1.8+b.slg)+(1-weight)*.95};
  }).sort((a,b)=>b.score-a.score);
  const picked=[];
  const take=(position,n)=>{for(const p of batters.filter(p=>p.position===position&&!picked.includes(p)).slice(0,n))picked.push(p);};
  take('捕手',1);take('内野手',4);take('外野手',3);
  const dh=batters.find(p=>!picked.includes(p)); if(dh)picked.push({...dh,position:'DH'});
  // Positions finer than catcher/infield/outfield are not available in official roster feed.
  const ordered=picked.slice().sort((a,b)=>b.stats.obp-a.stats.obp);
  if(ordered.length>=4){const slug=ordered.slice(2).sort((a,b)=>b.stats.slg-a.stats.slg)[0];ordered.splice(ordered.indexOf(slug),1);ordered.splice(3,0,slug);}
  const pitchers=eligible.filter(p=>p.role==='pitcher'&&rows[p.id]?.pitching?.era!=null&&rows[p.id]?.pitching?.whip!=null).map(p=>{
    const b=rows[p.id].pitching,weight=b.outs/(b.outs+60);
    const quality=weight*(b.era+2*b.whip)+(1-weight)*6;
    return {...p,stats:b,score:quality};
  }).sort((a,b)=>a.score-b.score);
  const long=pitchers.filter(p=>p.stats.games>0&&p.stats.outs/p.stats.games>=9).slice(0,2);
  const short=pitchers.filter(p=>!long.includes(p)).slice(0,5);
  return {batters:ordered,pitchers:[...long.map((p,i)=>({...p,assignment:i?'第2先発候補':'先発候補'})),...short.map((p,i)=>({...p,assignment:i===0?'抑え候補':i<3?'勝ちパターン候補':'中継ぎ候補'}))],note:'当サイト独自予想。資格あり判定だけを採用し、暫定クリアは除外。先発区分は1登板平均3回以上を代用。最近の起用・詳細守備位置・負傷は未反映。'};
}

export function championshipSimulation(data,iterations=ANALYSIS_CONFIG.iterations) {
  const m=createLeagueModel(data),teams=m.teams,counts=Object.fromEntries(teams.map(t=>[t,{entry:0,title:0}]));
  let seed=2166136261;for(const c of JSON.stringify(data.standings)+JSON.stringify(data.schedule)){seed=Math.imul(seed^c.charCodeAt(0),16777619)>>>0;}
  const random=()=>{seed^=seed<<13;seed^=seed>>>17;seed^=seed<<5;return(seed>>>0)/4294967296;};
  const games=m.schedule.map(g=>({...g,p:m.homeWinProbability(g.home,g.away)}));
  const tie=(a,b,records,keys)=>pct(records[b])-pct(records[a])||records[b].w-records[a].w||keys[b]-keys[a];
  const duel=(a,b)=>random()<1/(1+Math.exp(-2.30*(m.teamStrength(a)-m.teamStrength(b))))?a:b;
  for(let i=0;i<iterations;i++){
    const r=structuredClone(data.standings);
    for(const g of games){const v=random();if(v<.035){r[g.home].t++;r[g.away].t++;}else if(v<.035+.965*g.p){r[g.home].w++;r[g.away].l++;}else{r[g.away].w++;r[g.home].l++;}}
    const keys=Object.fromEntries(teams.map(t=>[t,random()]));
    const orders=Object.values(m.districts).map(d=>d.teams.slice().sort((a,b)=>tie(a,b,r,keys)));
    const champions=orders.map(x=>x[0]).sort((a,b)=>tie(a,b,r,keys));
    const wildcard=orders.map(x=>x[1]).sort((a,b)=>tie(a,b,r,keys))[0];
    for(const t of [...champions,wildcard])counts[t].entry++;
    const first=duel(champions[1],champions[2]),second=duel(champions[0],wildcard);
    counts[duel(first,second)].title++;
  }
  return teams.map(team=>({team,entry:counts[team].entry/iterations,conditional:counts[team].entry?counts[team].title/counts[team].entry:null,title:counts[team].title/iterations})).sort((a,b)=>b.title-a.title);
}
