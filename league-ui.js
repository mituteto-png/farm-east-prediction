import { createLeagueModel } from './model-core.js';
const raw=window.FARM_AUTO_DATA||{};
const hasOfficialData=Object.keys(raw.standings||{}).length===14;
const model=createLeagueModel(raw);
const {simulate,strengthComparison,teamStrength,districts,standings,schedule,teams,teamDistrict,remainingCounts,magicInfo,approximateEarliest,TEAM_COLORS}=model;
const ITERATIONS=20000,DISTRICT_COLORS={east:'#0d5bd7',central:'#14855b',west:'#7454c9'};
const recentResults=raw.results||[];
let stored={};try{stored=JSON.parse(localStorage.getItem('farm-selection')||'{}')}catch{}
const params=new URLSearchParams(location.search);
let selectedTeam=params.get('team')||stored.team||'日本ハム';if(!standings[selectedTeam])selectedTeam=teams[0];
let selectedDistrict=teamDistrict[selectedTeam],scheduleFilter=selectedTeam,scheduleExpanded=false,simulation=null;
const clone=x=>JSON.parse(JSON.stringify(x)),clamp=(v,a=0,b=1)=>Math.max(a,Math.min(b,v)),pct=r=>r.w/Math.max(1,r.w+r.l);
const formatPct=(v,d=1)=>`${(v*100).toFixed(d)}%`,dateOrder=d=>{const [m,n]=String(d).split('/').map(Number);return m*100+n||9999;};
const districtTeams=(k=selectedDistrict)=>districts[k]?.teams||[],districtName=k=>districts[k]?.name||k;
const teamDot=t=>`<span class="dot" style="background:${TEAM_COLORS[t]}"></span>`;
const calcGamesBehind=(a,b)=>((a.w-b.w)+(b.l-a.l))/2;
const setText=(id,v)=>{const e=document.getElementById(id);if(e)e.textContent=v;};
function mathematicalStatus(team){const counts=remainingCounts(),r=standings[team],maximum=(r.w+counts[team])/Math.max(1,r.w+r.l+counts[team]);const out=districtTeams(teamDistrict[team]).some(t=>t!==team&&standings[t].w/Math.max(1,standings[t].w+standings[t].l+counts[t])>maximum+1e-12);return out?{possible:false,label:'優勝可能性消滅',tone:'out'}:{possible:true,label:'数学的可能性あり',tone:'possible'};}
const formatProbability=(team,value)=>!mathematicalStatus(team).possible?'消滅':value===0?'0.0%（標本0回）':formatPct(value);
function persistSelection(){window.dispatchEvent(new CustomEvent('farmteamchange',{detail:{team:selectedTeam}}));}
  function renderHeader() {
    const through = raw.officialThroughDate || raw.standingsAsOf || "8/25";
    setText("dataDateBadge", `公式成績 ${through}終了時点`);
    setText("autoUpdateBadge", "毎日8:00・17:00更新");
    const pill = document.getElementById("dataStatusPill");
    const fallback = document.getElementById("updateFallback");
    if (hasOfficialData) {
      pill.textContent = "取得済み公式データ";
      pill.className = "statusPill";
      fallback.classList.remove("show");
    } else {
      pill.textContent = "前回データ表示中";
      pill.className = "statusPill error";
      fallback.classList.add("show");
      setText("updateFallbackText", `公式データを読み込めないため、固定データ（${through}時点）を表示しています。`);
    }
    setText("todayUpdated", `最終データ ${through}`);
  }

  function renderDistrictOverview() {
 if(!document.getElementById("districtOverview"))return;
    const container = document.getElementById("districtOverview");
    container.innerHTML = Object.entries(districts).map(([key, district]) => {
      const ordered = district.teams.slice().sort((a, b) => simulation.rank[b][0] - simulation.rank[a][0]);
      const leader = ordered[0];
      return `<button type="button" class="card districtCard ${key === selectedDistrict ? "active" : ""}" data-district="${key}" style="--district-color:${DISTRICT_COLORS[key]}">
        <span class="districtName">${district.name}</span>
        <span class="leader">${teamDot(leader)}${leader}</span>
        <span class="leaderProb">${formatPct(simulation.rank[leader][0])}</span>
        <span class="tiny">${ordered.slice(1).map(team => `${team} ${formatPct(simulation.rank[team][0])}`).join(" ／ ")}</span>
      </button>`;
    }).join("");
    container.querySelectorAll("button").forEach(button => button.addEventListener("click", () => selectDistrict(button.dataset.district)));
  }

  function renderDistrictSwitch() {
 if(!document.getElementById("districtSwitch"))return;
    const container = document.getElementById("districtSwitch");
    container.innerHTML = Object.entries(districts).map(([key, district]) => `<button type="button" class="filterBtn ${key === selectedDistrict ? "active" : ""}" data-district="${key}">${district.name}</button>`).join("");
    container.querySelectorAll("button").forEach(button => button.addEventListener("click", () => selectDistrict(button.dataset.district)));
  }

  function renderTopStats() {
 if(!document.getElementById("selectedTeamCard"))return;
    const probability = simulation.rank[selectedTeam][0];
    const average = simulation.avg[selectedTeam];
    setText("selectedRecord", `平均最終成績：${average.w.toFixed(1)}勝 ${average.l.toFixed(1)}敗 ${average.t.toFixed(1)}分`);
    const magic = magicInfo(selectedTeam);
    const ordered = districtTeams().slice().sort((a, b) => pct(standings[b]) - pct(standings[a]) || standings[b].w - standings[a].w);
    const record = standings[selectedTeam];
    const card = document.getElementById("selectedTeamCard");
    card.style.setProperty("--team-color", TEAM_COLORS[selectedTeam] || DISTRICT_COLORS[selectedDistrict]);
    setText("headlineLabel", "地区優勝確率");
    setText("selectedName", selectedTeam);
    setText("selectedChamp", formatProbability(selectedTeam, probability));
    document.getElementById("selectedChampBar").style.width = `${probability * 100}%`;
    setText("selectedCurrentRecord", `${ordered.indexOf(selectedTeam) + 1}位｜${record.w}勝${record.l}敗${record.t}分｜勝率 ${pct(record).toFixed(3).replace(/^0/, "")}`);
    setText("magicNow", magic.magic === null ? "—" : `M${magic.magic}`);
    setText("magicTarget", `対象：${magic.rival || "—"}`);
    setText("earliestDate", approximateEarliest(selectedTeam));
    setText("remainingLabel", `${selectedTeam} 残り試合`);
    setText("hamRemaining", `${remainingCounts()[selectedTeam]}試合`);
  }

  function renderToday() {
 if(!document.getElementById("todayFarm"))return;
    const leaders = Object.entries(districts).map(([key, district]) => {
      const team = district.teams.slice().sort((a, b) => simulation.rank[b][0] - simulation.rank[a][0])[0];
      return { key, district: district.name, team, probability: simulation.rank[team][0] };
    });
    const contenders = new Set(teams.filter(team => mathematicalStatus(team).possible));
    const important = schedule.filter(game => teamDistrict[game.home] && teamDistrict[game.home] === teamDistrict[game.away] && contenders.has(game.home) && contenders.has(game.away))
      .sort((a, b) => dateOrder(a.date) - dateOrder(b.date) || (simulation.rank[b.home][0] + simulation.rank[b.away][0]) - (simulation.rank[a.home][0] + simulation.rank[a.away][0]))[0];
    const closest = leaders.slice().sort((a, b) => dateOrder(simulation.clinch.predictedDate[a.team]) - dateOrder(simulation.clinch.predictedDate[b.team]))[0];
    const lead = leaders.map(item => `<div class="todayItem"><span class="todayLabel">${item.district} 最有力</span><strong class="todayValue">${teamDot(item.team)}${item.team} ${formatPct(item.probability)}</strong><span class="todaySub">非公式モデルの地区優勝確率</span></div>`).join("");
    document.getElementById("todayFarm").innerHTML = `<div class="todayLead"><span class="todayLabel">次の注目直接対決</span><strong class="todayValue">${important ? `${important.home} vs ${important.away}` : "対象試合なし"}</strong><span class="todaySub">${important ? `${important.date}｜${districtName(teamDistrict[important.home])}直接対決` : "残り日程に候補同士の直接対決はありません"}</span></div>${lead}<div class="todayItem"><span class="todayLabel">優勝決定が最も近い予測</span><strong class="todayValue">${closest.team} ${simulation.clinch.predictedDate[closest.team]}</strong><span class="todaySub">優勝シミュレーションの中央値</span></div>`;
  }

  function renderStandings() {
 if(!document.getElementById("standingsBody"))return;
    const list = districtTeams().map(team => ({ team, record: standings[team], value: pct(standings[team]) })).sort((a, b) => b.value - a.value || b.record.w - a.record.w);
    const leader = list[0].record;
    document.getElementById("standingsTitle").textContent = `${districtName(selectedDistrict)} 現在順位`;
    document.getElementById("standingsBody").innerHTML = list.map((item, index) => {
      const status = mathematicalStatus(item.team);
      return `<tr class="${item.team === selectedTeam ? "selected" : ""}">
      <td><span class="rankNumber">${index + 1}</span></td>
      <td><button class="teamBtn" type="button" data-team="${item.team}">${teamDot(item.team)}${item.team}<span class="tapCue">›</span></button></td>
      <td>${item.record.w}勝${item.record.l}敗${item.record.t}分</td>
      <td>${item.value.toFixed(3).replace(/^0/, "")}</td>
      <td>${index === 0 ? "—" : calcGamesBehind(leader, item.record).toFixed(1)}</td>
      <td><b>${formatProbability(item.team, simulation.rank[item.team][0])}</b></td>
      <td><span class="statusTag ${status.tone}">${status.label}</span></td>
    </tr>`;
    }).join("");
    document.querySelectorAll("#standingsBody .teamBtn").forEach(button => button.addEventListener("click", () => selectTeam(button.dataset.team)));
  }

  function renderChampionshipProbabilities() {
 if(!document.getElementById("champList"))return;
    const district = districtTeams();
    const best = Math.max(...district.map(team => simulation.rank[team][0]));
    document.getElementById("champTitle").textContent = `${districtName(selectedDistrict)} 優勝確率`;
    document.getElementById("champList").innerHTML = district.map(team => {
      const probability = simulation.rank[team][0];
      const status = mathematicalStatus(team);
      return `<div class="probRow"><button class="teamBtn" data-team="${team}" type="button">${teamDot(team)}${team}</button>
        <div class="track"><div class="fill" style="width:${Math.max(0.3, probability * 100)}%;background:${TEAM_COLORS[team]}"></div></div>
        <div class="pct ${probability === best ? "big" : ""}" title="${status.label}">${formatProbability(team, probability)}</div></div>`;
    }).join("");
    document.querySelectorAll("#champList .teamBtn").forEach(button => button.addEventListener("click", () => selectTeam(button.dataset.team)));
  }

  function renderTeamTabs() {
 if(!document.getElementById("teamTabs"))return;
    document.getElementById("teamTabs").innerHTML = districtTeams().map(team => `<button type="button" class="filterBtn ${team === selectedTeam ? "active" : ""}" data-team="${team}">${team}</button>`).join("");
    document.querySelectorAll("#teamTabs button").forEach(button => button.addEventListener("click", () => selectTeam(button.dataset.team)));
  }

  function renderRankPanel() {
 if(!document.getElementById("rankBars"))return;
    const probabilities = simulation.rank[selectedTeam];
    const average = simulation.avg[selectedTeam];
    document.getElementById("rankTitle").textContent = `${districtName(selectedDistrict)} 最終順位確率`;
    if(document.getElementById("selectedRecord")) document.getElementById("selectedRecord").textContent = `平均最終成績：${average.w.toFixed(1)}勝 ${average.l.toFixed(1)}敗 ${average.t.toFixed(1)}分`;
    document.getElementById("rankBars").innerHTML = probabilities.map((probability, index) => `<div class="rankRow">
      <b>${index + 1}位</b><div class="rankTrack"><div class="rankFill" style="width:${Math.max(0.2, probability * 100)}%;background:${TEAM_COLORS[selectedTeam]}"></div></div><b style="text-align:right">${formatPct(probability)}</b>
    </div>`).join("");
  }

  function renderStrength() {
 if(!document.getElementById("strengthGrid"))return;
    const comparisons = strengthComparison();
    document.getElementById("strengthGrid").innerHTML = comparisons.map((item, index) => `<div class="strengthCard ${index === 0 ? "best" : ""}">
      <b>${index + 1}位　${item.name}</b>
      <div class="strengthScore">${item.score.toFixed(1)}</div>
      <div class="strengthBar"><span style="width:${clamp(item.score, 0, 100)}%"></span></div>
      <div class="metricRow"><span>所属球団平均勝率</span><b>${formatPct(item.averagePct)}</b></div>
      <div class="metricRow"><span>平均ピタゴラス勝率</span><b>${formatPct(item.averagePythag)}</b></div>
      <div class="metricRow"><span>平均得失点差／試合</span><b>${item.runDiff >= 0 ? "+" : ""}${item.runDiff.toFixed(2)}</b></div>
      <div class="metricRow"><span>球団間ばらつき</span><b>${item.spread.toFixed(1)}</b></div>
    </div>`).join("");
  }

  function renderClinchForecast() {
 if(!document.getElementById("clinchForecast"))return;
    document.getElementById("forecastTitle").textContent = `${districtName(selectedDistrict)} 各球団の優勝予想日`;
    document.getElementById("clinchForecast").innerHTML = districtTeams().map(team => `<button type="button" class="forecastCard" data-team="${team}" style="--team-color:${TEAM_COLORS[team]}">
      <span class="team">${teamDot(team)}${team}</span>
      <span class="forecastDate">${simulation.clinch.predictedDate[team]}</span>
      <span class="champProb">最終優勝確率 ${formatPct(simulation.rank[team][0])}</span>
    </button>`).join("");
    document.querySelectorAll("#clinchForecast button").forEach(button => button.addEventListener("click", () => selectTeam(button.dataset.team)));
  }

  function renderClinchTable() {
 if(!document.getElementById("clinchProbabilityTable"))return;
    const clinch = simulation.clinch;
    document.getElementById("clinchTitle").textContent = `${districtName(selectedDistrict)} 日程ごとの優勝決定確率`;
    document.getElementById("clinchProbabilityTable").innerHTML = `<table class="probDateTable">
      <thead><tr><th>日程</th>${districtTeams().map(team => `<th>${teamDot(team)}${team}</th>`).join("")}</tr></thead>
      <tbody>${clinch.dates.map((date, dayIndex) => `<tr><td><b>${date}</b></td>${districtTeams().map(team => `<td class="probDateCell"><b>${formatPct(clinch.exact[team][dayIndex])}</b><span>累計 ${formatPct(clinch.byDate[team][dayIndex])}</span></td>`).join("")}</tr>`).join("")}</tbody>
    </table>`;
  }

  function renderScheduleFilters() {
 if(!document.getElementById("scheduleFilters"))return;
    const options = [[selectedTeam, "選択球団"], ["全体", "地区全体"], ["直接対決", "直接対決のみ"]];
    if (!["全体", "直接対決", selectedTeam].includes(scheduleFilter)) scheduleFilter = selectedTeam;
    document.getElementById("scheduleFilters").innerHTML = options.map(([value, label]) => `<button type="button" class="filterBtn ${value === scheduleFilter ? "active" : ""}" data-filter="${value}">${label}${value === selectedTeam ? `：${selectedTeam}` : ""}</button>`).join("");
    document.querySelectorAll("#scheduleFilters button").forEach(button => button.addEventListener("click", () => {
      scheduleFilter = button.dataset.filter;
      scheduleExpanded = false;
      renderScheduleFilters();
      renderSchedule();
    }));
  }

  function renderSchedule() {
 if(!document.getElementById("scheduleList"))return;
    const filtered = schedule.filter(game => {
      if (scheduleFilter === "全体") return teamDistrict[game.home] === selectedDistrict || teamDistrict[game.away] === selectedDistrict;
      if (scheduleFilter === "直接対決") return teamDistrict[game.home] === selectedDistrict && teamDistrict[game.away] === selectedDistrict;
      return game.home === scheduleFilter || game.away === scheduleFilter;
    }).sort((a, b) => dateOrder(a.date) - dateOrder(b.date));
    const visible = scheduleExpanded ? filtered : filtered.slice(0, 5);
    document.getElementById("scheduleCount").textContent = `${visible.length}/${filtered.length}試合表示`;
    document.getElementById("scheduleList").innerHTML = visible.length ? visible.map(game => {
      const sameDistrict = teamDistrict[game.home] && teamDistrict[game.home] === teamDistrict[game.away];
      const badge = sameDistrict ? `<span class="direct">${districtName(teamDistrict[game.home])}直接対決</span>` : "";
      return `<div class="game"><div class="date">${game.date}</div><div><b>${game.home} － ${game.away}</b>${badge}<div class="venue">${game.venue || ""}</div></div></div>`;
    }).join("") : '<div style="padding:18px" class="muted">残り試合はありません。</div>';
    const more = document.getElementById("scheduleMoreBtn");
    more.hidden = filtered.length <= 5;
    more.textContent = scheduleExpanded ? "直近5試合に戻す" : `残り全日程を見る（あと${Math.max(0, filtered.length - 5)}試合）`;
  }

  function renderHistory() {
 if(!document.getElementById("inputHistory"))return;
    const items = recentResults.slice(-12).reverse();
    document.getElementById("inputHistory").innerHTML = items.length ? items.map(game => {
      const text = game.status === "cancelled" ? `${game.date} ${game.home}－${game.away} 中止` : `${game.date} ${game.home} ${game.homeScore}－${game.awayScore} ${game.away}`;
      return `<div class="histItem"><span>${text}</span><b>NPB公式</b></div>`;
    }).join("") : '<div class="tiny">取得済みの直近結果はありません。</div>';
  }

  function drawLineChart(svgId, data, options = {}) {
    const svg = document.getElementById(svgId);
    const width = Math.max(260, Math.min(620, svg.clientWidth)), height = 255, left = 46, right = 18, top = 20, bottom = 38;
    svg.setAttribute("viewBox", `0 0 ${width} ${height}`);
    const innerWidth = width - left - right, innerHeight = height - top - bottom;
    const maximum = options.max ?? Math.max(...data.map(item => item.value), 1);
    const minimum = options.min ?? 0;
    const x = index => left + (data.length <= 1 ? innerWidth / 2 : innerWidth * index / (data.length - 1));
    const y = value => top + innerHeight - (value - minimum) / (maximum - minimum || 1) * innerHeight;
    let content = "";
    for (let index = 0; index <= 4; index++) {
      const value = minimum + (maximum - minimum) * index / 4;
      const vertical = y(value);
      content += `<line x1="${left}" y1="${vertical}" x2="${width - right}" y2="${vertical}" stroke="#e3eaf3"/><text x="${left - 7}" y="${vertical + 4}" text-anchor="end" class="chartLabel">${options.percent ? `${value.toFixed(0)}%` : value.toFixed(0)}</text>`;
    }
    data.forEach((item, index) => {
      if(item.value === null){content += `<text x="${width/2}" y="120" text-anchor="middle">マジック未点灯</text>`;return;}
      const displayed = options.percent ? `${item.value.toFixed(1)}%` : item.value === null ? "—" : `M${Math.round(item.value)}`;
      content += `<circle class="chartPoint" tabindex="0" cx="${x(index)}" cy="${y(item.value)}" r="6" fill="${options.color}"><title>${item.label}　${displayed}</title></circle><text x="${x(index)}" y="${height - 15}" text-anchor="middle" class="chartLabel">${item.label}</text><text x="${x(index)}" y="${y(item.value) - 10}" text-anchor="middle" class="chartValue">${displayed}</text>`;
    });
    svg.innerHTML = content;
  }

  function renderCharts() {
 if(!document.getElementById("probChart"))return;
    const label = raw.officialThroughDate || raw.standingsAsOf || "現在";
    const magic = magicInfo(selectedTeam).magic;
    drawLineChart("probChart", [{ label, value: simulation.rank[selectedTeam][0] * 100 }], { min: 0, max: 100, percent: true, color: TEAM_COLORS[selectedTeam] });
    drawLineChart("magicChart", [{ label, value: magic }], { min: 0, max: Math.max(10, (magic ?? 0) + 4), percent: false, color: "#7554c9" });
  }

  function selectDistrict(key) {
    if (!districts[key]) return;
    selectedDistrict = key;
    const currentTeams = districtTeams();
    if (!currentTeams.includes(selectedTeam)) selectedTeam = currentTeams.slice().sort((a, b) => simulation.rank[b][0] - simulation.rank[a][0])[0];
    scheduleFilter = selectedTeam;
    scheduleExpanded = false;
    persistSelection();
    renderSelectedDistrict();
    window.dispatchEvent(new CustomEvent("farmteamchange", { detail: { team: selectedTeam } }));
  }

  function selectTeam(team) {
    if (!standings[team]) return;
    selectedTeam = team;
    selectedDistrict = teamDistrict[team];
    scheduleFilter = team;
    scheduleExpanded = false;
    persistSelection();
    renderSelectedDistrict();
    window.dispatchEvent(new CustomEvent("farmteamchange", { detail: { team: selectedTeam } }));
  }

  function renderSelectedDistrict() {
    renderDistrictOverview();
    renderDistrictSwitch();
    renderTopStats();
    renderStandings();
    renderChampionshipProbabilities();
    renderTeamTabs();
    renderRankPanel();
    renderClinchForecast();
    renderClinchTable();
    renderScheduleFilters();
    renderSchedule();
    renderCharts();
    renderToday();
  }

  function renderLoading() {
    renderHeader();
    renderDistrictSwitch();
    if(document.getElementById("districtOverview")) document.getElementById("districtOverview").innerHTML = Object.entries(districts).map(([key, district]) => `<div class="card districtCard" style="--district-color:${DISTRICT_COLORS[key]}"><div class="districtName">${district.name}</div><div class="leader">計算中…</div></div>`).join("");
    renderHistory();
  }


window.FARM_MODEL=model;
document.getElementById('scheduleMoreBtn')?.addEventListener('click',()=>{scheduleExpanded=!scheduleExpanded;renderSchedule();});
window.addEventListener('farmselect',event=>{if(event.detail.team!==selectedTeam)selectTeam(event.detail.team);});
renderLoading();
if(document.body.dataset.page==='about.html'){renderHeader();renderStrength();}else setTimeout(()=>{try{simulation=simulate(ITERATIONS);window.FARM_MODEL.lastSimulation=simulation;renderStrength();renderSelectedDistrict();window.dispatchEvent(new Event('league-ready'));}catch(e){setText('dataStatusPill','計算エラー');console.error(e);}},30);
