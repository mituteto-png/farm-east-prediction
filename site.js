import {createLeagueModel} from './model-core.js';
import {powerRanking,borderStatus,bestRoster,gameKey} from './analysis-models.js';
import {outsToInnings} from './farmchamp-eligibility.js';

const raw=window.FARM_AUTO_DATA,page=document.body.dataset.page;
const routes=[['index.html','ホーム'],['prediction.html','優勝予測'],['simulator.html','シミュレーター'],['farmchamp.html','日本選手権'],['power-ranking.html','パワーランキング'],['about.html','データ・モデル']];
const el=id=>document.getElementById(id),esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const percent=v=>v===null?'算出対象外':`${(v*100).toFixed(1)}%`;
const allTeams=Object.keys(raw?.standings||{}),params=new URLSearchParams(location.search);
let saved={};try{saved=JSON.parse(localStorage.getItem('farm-selection')||'{}');}catch{}
let selected=allTeams.includes(params.get('team'))?params.get('team'):allTeams.includes(saved.team)?saved.team:allTeams[0];
let busy=false,playerStats=null,champRows=null,worker=null;
const choices={};
function url(route){const [file,hash]=route.split('#'),p=new URLSearchParams({team:selected,district:raw.standings[selected]?.district||'east'});return `${file}?${p}${hash?'#'+hash:''}`;}
function navigation(){
 el('siteNav').innerHTML=routes.map(([path,label])=>`<a href="${url(path)}" ${path===page?'aria-current="page"':''}>${label}</a>`).join('');
 el('breadcrumb').innerHTML=page==='index.html'?'':`<a href="${url('index.html')}">ホーム</a> › ${routes.find(r=>r[0]===page)?.[1]}`;
 document.querySelectorAll('[data-route]').forEach(a=>a.href=url(a.dataset.route));
 el('sharedSelection').innerHTML=`<label for="globalTeam">選択球団</label><select id="globalTeam">${allTeams.map(t=>`<option ${t===selected?'selected':''}>${esc(t)}</option>`).join('')}</select><span class="tiny">ページを移動しても引き継ぎます</span>`;
 el('globalTeam').addEventListener('change',e=>select(e.target.value));
}
function select(team,notify=true){if(!allTeams.includes(team))return;selected=team;try{localStorage.setItem('farm-selection',JSON.stringify({team}));}catch{}
 const u=new URL(location.href);u.searchParams.set('team',team);u.searchParams.set('district',raw.standings[team].district);history.replaceState(null,'',u);navigation();
 if(notify){window.dispatchEvent(new CustomEvent('farmselect',{detail:{team}}));window.dispatchEvent(new CustomEvent('farmteamchange',{detail:{team}}));}
 if(page==='simulator.html')renderGames();if(page==='farmchamp.html')renderChamp();
}
window.addEventListener('farmteamchange',e=>{if(e.detail?.team!==selected)select(e.detail.team,false);});
window.addEventListener('farmchampteamselect',e=>select(e.detail.team));
function runWorker(kind,source,choices={}){return new Promise((resolve,reject)=>{
 const job=new Worker('./analysis-worker.js',{type:'module'});worker=job;
 const timeout=setTimeout(()=>{job.terminate();reject(Error('計算が時間内に終わりませんでした。条件を減らして再試行してください。'));},90000);
 job.onmessage=e=>{clearTimeout(timeout);job.terminate();e.data.error?reject(Error(e.data.error)):resolve(e.data.result);};
 job.onerror=e=>{clearTimeout(timeout);job.terminate();reject(Error(e.message));};job.postMessage({kind,source,choices});
});}
function renderGames(){
 const district=raw.standings[selected].district;
 const games=raw.schedule.filter(g=>raw.standings[g.home]?.district===district||raw.standings[g.away]?.district===district);
 const dates=[...new Set(games.map(g=>g.date))];
 el('scenarioGames').innerHTML=dates.map((date,i)=>`<details class="accordion scenarioDay" ${i===0?'open':''}><summary>${date}｜${games.filter(g=>g.date===date).length}試合</summary><div class="accordionBody">${games.filter(g=>g.date===date).map(g=>`<label class="scenarioGame"><b>${esc(g.home)} 対 ${esc(g.away)}</b><select data-game="${esc(gameKey(g))}" ${busy?'disabled':''}>${[['','未指定'],['home',g.home+'勝利'],['away',g.away+'勝利'],['draw','引き分け']].map(([v,label])=>`<option value="${v}" ${choices[gameKey(g)]===v?'selected':''}>${esc(label)}</option>`).join('')}</select></label>`).join('')}</div></details>`).join('');
 el('scenarioGames').querySelectorAll('select').forEach(s=>s.onchange=()=>{if(s.value)choices[s.dataset.game]=s.value;else delete choices[s.dataset.game];el('scenarioStatus').textContent=`全地区合計 ${Object.keys(choices).length}試合指定。変更後は再計算してください。`;});
}
async function simulator(){renderGames();
 el('runScenario').onclick=async()=>{
  if(busy)return;busy=true;el('runScenario').disabled=true;el('resetScenario').disabled=true;renderGames();el('scenarioStatus').textContent='20,000回 × 現在／仮想結果を計算中…';
  const snapshot=structuredClone(choices);
  try{const {before,after}=await runWorker('scenario',raw,snapshot);
   el('scenarioResults').innerHTML=`<h3>${Object.keys(snapshot).length}試合を仮適用した結果</h3>`+allTeams.map(t=>{const a=before.rank[t][0],b=after.rank[t][0],delta=(b-a)*100;return `<article class="compareRow"><b>${esc(t)}</b><span>現在 ${percent(a)}</span><span>仮想 ${percent(b)}</span><strong>${delta>=0?'+':''}${delta.toFixed(1)}pt</strong><div class="track"><div class="fill" style="width:${b*100}%;background:#075bc7"></div></div></article>`;}).join('');
   el('scenarioStatus').textContent='計算完了。得失点は変更せず、指定した勝敗だけを適用した参考値です。';
  }catch(error){el('scenarioStatus').textContent=error.message;}finally{busy=false;el('runScenario').disabled=false;el('resetScenario').disabled=false;renderGames();}
 };
 el('resetScenario').onclick=()=>{Object.keys(choices).forEach(k=>delete choices[k]);renderGames();el('scenarioResults').innerHTML='';el('scenarioStatus').textContent='すべて未指定に戻しました。';};
}

