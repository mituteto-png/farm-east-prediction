import {readFile,writeFile} from 'node:fs/promises';
import {buildTeamHistory,careerStepKind,parseDraftLabel} from '../player-career.js';

const STATS=new URL('../player-stats-data.json',import.meta.url);
const OUTPUT=new URL('../player-career-data.json',import.meta.url);
const UA='farm-east-prediction/4.0 (+https://github.com/mituteto-png/farm-east-prediction)';
const MAX_AGE_DAYS=process.env.CAREER_FORCE==='1'?0:30;
const CONCURRENCY=4;
const stripHtml=(s='')=>s.replace(/<script[\s\S]*?<\/script>/gi,' ').replace(/<style[\s\S]*?<\/style>/gi,' ').replace(/<br\s*\/?>/gi,' ').replace(/<[^>]+>/g,' ').replace(/&nbsp;|&#160;/gi,' ').replace(/&amp;/gi,'&').replace(/&quot;/gi,'"').replace(/&#39;|&apos;/gi,"'").replace(/&#(\d+);/g,(_,n)=>String.fromCodePoint(Number(n))).replace(/\s+/g,' ').trim();
const cells=row=>[...row.matchAll(/<(?:td|th)[^>]*>([\s\S]*?)<\/(?:td|th)>/gi)].map(m=>stripHtml(m[1]));
const field=(html,label)=>stripHtml(html.match(new RegExp(`<th[^>]*>\\s*${label}\\s*<\\/th>\\s*<td[^>]*>([\\s\\S]*?)<\\/td>`,'i'))?.[1]||'')||null;
const sourceUrl=id=>`https://npb.jp/bis/players/${id}.html`;
const sleep=ms=>new Promise(r=>setTimeout(r,ms));

export function parsePlayerProfile(html,playerId,checkedAt=new Date().toISOString()){
  const careerRaw=field(html,'経歴');
  const draftRaw=field(html,'ドラフト');
  const body=field(html,'身長／体重');
  const birth=field(html,'生年月日');
  const handedness=field(html,'投打');
  const position=field(html,'ポジション');
  const rows=[];
  for(const table of html.matchAll(/<table[^>]*id=["']tablefix_[^"']+["'][^>]*>([\s\S]*?)<\/table>/gi)){
    const tbody=table[1].match(/<tbody[^>]*>([\s\S]*?)<\/tbody>/i)?.[1]||'';
    for(const row of tbody.matchAll(/<tr[^>]*class=["'][^"']*registerStats[^"']*["'][^>]*>([\s\S]*?)<\/tr>/gi)){
      const c=cells(row[1]),year=Number(c[0]);
      if(Number.isInteger(year)&&c[1])rows.push({year,team:c[1]});
    }
  }
  const dimensions=body?.match(/(\d+)cm\s*／\s*(\d+)kg/);
  return {
    playerId,
    source:'NPB公式 個人年度別成績',
    sourceUrl:sourceUrl(playerId),
    lastChecked:checkedAt,
    profile:{
      position,
      throws:handedness?.match(/^(.+)投/)?.[1]||null,
      bats:handedness?.match(/投(.+)打$/)?.[1]||null,
      height:dimensions?Number(dimensions[1]):null,
      weight:dimensions?Number(dimensions[2]):null,
      birthDate:birth?.replace(/(\d{4})年(\d{1,2})月(\d{1,2})日/,(_,y,m,d)=>`${y}-${m.padStart(2,'0')}-${d.padStart(2,'0')}`)||null,
      birthplace:null
    },
    career:{raw:careerRaw,steps:careerRaw?careerRaw.split(/\s+-\s+/).map((label,index)=>({order:index+1,label,kind:careerStepKind(label),period:null})):[]},
    draft:parseDraftLabel(draftRaw),
    teamHistory:buildTeamHistory(rows),
    registrationHistory:[],
    dataStatus:'official_profile'
  };
}

async function fetchText(url){
  let last;
  for(let attempt=0;attempt<3;attempt++)try{
    const response=await fetch(url,{headers:{'user-agent':UA,accept:'text/html'},signal:AbortSignal.timeout(30000)});
    if(!response.ok)throw Error(`HTTP ${response.status}`);
    return await response.text();
  }catch(error){last=error;await sleep(500*(attempt+1));}
  throw last;
}

async function main(){
  const stats=JSON.parse(await readFile(STATS,'utf8'));
  let previous={players:{}};try{previous=JSON.parse(await readFile(OUTPUT,'utf8'));}catch{}
  const records=Object.values(stats.teams).flatMap(team=>team.players).filter(player=>player.playerId);
  const ids=[...new Set(records.map(player=>player.playerId))];
  const cutoff=Date.now()-MAX_AGE_DAYS*86400000;
  const players={};let cursor=0,updated=0,errors=[];
  async function worker(){
    while(cursor<ids.length){
      const playerId=ids[cursor++],cached=previous.players?.[playerId],checked=Date.parse(cached?.lastChecked||'');
      if(cached&&checked>=cutoff){players[playerId]=cached;continue;}
      try{players[playerId]=parsePlayerProfile(await fetchText(sourceUrl(playerId)),playerId);updated++;}
      catch(error){if(cached)players[playerId]={...cached,dataStatus:'stale',error:String(error)};else errors.push(`${playerId}: ${error}`);}
      await sleep(100);
    }
  }
  await Promise.all(Array.from({length:CONCURRENCY},worker));
  const output={season:stats.season,generatedAt:new Date().toISOString(),source:'https://npb.jp/bis/players/',playerCount:Object.keys(players).length,status:errors.length?'partial':'ok',limitations:['出身地はNPB個人年度別成績ページに掲載がないため未収録','育成・支配下登録日、加入経緯、在籍のみで一軍出場がない過去球団は同ページだけでは確認できないため未収録','所属履歴はNPB一軍年度別成績で所属が確認できる年度のみ'],errors,players};
  await writeFile(OUTPUT,JSON.stringify(output,null,2)+'\n');
  console.log(`Player careers: ${output.playerCount}/${ids.length}; refreshed ${updated}; errors ${errors.length}`);
  if(errors.length)process.exitCode=1;
}
if(process.argv[1]&&new URL(import.meta.url).pathname===process.argv[1])await main();
