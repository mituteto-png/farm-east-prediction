import { FARM_CHAMP_CONFIG as CONFIG } from "./farmchamp-config.js";
import { getFarmChampionshipEligibility, outsToInnings } from "./farmchamp-eligibility.js";

(() => {
  "use strict";

  const data = window.FARM_CHAMP_DATA;
  const root = document.getElementById("farmChampionshipApp");
  if (!root) return;
  if (!data || data.season !== CONFIG.season) {
    root.innerHTML = '<div class="farmChampEmpty">選手資格データを取得できませんでした。順位予測など既存機能は引き続き利用できます。</div>';
    return;
  }

  const teams = Object.keys(CONFIG.teams).filter(team => data.teams?.[team]);
  const requestedTeam = new URLSearchParams(window.location.search).get("team");
  let selectedTeam = teams.includes(requestedTeam) ? requestedTeam : teams[0] || null;
  let selectedFilter = "all";
  const filters = [
    ["all", "全選手"], ["eligible", "出場資格あり"], ["rookie", "新人"],
    ["noFirstTeam", "一軍登録なし"], ["threshold", "規定到達"],
    ["batter", "野手"], ["pitcher", "投手"]
  ];

  function escapeHtml(value = "") {
    return String(value).replace(/[&<>"']/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]);
  }

  function evaluation(player, team) {
    return getFarmChampionshipEligibility(player, team, data);
  }

  function statusMeta(result) {
    const map = {
      eligible_rookie: ["資格あり", "ok"],
      eligible_no_first_team: ["資格あり", "ok"],
      eligible_participating_club: ["資格あり", "ok"],
      eligible_threshold: ["資格あり", "ok"],
      provisional_clear: ["現時点で基準クリア", "provisional"],
      needs_more: ["基準到達前", "needs"],
      data_missing: ["判定保留", "unknown"],
      ineligible: ["資格なし", "no"]
    };
    return map[result.status] || ["判定保留", "unknown"];
  }

  function matchesFilter(player, result) {
    if (selectedFilter === "eligible") return result.eligible;
    if (selectedFilter === "rookie") return player.rookie === true;
    if (selectedFilter === "noFirstTeam") return player.firstTeamRegistered === false;
    if (selectedFilter === "threshold") return result.status === "provisional_clear" || result.status === "eligible_threshold";
    if (selectedFilter === "batter") return player.role === "batter";
    if (selectedFilter === "pitcher") return player.role === "pitcher";
    return true;
  }

  function metricText(player, result) {
    return player.role === "pitcher"
      ? `投球回 ${outsToInnings(player.ipOuts)} ／ 必要 ${result.requiredIP}回`
      : `打席 ${player.pa} ／ 必要 ${result.requiredPA}打席`;
  }

  function renderPlayer(player, team) {
    const result = evaluation(player, team);
    const [label, tone] = statusMeta(result);
    const registration = player.registrationType === "development" ? "育成" : player.registrationType === "participatingClub" ? "参加球団所属" : "支配下";
    const firstTeam = player.firstTeamRegistered === true ? "あり" : player.firstTeamRegistered === false ? "なし" : "不明";
    const rookie = player.rookie === true ? "該当" : player.rookie === false ? "非該当" : "不明";
    return `<details class="farmPlayerCard">
      <summary>
        <span class="farmPlayerIdentity"><b>${escapeHtml(player.name)}</b><span>#${escapeHtml(player.number)}・${escapeHtml(player.position)}</span></span>
        <span class="farmStatus ${tone}">${label}</span>
        <span class="farmMetric">${metricText(player, result)}</span>
        <span class="farmReason">${escapeHtml(result.reason)}</span>
      </summary>
      <div class="farmPlayerDetail">
        <dl><div><dt>登録区分</dt><dd>${registration}</dd></div><div><dt>新人</dt><dd>${rookie}</dd></div><div><dt>一軍登録歴</dt><dd>${firstTeam}</dd></div><div><dt>ファーム出場</dt><dd>${player.farmGames}試合</dd></div></dl>
        <dl><div><dt>打席</dt><dd>${player.pa}</dd></div><div><dt>投球回</dt><dd>${outsToInnings(player.ipOuts)}</dd></div><div><dt>${player.role === "pitcher" ? "必要投球回" : "必要打席"}</dt><dd>${player.role === "pitcher" ? `${result.requiredIP}回` : `${result.requiredPA}打席`}</dd></div><div><dt>判定</dt><dd>${label}</dd></div></dl>
        <p><b>資格根拠：</b>${escapeHtml(result.reason)}</p>
      </div>
    </details>`;
  }

  function renderTeams() {
    const tabs = document.getElementById("farmChampTeamTabs");
    tabs.innerHTML = teams.map(team => {
      const item = data.teams[team];
      return `<button type="button" class="filterBtn ${team === selectedTeam ? "active" : ""}" data-team="${escapeHtml(team)}"><b>${escapeHtml(team)}</b><span>${escapeHtml(item.reason)}</span></button>`;
    }).join("");
    tabs.querySelectorAll("button").forEach(button => button.addEventListener("click", () => {
      selectedTeam = button.dataset.team;
      selectedFilter = "all";
      renderTeams();
      renderSelectedTeam();
      window.dispatchEvent(new CustomEvent("farmchampteamselect", { detail: { team: selectedTeam } }));
    }));
  }

  function renderFilters() {
    const node = document.getElementById("farmChampFilters");
    node.innerHTML = filters.map(([value, label]) => `<button type="button" class="filterBtn ${value === selectedFilter ? "active" : ""}" data-filter="${value}">${label}</button>`).join("");
    node.querySelectorAll("button").forEach(button => button.addEventListener("click", () => {
      selectedFilter = button.dataset.filter;
      renderFilters();
      renderPlayers();
    }));
  }

  function renderPlayers() {
    const teamData = data.teams[selectedTeam];
    const list = document.getElementById("farmChampPlayers");
    if (!teamData || teamData.dataStatus !== "complete") {
      list.innerHTML = `<div class="farmChampEmpty"><b>選手別判定は保留中です。</b><br>${escapeHtml(teamData?.note || "公式データを取得できませんでした。")}</div>`;
      document.getElementById("farmChampVisibleCount").textContent = "0名表示";
      return;
    }
    const filtered = teamData.players.filter(player => matchesFilter(player, evaluation(player, selectedTeam)));
    document.getElementById("farmChampVisibleCount").textContent = `${filtered.length}名表示`;
    if (!filtered.length) {
      list.innerHTML = '<div class="farmChampEmpty">この条件に該当する選手はいません。</div>';
      return;
    }
    const groups = [["batter", "野手"], ["pitcher", "投手"]];
    list.innerHTML = groups.map(([role, label]) => {
      const players = filtered.filter(player => player.role === role);
      return players.length ? `<h4 class="farmRoleHeading">${label}<span>${players.length}名</span></h4>${players.map(player => renderPlayer(player, selectedTeam)).join("")}` : "";
    }).join("");
  }

  function renderSelectedTeam() {
    const teamData = data.teams[selectedTeam];
    const title = document.getElementById("farmChampTeamTitle");
    const summary = document.getElementById("farmChampTeamSummary");
    title.textContent = teamData?.fullName || selectedTeam || "対象球団なし";
    if (!teamData) {
      summary.innerHTML = '<span class="muted">現在、進出可能性が残る球団はありません。</span>';
      return;
    }
    const results = teamData.players.map(player => evaluation(player, selectedTeam));
    const eligible = results.filter(result => result.eligible).length;
    const provisional = results.filter(result => result.status === "provisional_clear").length;
    const needs = results.filter(result => result.status === "needs_more").length;
    summary.innerHTML = `<div><b>${teamData.players.length}</b><span>資格候補</span></div><div><b>${eligible}</b><span>資格あり</span></div><div><b>${provisional}</b><span>暫定クリア</span></div><div><b>${needs}</b><span>基準到達前</span></div>`;
    document.getElementById("farmChampTeamReason").textContent = `${teamData.reason}｜残り${teamData.remaining}試合｜予測最終試合数${teamData.projectedTeamGames}`;
    renderFilters();
    renderPlayers();
  }

  document.getElementById("farmChampDataDate").textContent = `選手成績：${data.asOf}時点／一軍登録公示：${data.historyFetchedThrough}まで`;
  document.getElementById("farmChampCandidateDefinition").textContent = data.advancementDefinition;
  window.addEventListener("farmteamchange", event => {
    if (!teams.includes(event.detail?.team) || event.detail.team === selectedTeam) return;
    selectedTeam = event.detail.team;
    selectedFilter = "all";
    renderTeams();
    renderSelectedTeam();
  });
  renderTeams();
  renderSelectedTeam();
})();