function power(){
 const ranking=powerRanking(raw);
 el('powerList').innerHTML=ranking.map((r,i)=>`<details class="card powerCard"><summary><span class="rankNumber">${i+1}</span><b>${esc(r.team)}</b><strong>${r.score.toFixed(1)}<small> /100</small></strong></summary><div class="track"><div class="fill" style="width:${r.score}%;background:#075bc7"></div></div><div class="powerDetails"><p>打撃評価 <b>${r.offense.toFixed(1)}</b>｜投手評価 <b>${r.pitching.toFixed(1)}</b></p><p>得失点差／試合 ${r.runDiff>=0?'+':''}${r.runDiff.toFixed(2)}｜ピタゴラス勝率 ${percent(r.pythag)}</p><p>地区内順位 ${Object.entries(raw.standings).filter(([t,s])=>s.district===r.district).sort((a,b)=>b[1].w/(b[1].w+b[1].l)-a[1].w/(a[1].w+a[1].l)||b[1].w-a[1].w).findIndex(([t])=>t===r.team)+1}位</p><p class="tiny">直近状態・前回順位：継続履歴未取得</p><a href="prediction.html?team=${encodeURIComponent(r.team)}">${esc(r.team)}の優勝確率を見る →</a></div></details>`).join('');
}

let activePanel=['border','roster','eligibility'].includes(location.hash.slice(1))?location.hash.slice(1):'odds';
let borderFilter='border';
function renderChamp(){
 const data=window.FARM_CHAMP_DATA;
 el('farmChampionshipApp').hidden=activePanel!=='eligibility';el('champAnalysis').hidden=activePanel==='eligibility';
 el('champNav').querySelectorAll('button').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.panel===activePanel)));
 if(activePanel==='eligibility'){if(!data?.teams?.[selected]){el('farmChampionshipApp').hidden=true;el('champAnalysis').hidden=false;el('champAnalysis').textContent=selected+'：進出候補の資格名簿データはありません。';}return;}
 if(activePanel==='odds'){
  el('champAnalysis').innerHTML='<h2>Farm Championship Model v1.0</h2><p>当サイト独自予測・大会が予定どおり実施される場合の参考値</p><details class="accordion"><summary>進出から優勝までの計算方法</summary><div class="accordionBody">残り公式戦を20,000回実施し、地区優勝3球団と地区2位最高勝率のワイルドカードを選出。優勝球団の勝率2位対3位、1位対ワイルドカードの準決勝から決勝まで計算します。対戦勝率はV3.0の球団戦力と同じ40%・45%・15%を使用し、中立球場のためホーム補正は付けません。同率の公式対戦成績・過年度勝率は未取得のため勝数・乱数で近似。雨天中止・延長方式・選手別戦力は未反映です。資格選手だけの戦力比較は信頼できる一律名簿がそろわないため除外しています。総合優勝確率＝進出確率×進出時優勝確率。</div></details>'+(!champRows?'<p role="status">大会20,000回を計算中…</p>':champRows.map(r=>`<article class="oddsCard"><h3>${esc(r.team)}</h3><div><span>日本選手権進出</span><b>${percent(r.entry)}</b></div><div><span>進出した場合の優勝</span><b>${percent(r.conditional)}</b></div><div><span>総合 日本選手権優勝</span><strong>${percent(r.title)}</strong></div><div class="track"><div class="fill" style="width:${r.title*100}%;background:#075bc7"></div></div></article>`).join(''));
  return;
 }
 const team=data?.teams?.[selected];
 if(!team){el('champAnalysis').innerHTML=`<h2>${esc(selected)}</h2><p>進出候補の資格名簿データがないため算出対象外です。球団選択から候補球団を選んでください。</p>`;return;}
 if(activePanel==='border'){
  const rows=team.players.map(p=>({p,e:borderStatus(p,selected,data)}));
  const filters=[['border','ボーダー'],['all','全選手'],['eligible','資格あり'],['batter','野手'],['pitcher','投手'],['rookie','新人'],['noFirst','一軍登録なし'],['threshold','規定到達型']];
  const matched=rows.filter(({p,e})=>borderFilter==='all'||borderFilter==='border'&&e.status==='border'||borderFilter==='eligible'&&e.eligible||p.role===borderFilter||borderFilter==='rookie'&&p.rookie||borderFilter==='noFirst'&&p.firstTeamRegistered===false||borderFilter==='threshold'&&p.firstTeamRegistered===true&&!p.rookie);
  el('champAnalysis').innerHTML=`<h2>${esc(selected)} 出場資格ボーダー</h2><p class="tiny">必要数は残り日程を全消化した試合数から計算。ボーダー＝あと12打席／3回以内。平均ペース判定＝これまでの1出場平均×残り試合（全試合出場を仮定）。到達確率ではありません。新人・一軍未登録の判定は既存資格データに依存します。</p><div class="subnav">${filters.map(([v,l])=>`<button data-border="${v}" aria-pressed="${v===borderFilter}">${l}</button>`).join('')}</div><p>${matched.length}名</p><div class="featureGrid">${matched.map(({p,e})=>`<article class="card"><h3>${esc(p.name)}</h3><span class="statusTag">${e.label}</span><p>${p.role==='pitcher'?`現在 ${outsToInnings(p.ipOuts)}回 ／ 必要 ${e.requiredIP}回`:`現在 ${p.pa}打席 ／ 必要 ${e.requiredPA}打席`}</p><b>${e.eligible?'規定数による条件不要':e.shortage?'あと'+e.shortageText:'現在の基準に到達'}</b><p class="tiny">${esc(e.reason)}</p></article>`).join('')||'<p>この条件に該当する選手はいません。</p>'}</div>`;
  el('champAnalysis').querySelectorAll('[data-border]').forEach(b=>b.onclick=()=>{borderFilter=b.dataset.border;renderChamp();});return;
 }
 const roster=bestRoster(selected,data,playerStats);
 el('champAnalysis').innerHTML=`<h2>${esc(selected)} ベストメンバー予想</h2><p>${roster.note}</p><details class="accordion"><summary>選出基準・データの限界</summary><div class="accordionBody">野手：出塁率×1.8＋長打率を打席/(打席＋100)で信頼度調整し、基準0.95へ縮小。捕手1・内野4・外野3・DH1を優先。打順は出塁率順、4番に残る長打率最上位を配置。投手：防御率＋WHIP×2を投球回20回相当で基準6へ縮小し、小さい順で選出。登板平均3回以上を先発候補とする代用基準です。実際の先発・救援履歴、最近の起用、詳細守備位置、故障は未取得。欠員は架空選手で埋めません。</div></details>${!playerStats?'<p>追加成績を取得できませんでした。</p>':`<p class="tiny">追加成績取得：${esc(playerStats.teams?.[selected]?.fetchedAt||'なし')} ${playerStats.teams?.[selected]?.status==='error'?'（取得エラー：前回値）':''}</p>`}<h3>想定スタメン ${roster.batters.length}/9名</h3><ol class="rosterList">${roster.batters.map(p=>`<li><b>${esc(p.name)}</b> ${esc(p.position)}<span>出塁率 ${p.stats.obp.toFixed(3)}｜長打率 ${p.stats.slg.toFixed(3)}｜${p.stats.pa}打席</span></li>`).join('')}</ol><p class="tiny">内野・外野の詳細ポジションはデータ不足のため指定しません。</p><h3>想定投手陣</h3><div class="featureGrid">${roster.pitchers.map(p=>`<article class="card"><span class="eyebrow">${p.assignment}</span><h3>${esc(p.name)}</h3><p>防御率 ${p.stats.era.toFixed(2)}｜WHIP ${p.stats.whip.toFixed(2)}<br>${outsToInnings(p.stats.outs)}回・${p.stats.games}登板・${p.stats.k}奪三振</p></article>`).join('')||'<p>資格と投手成績を確認できる選手がいません。</p>'}</div>`;
}

