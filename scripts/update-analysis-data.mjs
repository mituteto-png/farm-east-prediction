import { readFile, writeFile } from 'node:fs/promises';
import { FARM_CHAMP_CONFIG } from '../farmchamp-config.js';
import { inningsToOuts } from '../farmchamp-eligibility.js';

export const clean=s=>s.replace(/<sup[^>]*>[\s\S]*?<\/sup>/g,'').replace(/<[^>]+>/g,'').replace(/&nbsp;/g,' ').trim();
export const nameKey=s=>s.normalize('NFKC').replace(/[\s・･.．]/g,'');
export function parseStats(html,type){
  const table=[...html.matchAll(/<table[^>]*class="[^"]*tablefix2[^"]*"[^>]*>([\s\S]*?)<\/table>/g)].find(m=>m[1].includes(type==='batting'?'打席':'投球回'))?.[1];
  if(!table)throw new Error('公式成績テーブルが見つかりません');
  const cells=s=>[...s.matchAll(/<(?:th|td)[^>]*>([\s\S]*?)<\/(?:th|td)>/g)].map(m=>clean(m[1]));
  const headers=cells(table.match(/<thead[^>]*>([\s\S]*?)<\/thead>/)[1]);
  const body=table.match(/<tbody[^>]*>([\s\S]*?)<\/tbody>/)[1],out={};
  for(const m of body.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/g)){
    const c=cells(m[1]);if(c.length!==headers.length)continue;
    const get=h=>{const s=c[headers.indexOf(h)];return s!==undefined&&s!==''&&s!=='-'&&!Number.isNaN(Number(s))?Number(s):null;};
    if(type==='batting')out[nameKey(c[0])]={name:c[0],games:get('試合'),pa:get('打席'),avg:get('打率'),obp:get('出塁率'),slg:get('長打率'),hr:get('本塁打')};
    else{const outs=inningsToOuts(c[headers.indexOf('投球回')]);out[nameKey(c[0])]={name:c[0],games:get('登板'),outs,era:get('防御率'),k:get('三振'),saves:get('セーブ'),whip:outs&&get('安打')!==null&&get('四球')!==null?(get('安打')+get('四球'))/(outs/3):null};}
  }
  return out;
}

async function main(){
 const root=new URL('../',import.meta.url),text=await readFile(new URL('farmchamp-data.js',root),'utf8');
 const elig=JSON.parse(text.slice(text.indexOf('=')+1).trim().replace(/;$/,''));
 let previous={};try{previous=JSON.parse(await readFile(new URL('analysis-data.json',root),'utf8'));}catch{}
 const teams={};
 for(const [team,td] of Object.entries(elig.teams)){
  const code=FARM_CHAMP_CONFIG.teams[team].code;
  try{
   const sources=[`https://npb.jp/bis/2026/stats/idb2_${code}.html`,`https://npb.jp/bis/2026/stats/idp2_${code}.html`];
   const pages=await Promise.all(sources.map(async url=>{const r=await fetch(url,{signal:AbortSignal.timeout(25000)});if(!r.ok)throw Error(`${r.status} ${url}`);return r.text();}));
   const batting=parseStats(pages[0],'batting'),pitching=parseStats(pages[1],'pitching'),players={};
   for(const p of td.players){const key=nameKey(p.name);players[p.id]={batting:batting[key]||null,pitching:pitching[key]||null};}
   teams[team]={players,sources,fetchedAt:new Date().toISOString(),status:'ok'};
  }catch(error){teams[team]={...(previous.teams?.[team]||{}),status:'error',error:String(error)};}
 }
 await writeFile(new URL('analysis-data.json',root),JSON.stringify({season:2026,eligibilityAsOf:elig.asOf,fetchedAt:new Date().toISOString(),teams},null,2)+'\n');
 console.log('Player analysis stats:',Object.keys(teams).length,'teams;',Object.values(teams).filter(t=>t.status==='error').length,'errors');
}
if(process.argv[1]&&new URL(import.meta.url).pathname===process.argv[1])await main();
