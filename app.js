(() => {
  "use strict";

  const ITERATIONS = 20000;
  const DISTRICT_COLORS = { east: "#0d5bd7", central: "#14855b", west: "#7454c9" };
  const TEAM_COLORS = {
    "日本ハム": "#0d5bd7", "楽天": "#c92433", "ロッテ": "#222222", "ヤクルト": "#173d75", "オイシックス": "#ef8219",
    "DeNA": "#1687c8", "巨人": "#f07c00", "西武": "#164a8a", "中日": "#21468b", "ハヤテ": "#6d9d47",
    "ソフトバンク": "#e4b323", "オリックス": "#6f244f", "広島": "#d71f2b", "阪神": "#f2c500"
  };
  const FALLBACK_DISTRICTS = {
    east: { name: "東地区", teams: ["日本ハム", "楽天", "ロッテ", "ヤクルト", "オイシックス"] },
    central: { name: "中地区", teams: ["DeNA", "巨人", "西武", "中日", "ハヤテ"] },
    west: { name: "西地区", teams: ["ソフトバンク", "オリックス", "広島", "阪神"] }
  };
  const FALLBACK_STANDINGS = {
    "日本ハム": { district: "east", w: 55, l: 37, t: 5, rs: 520, ra: 387 },
    "楽天": { district: "east", w: 52, l: 44, t: 5, rs: 455, ra: 420 },
    "ロッテ": { district: "east", w: 47, l: 45, t: 5, rs: 448, ra: 394 },
    "ヤクルト": { district: "east", w: 39, l: 51, t: 7, rs: 361, ra: 425 },
    "オイシックス": { district: "east", w: 38, l: 61, t: 3, rs: 366, ra: 555 },
    "DeNA": { district: "central", w: 61, l: 33, t: 8, rs: 491, ra: 322 },
    "巨人": { district: "central", w: 64, l: 41, t: 1, rs: 470, ra: 344 },
    "西武": { district: "central", w: 59, l: 45, t: 1, rs: 491, ra: 393 },
    "中日": { district: "central", w: 44, l: 56, t: 5, rs: 388, ra: 452 },
    "ハヤテ": { district: "central", w: 32, l: 69, t: 4, rs: 359, ra: 573 },
    "ソフトバンク": { district: "west", w: 62, l: 39, t: 5, rs: 492, ra: 338 },
    "オリックス": { district: "west", w: 48, l: 46, t: 6, rs: 325, ra: 382 },
    "広島": { district: "west", w: 38, l: 53, t: 8, rs: 313, ra: 378 },
    "阪神": { district: "west", w: 38, l: 57, t: 11, rs: 309, ra: 425 }
  };

  const raw = window.FARM_AUTO_DATA || {};
  const districts = raw.districts && Object.keys(raw.districts).length === 3 ? raw.districts : FALLBACK_DISTRICTS;
  const standings = raw.standings && Object.keys(raw.standings).length === 14 ? clone(raw.standings) : clone(FALLBACK_STANDINGS);
  const schedule = Array.isArray(raw.schedule) ? clone(raw.schedule) : [];
  const recentResults = Array.isArray(raw.results) ? clone(raw.results) : [];
  const teams = Object.values(districts).flatMap(district => district.teams);
  const teamIndex = Object.fromEntries(teams.map((team, index) => [team, index]));
  const teamDistrict = Object.fromEntries(Object.entries(districts).flatMap(([key, district]) => district.teams.map(team => [team, key])));

  let selectedDistrict = "east";
  let selectedTeam = "日本ハム";
  let scheduleFilter = "日本ハム";
  let simulation = null;

  function clone(value) { return JSON.parse(JSON.stringify(value)); }
  function clamp(value, min = 0, max = 1) { return Math.max(min, Math.min(max, value)); }
  function pct(record) { return record.w + record.l ? record.w / (record.w + record.l) : 0.5; }
  function pythag(record) {
    const rs = Math.max(0, record.rs || 0);
    const ra = Math.max(0, record.ra || 0);
    if (!rs && !ra) return 0.5;
    const a = Math.pow(rs, 1.83);
    const b = Math.pow(ra, 1.83);
    return a / (a + b);
  }
  function formatPct(value, digits = 1) { return `${(value * 100).toFixed(digits)}%`; }
  function dateOrder(date) {
    const [month, day] = String(date || "0/0").split("/").map(Number);
    return month * 100 + day;
  }
  function teamDot(team) {
    return `<span class="dot" style="background:${TEAM_COLORS[team] || "#718096"}"></span>`;
  }
  function districtName(key) { return districts[key]?.name || key; }
  function districtTeams(key = selectedDistrict) { return districts[key]?.teams || []; }

  function remainingCounts() {
    const counts = Object.fromEntries(teams.map(team => [team, 0]));
    for (const game of schedule) {
      if (counts[game.home] !== undefined) counts[game.home]++;
      if (counts[game.away] !== undefined) counts[game.away]++;
    }
    return counts;
  }

  function seedFromData() {
    let seed = 2166136261 >>> 0;
    const source = JSON.stringify(standings) + JSON.stringify(schedule);
    for (let index = 0; index < source.length; index++) {
      seed ^= source.charCodeAt(index);
      seed = Math.imul(seed, 16777619);
    }
    return seed >>> 0;
  }

  function rngFactory(seed) {
    let value = seed || 123456789;
    return () => {
      value ^= value << 13;
      value ^= value >>> 17;
      value ^= value << 5;
      return (value >>> 0) / 4294967296;
    };
  }

  function teamStrength(team) {
    const record = standings[team];
    if (!record) return 0.5;
    return 0.40 * pct(record) + 0.45 * pythag(record) + 0.15 * 0.5;
  }

  function homeWinProbability(home, away) {
    const difference = teamStrength(home) - teamStrength(away);
    return 1 / (1 + Math.exp(-(2.30 * difference + 0.025)));
  }

  function simulate(iterations = ITERATIONS) {
    const random = rngFactory(seedFromData());
    const baseW = teams.map(team => standings[team].w);
    const baseL = teams.map(team => standings[team].l);
    const baseT = teams.map(team => standings[team].t);
    const baseDate = raw.officialThroughDate || raw.standingsAsOf || "8/25";
    const dates = [...new Set([baseDate, ...schedule.map(game => game.date)])].sort((a, b) => dateOrder(a) - dateOrder(b));
    const dateIndex = new Map(dates.map((date, index) => [date, index]));
    const gamesByDate = dates.map(() => []);
    const baseRemaining = teams.map(team => schedule.reduce((count, game) => count + (game.home === team || game.away === team ? 1 : 0), 0));

    for (const game of schedule) {
      const home = teamIndex[game.home];
      const away = teamIndex[game.away];
      if (home === undefined || away === undefined || !dateIndex.has(game.date)) continue;
      gamesByDate[dateIndex.get(game.date)].push([home, away, homeWinProbability(game.home, game.away)]);
    }

    const rankCounts = Object.fromEntries(teams.map(team => [team, Array(districtTeams(teamDistrict[team]).length).fill(0)]));
    const clinchCounts = Object.fromEntries(teams.map(team => [team, Array(dates.length).fill(0)]));
    const sumW = Array(teams.length).fill(0);
    const sumL = Array(teams.length).fill(0);
    const sumT = Array(teams.length).fill(0);
    const drawProbability = 0.035;

    function canClinch(team, w, l, remaining) {
      const key = teamDistrict[teams[team]];
      const ownDenominator = w[team] + l[team] + remaining[team];
      const worstFinal = ownDenominator ? w[team] / ownDenominator : 0;
      for (const rivalName of districtTeams(key)) {
        const rival = teamIndex[rivalName];
        if (rival === team) continue;
        const rivalDenominator = w[rival] + l[rival] + remaining[rival];
        const bestFinal = rivalDenominator ? (w[rival] + remaining[rival]) / rivalDenominator : 0;
        if (worstFinal <= bestFinal + 1e-12) return false;
      }
      return true;
    }

    for (let iteration = 0; iteration < iterations; iteration++) {
      const w = baseW.slice();
      const l = baseL.slice();
      const t = baseT.slice();
      const remaining = baseRemaining.slice();
      const clinched = { east: false, central: false, west: false };

      function markClinch(dayIndex) {
        for (const key of Object.keys(districts)) {
          if (clinched[key]) continue;
          const indices = districtTeams(key).map(team => teamIndex[team]);
          indices.sort((a, b) => {
            const pa = w[a] / Math.max(1, w[a] + l[a]);
            const pb = w[b] / Math.max(1, w[b] + l[b]);
            return pb - pa || w[b] - w[a];
          });
          const leader = indices[0];
          if (canClinch(leader, w, l, remaining)) {
            clinched[key] = true;
            clinchCounts[teams[leader]][dayIndex]++;
          }
        }
      }

      markClinch(0);
      for (let dayIndex = 0; dayIndex < dates.length; dayIndex++) {
        for (const [home, away, probability] of gamesByDate[dayIndex]) {
          const draw = random();
          if (draw < drawProbability) {
            t[home]++;
            t[away]++;
          } else if (draw < drawProbability + (1 - drawProbability) * probability) {
            w[home]++;
            l[away]++;
          } else {
            w[away]++;
            l[home]++;
          }
          remaining[home]--;
          remaining[away]--;
        }
        if (gamesByDate[dayIndex].length) markClinch(dayIndex);
      }

      for (const key of Object.keys(districts)) {
        const tieBreakers = districtTeams(key).map(() => random());
        const order = districtTeams(key).map(team => teamIndex[team]);
        order.sort((a, b) => {
          const pa = w[a] / Math.max(1, w[a] + l[a]);
          const pb = w[b] / Math.max(1, w[b] + l[b]);
          const aPos = districtTeams(key).indexOf(teams[a]);
          const bPos = districtTeams(key).indexOf(teams[b]);
          return pb - pa || w[b] - w[a] || tieBreakers[bPos] - tieBreakers[aPos];
        });
        order.forEach((team, position) => rankCounts[teams[team]][position]++);
        if (!clinched[key]) clinchCounts[teams[order[0]]][dates.length - 1]++;
      }

      for (let index = 0; index < teams.length; index++) {
        sumW[index] += w[index];
        sumL[index] += l[index];
        sumT[index] += t[index];
      }
    }

    const output = { rank: {}, avg: {}, clinch: { dates, exact: {}, byDate: {}, predictedDate: {} } };
    teams.forEach((team, index) => {
      output.rank[team] = rankCounts[team].map(value => value / iterations);
      output.avg[team] = { w: sumW[index] / iterations, l: sumL[index] / iterations, t: sumT[index] / iterations };
      output.clinch.exact[team] = clinchCounts[team].map(value => value / iterations);
      let cumulative = 0;
      output.clinch.byDate[team] = clinchCounts[team].map(value => (cumulative += value) / iterations);
      const winningCases = rankCounts[team][0];
      let running = 0;
      let predicted = "—";
      if (winningCases) {
        for (let dayIndex = 0; dayIndex < dates.length; dayIndex++) {
          running += clinchCounts[team][dayIndex];
          if (running >= winningCases / 2) {
            predicted = dates[dayIndex];
            break;
          }
        }
      }
      output.clinch.predictedDate[team] = predicted;
    });
    return output;
  }

  function strengthComparison() {
    const totalGames = teams.reduce((sum, team) => sum + standings[team].w + standings[team].l + standings[team].t, 0);
    const averageRuns = teams.reduce((sum, team) => sum + standings[team].rs, 0) / Math.max(1, totalGames);
    const averageAllowed = teams.reduce((sum, team) => sum + standings[team].ra, 0) / Math.max(1, totalGames);
    const teamScores = {};

    for (const team of teams) {
      const record = standings[team];
      const games = Math.max(1, record.w + record.l + record.t);
      const offense = clamp(0.5 * (record.rs / games) / averageRuns);
      const prevention = clamp(1 - 0.5 * (record.ra / games) / averageAllowed);
      teamScores[team] = 100 * (0.40 * pct(record) + 0.35 * pythag(record) + 0.15 * offense + 0.10 * prevention);
    }

    return Object.entries(districts).map(([key, district]) => {
      const values = district.teams.map(team => teamScores[team]);
      const records = district.teams.map(team => standings[team]);
      const score = values.reduce((sum, value) => sum + value, 0) / values.length;
      const spread = Math.sqrt(values.reduce((sum, value) => sum + Math.pow(value - score, 2), 0) / values.length);
      const averagePct = records.reduce((sum, record) => sum + pct(record), 0) / records.length;
      const averagePythag = records.reduce((sum, record) => sum + pythag(record), 0) / records.length;
      const runDiff = records.reduce((sum, record) => sum + (record.rs - record.ra) / Math.max(1, record.w + record.l + record.t), 0) / records.length;
      return { key, name: district.name, score, spread, averagePct, averagePythag, runDiff, teamScores };
    }).sort((a, b) => b.score - a.score);
  }

  function magicInfo(team) {
    const counts = remainingCounts();
    const key = teamDistrict[team];
    let rival = null;
    let maximum = -1;
    for (const rivalName of districtTeams(key)) {
      if (rivalName === team) continue;
      const record = standings[rivalName];
      const remaining = counts[rivalName];
      const best = (record.w + remaining) / Math.max(1, record.w + record.l + remaining);
      if (best > maximum) {
        maximum = best;
        rival = rivalName;
      }
    }
    const record = standings[team];
    const remaining = counts[team];
    const denominator = record.w + record.l + remaining;
    for (let wins = 0; wins <= remaining; wins++) {
      if ((record.w + wins) / Math.max(1, denominator) > maximum) return { magic: wins, rival };
    }
    return { magic: null, rival };
  }

  function approximateEarliest(team) {
    const key = teamDistrict[team];
    const districtSet = new Set(districtTeams(key));
    const temporary = clone(standings);
    const dates = [...new Set(schedule.map(game => game.date))].sort((a, b) => dateOrder(a) - dateOrder(b));
    for (const date of dates) {
      for (const game of schedule.filter(item => item.date === date)) {
        if (game.home === team || game.away === team) {
          temporary[team].w++;
          const opponent = game.home === team ? game.away : game.home;
          if (districtSet.has(opponent)) temporary[opponent].l++;
        } else {
          if (districtSet.has(game.home)) temporary[game.home].l++;
          if (districtSet.has(game.away)) temporary[game.away].l++;
        }
      }
      const future = schedule.filter(game => dateOrder(game.date) > dateOrder(date));
      const counts = Object.fromEntries(districtTeams(key).map(name => [name, 0]));
      for (const game of future) {
        if (counts[game.home] !== undefined) counts[game.home]++;
        if (counts[game.away] !== undefined) counts[game.away]++;
      }
      const own = temporary[team];
      const ownWorst = own.w / Math.max(1, own.w + own.l + counts[team]);
      const rivalBest = Math.max(...districtTeams(key).filter(name => name !== team).map(name => {
        const record = temporary[name];
        return (record.w + counts[name]) / Math.max(1, record.w + record.l + counts[name]);
      }));
      if (ownWorst > rivalBest) return date;
    }
    return "—";
  }

  function calcGamesBehind(leader, team) {
    return ((leader.w - team.w) + (team.l - leader.l)) / 2;
  }

  function renderHeader() {
    const through = raw.officialThroughDate || raw.standingsAsOf || "8/25";
    document.getElementById("dataDateBadge").textContent = `公式成績：${through}終了時点`;
    const update = document.getElementById("autoUpdateBadge");
    update.textContent = "自動更新：毎日8:00・17:00";
  }

  function renderDistrictOverview() {
    const container = document.getElementById("districtOverview");
    container.innerHTML = Object.entries(districts).map(([key, district]) => {
      const ordered = district.teams.slice().sort((a, b) => simulation.rank[b][0] - simulation.rank[a][0]);
      const leader = ordered[0];
      return `<button type="button" class="card districtCard" data-district="${key}" style="--district-color:${DISTRICT_COLORS[key]};text-align:left;color:inherit">
        <span class="districtName">${district.name}</span>
        <span class="leader">${teamDot(leader)}${leader}</span>
        <span class="leaderProb">${formatPct(simulation.rank[leader][0])}</span>
        <span class="tiny">${ordered.slice(1).map(team => `${team} ${formatPct(simulation.rank[team][0])}`).join(" ／ ")}</span>
      </button>`;
    }).join("");
    container.querySelectorAll("button").forEach(button => button.addEventListener("click", () => selectDistrict(button.dataset.district)));
  }

  function renderDistrictSwitch() {
    const container = document.getElementById("districtSwitch");
    container.innerHTML = Object.entries(districts).map(([key, district]) => `<button type="button" class="filterBtn ${key === selectedDistrict ? "active" : ""}" data-district="${key}">${district.name}</button>`).join("");
    container.querySelectorAll("button").forEach(button => button.addEventListener("click", () => selectDistrict(button.dataset.district)));
  }

  function renderTopStats() {
    const probability = simulation.rank[selectedTeam][0];
    const magic = magicInfo(selectedTeam);
    document.getElementById("headlineLabel").textContent = `${selectedTeam} 優勝確率`;
    document.getElementById("headlineProb").textContent = formatPct(probability);
    document.getElementById("magicNow").textContent = magic.magic === null ? "—" : `M${magic.magic}`;
    document.getElementById("magicTarget").textContent = `対象：${magic.rival || "—"}`;
    document.getElementById("earliestDate").textContent = approximateEarliest(selectedTeam);
    document.getElementById("remainingLabel").textContent = `${selectedTeam} 残り試合`;
    document.getElementById("hamRemaining").textContent = remainingCounts()[selectedTeam];
  }

  function renderStandings() {
    const list = districtTeams().map(team => ({ team, record: standings[team], value: pct(standings[team]) })).sort((a, b) => b.value - a.value || b.record.w - a.record.w);
    const leader = list[0].record;
    document.getElementById("standingsTitle").textContent = `${districtName(selectedDistrict)} 現在順位`;
    document.getElementById("standingsBody").innerHTML = list.map((item, index) => `<tr>
      <td><b>${index + 1}</b></td>
      <td><button class="teamBtn" type="button" data-team="${item.team}">${teamDot(item.team)}${item.team}</button></td>
      <td>${item.record.w}-${item.record.l}-${item.record.t}</td>
      <td>${item.value.toFixed(3).replace(/^0/, "")}</td>
      <td>${index === 0 ? "—" : calcGamesBehind(leader, item.record).toFixed(1)}</td>
    </tr>`).join("");
    document.querySelectorAll("#standingsBody .teamBtn").forEach(button => button.addEventListener("click", () => selectTeam(button.dataset.team)));
  }

  function renderChampionshipProbabilities() {
    const district = districtTeams();
    const best = Math.max(...district.map(team => simulation.rank[team][0]));
    document.getElementById("champTitle").textContent = `${districtName(selectedDistrict)} 優勝確率`;
    document.getElementById("champList").innerHTML = district.map(team => {
      const probability = simulation.rank[team][0];
      return `<div class="probRow"><button class="teamBtn" data-team="${team}" type="button">${teamDot(team)}${team}</button>
        <div class="track"><div class="fill" style="width:${Math.max(0.3, probability * 100)}%;background:${TEAM_COLORS[team]}"></div></div>
        <div class="pct ${probability === best ? "big" : ""}">${formatPct(probability)}</div></div>`;
    }).join("");
    document.querySelectorAll("#champList .teamBtn").forEach(button => button.addEventListener("click", () => selectTeam(button.dataset.team)));
  }

  function renderTeamTabs() {
    document.getElementById("teamTabs").innerHTML = districtTeams().map(team => `<button type="button" class="filterBtn ${team === selectedTeam ? "active" : ""}" data-team="${team}">${team}</button>`).join("");
    document.querySelectorAll("#teamTabs button").forEach(button => button.addEventListener("click", () => selectTeam(button.dataset.team)));
  }

  function renderRankPanel() {
    const probabilities = simulation.rank[selectedTeam];
    const average = simulation.avg[selectedTeam];
    document.getElementById("rankTitle").textContent = `${districtName(selectedDistrict)} 最終順位確率`;
    document.getElementById("selectedName").innerHTML = `${teamDot(selectedTeam)}${selectedTeam}`;
    document.getElementById("selectedChamp").textContent = formatPct(probabilities[0]);
    document.getElementById("selectedRecord").textContent = `平均最終成績：${average.w.toFixed(1)}勝 ${average.l.toFixed(1)}敗 ${average.t.toFixed(1)}分`;
    document.getElementById("rankBars").innerHTML = probabilities.map((probability, index) => `<div class="rankRow">
      <b>${index + 1}位</b><div class="rankTrack"><div class="rankFill" style="width:${Math.max(0.2, probability * 100)}%;background:${TEAM_COLORS[selectedTeam]}"></div></div><b style="text-align:right">${formatPct(probability)}</b>
    </div>`).join("");
  }

  function renderStrength() {
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
    document.getElementById("forecastTitle").textContent = `${districtName(selectedDistrict)} 各球団の優勝予想日`;
    document.getElementById("clinchForecast").innerHTML = districtTeams().map(team => `<button type="button" class="forecastCard" data-team="${team}" style="--team-color:${TEAM_COLORS[team]}">
      <span class="team">${teamDot(team)}${team}</span>
      <span class="forecastDate">${simulation.clinch.predictedDate[team]}</span>
      <span class="champProb">最終優勝確率 ${formatPct(simulation.rank[team][0])}</span>
    </button>`).join("");
    document.querySelectorAll("#clinchForecast button").forEach(button => button.addEventListener("click", () => selectTeam(button.dataset.team)));
  }

  function renderClinchTable() {
    const clinch = simulation.clinch;
    document.getElementById("clinchTitle").textContent = `${districtName(selectedDistrict)} 日程ごとの優勝決定確率`;
    document.getElementById("clinchProbabilityTable").innerHTML = `<table class="probDateTable">
      <thead><tr><th>日程</th>${districtTeams().map(team => `<th>${teamDot(team)}${team}</th>`).join("")}</tr></thead>
      <tbody>${clinch.dates.map((date, dayIndex) => `<tr><td><b>${date}</b></td>${districtTeams().map(team => `<td class="probDateCell"><b>${formatPct(clinch.exact[team][dayIndex])}</b><span>累計 ${formatPct(clinch.byDate[team][dayIndex])}</span></td>`).join("")}</tr>`).join("")}</tbody>
    </table>`;
  }

  function renderScheduleFilters() {
    const options = ["全体", ...districtTeams()];
    if (scheduleFilter !== "全体" && !districtTeams().includes(scheduleFilter)) scheduleFilter = districtTeams()[0];
    document.getElementById("scheduleFilters").innerHTML = options.map(option => `<button type="button" class="filterBtn ${option === scheduleFilter ? "active" : ""}" data-filter="${option}">${option}</button>`).join("");
    document.querySelectorAll("#scheduleFilters button").forEach(button => button.addEventListener("click", () => {
      scheduleFilter = button.dataset.filter;
      renderScheduleFilters();
      renderSchedule();
    }));
  }

  function renderSchedule() {
    const filtered = schedule.filter(game => scheduleFilter === "全体" || game.home === scheduleFilter || game.away === scheduleFilter).sort((a, b) => dateOrder(a.date) - dateOrder(b.date));
    document.getElementById("scheduleCount").textContent = `${filtered.length}試合表示`;
    document.getElementById("scheduleList").innerHTML = filtered.length ? filtered.map(game => {
      const sameDistrict = teamDistrict[game.home] && teamDistrict[game.home] === teamDistrict[game.away];
      const badge = sameDistrict ? `<span class="direct">${districtName(teamDistrict[game.home])}直接対決</span>` : "";
      return `<div class="game"><div class="date">${game.date}</div><div><b>${game.home} － ${game.away}</b>${badge}<div class="venue">${game.venue || ""}</div></div><div class="venue">${game.venue || ""}</div></div>`;
    }).join("") : '<div style="padding:18px" class="muted">残り試合はありません。</div>';
  }

  function renderHistory() {
    const items = recentResults.slice(-12).reverse();
    document.getElementById("inputHistory").innerHTML = items.length ? items.map(game => {
      const text = game.status === "cancelled" ? `${game.date} ${game.home}－${game.away} 中止` : `${game.date} ${game.home} ${game.homeScore}－${game.awayScore} ${game.away}`;
      return `<div class="histItem"><span>${text}</span><b>NPB公式</b></div>`;
    }).join("") : '<div class="tiny">取得済みの直近結果はありません。</div>';
  }

  function drawLineChart(svgId, data, options = {}) {
    const svg = document.getElementById(svgId);
    const width = 620, height = 255, left = 46, right = 18, top = 20, bottom = 38;
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
      content += `<circle cx="${x(index)}" cy="${y(item.value)}" r="6" fill="${options.color}"/><text x="${x(index)}" y="${height - 15}" text-anchor="middle" class="chartLabel">${item.label}</text><text x="${x(index)}" y="${y(item.value) - 10}" text-anchor="middle" class="chartValue">${options.percent ? `${item.value.toFixed(1)}%` : item.value === null ? "—" : `M${Math.round(item.value)}`}</text>`;
    });
    svg.innerHTML = content;
  }

  function renderCharts() {
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
    renderSelectedDistrict();
  }

  function selectTeam(team) {
    if (!standings[team]) return;
    selectedTeam = team;
    selectedDistrict = teamDistrict[team];
    scheduleFilter = team;
    renderSelectedDistrict();
  }

  function renderSelectedDistrict() {
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
  }

  function renderLoading() {
    renderHeader();
    renderDistrictSwitch();
    document.getElementById("districtOverview").innerHTML = Object.entries(districts).map(([key, district]) => `<div class="card districtCard" style="--district-color:${DISTRICT_COLORS[key]}"><div class="districtName">${district.name}</div><div class="leader">計算中…</div></div>`).join("");
    renderHistory();
  }

  window.FARM_MODEL = { simulate, strengthComparison, teamStrength, districts, standings, schedule };
  if (typeof document === "undefined") return;

  renderLoading();
  window.setTimeout(() => {
    simulation = simulate(ITERATIONS);
    window.FARM_MODEL.lastSimulation = simulation;
    renderDistrictOverview();
    renderStrength();
    renderSelectedDistrict();
  }, 30);
})();