async function championship(){
 el('champNav').querySelectorAll('button').forEach(b=>b.onclick=()=>{activePanel=b.dataset.panel;history.replaceState(null,'',url('farmchamp.html#'+activePanel));renderChamp();});
 window.dispatchEvent(new CustomEvent('farmteamchange',{detail:{team:selected}}));
 renderChamp();
 const statsPromise=fetch('./analysis-data.json').then(r=>{if(!r.ok)throw Error('stats unavailable');return r.json();}).then(d=>{playerStats=d;if(activePanel==='roster')renderChamp();}).catch(()=>{});
 try{champRows=await runWorker('championship',raw);if(activePanel==='odds')renderChamp();}catch(e){el('champAnalysis').textContent='大会確率を計算できませんでした：'+e.message;}
 await statsPromise;
}

if(!raw||allTeams.length!==14){el('dataStatusPill').textContent='データ取得エラー';el('updateFallback').classList.add('show');el('updateFallbackText').textContent='公式データを取得できませんでした。再読み込みしてください。';}
else{
 navigation();el('dataStatusPill').textContent='取得済み公式データ';el('dataStatusPill').className='statusPill';
 el('dataDateBadge').textContent=`成績 ${raw.officialThroughDate||raw.standingsAsOf}終了時点`;
 el('autoUpdateBadge').textContent='毎日8:00・17:00確認';
 const stamp=document.createElement('p');stamp.className='tiny timestamp';stamp.textContent=`取得日時（日本時間）：${raw.fetchedAt?new Date(raw.fetchedAt).toLocaleString('ja-JP',{timeZone:'Asia/Tokyo'}):'不明'}｜非公式モデル・20,000回。確率は確定値ではありません。`;el('sharedSelection').after(stamp);
 if(page==='simulator.html')simulator();if(page==='power-ranking.html')power();if(page==='farmchamp.html')championship();
}
el('retryButton').onclick=()=>location.reload();
