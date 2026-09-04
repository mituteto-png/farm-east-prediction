import { FARM_CHAMP_CONFIG } from "./farmchamp-config.js";

export function requiredPlateAppearances(teamGames, config = FARM_CHAMP_CONFIG) {
  return Math.floor(Number(teamGames || 0) * config.rules.plateAppearancesPerTeamGame * config.rules.qualificationRate);
}

export function requiredInnings(teamGames, config = FARM_CHAMP_CONFIG) {
  return Math.floor(Number(teamGames || 0) * config.rules.inningsPerTeamGame * config.rules.qualificationRate);
}

export function inningsToOuts(value) {
  const text = String(value ?? "0").trim().replace(/\s+/g, "");
  const match = text.match(/^(\d+)(?:\.(\d))?$/);
  if (!match) return 0;
  return Number(match[1]) * 3 + Math.min(2, Number(match[2] || 0));
}

export function outsToInnings(outs) {
  const safe = Math.max(0, Number(outs || 0));
  return `${Math.floor(safe / 3)}.${safe % 3}`;
}

export function getFarmChampionshipEligibility(player, team, seasonData, now = new Date(), config = FARM_CHAMP_CONFIG) {
  const teamData = seasonData?.teams?.[team] || {};
  const afterDecision = now >= new Date(`${config.eligibilityDecisionDate}T15:00:00+09:00`);
  const teamGames = afterDecision ? teamData.gamesCompleted : teamData.projectedTeamGames;
  const requiredPA = requiredPlateAppearances(teamGames, config);
  const requiredIP = requiredInnings(teamGames, config);
  const currentPA = Number(player?.pa || 0);
  const currentIPOuts = Number(player?.ipOuts || 0);
  const base = {
    eligible: false,
    provisional: !afterDecision,
    reason: "判定保留",
    status: "pending",
    requiredPA,
    requiredIP,
    currentPA,
    currentIP: outsToInnings(currentIPOuts),
    firstTeamRegistered: player?.firstTeamRegistered ?? null,
    rookie: player?.rookie ?? null,
    dataStatus: player?.dataStatus || "missing",
    teamGames,
    teamGamesStatus: afterDecision ? "official" : "projected"
  };

  if (!player || player.dataStatus !== "complete") {
    return { ...base, reason: "必要データが不足しているため判定できません", status: "data_missing" };
  }
  if (!player.registeredAtCutoff || !player.farmAppeared) {
    return { ...base, provisional: false, reason: "8月31日時点の登録またはファーム出場条件を満たしません", status: "ineligible" };
  }
  if (player.participatingClub) {
    return { ...base, eligible: true, provisional: false, reason: "参加球団所属で本年度ファーム公式戦に出場", status: "eligible_participating_club" };
  }
  if (player.rookie === true) {
    return { ...base, eligible: true, provisional: false, reason: "出場資格あり：新人選手", status: "eligible_rookie" };
  }
  if (player.firstTeamRegistered === false) {
    return { ...base, eligible: true, provisional: false, reason: "出場資格あり：一軍登録なし", status: "eligible_no_first_team" };
  }
  if (player.firstTeamRegistered === null || player.rookie === null) {
    return { ...base, reason: "一軍登録歴または新人情報が不足しているため判定保留", status: "data_missing" };
  }

  const isPitcher = player.role === "pitcher";
  const reached = isPitcher ? currentIPOuts >= requiredIP * 3 : currentPA >= requiredPA;
  const shortage = isPitcher ? Math.max(0, requiredIP * 3 - currentIPOuts) : Math.max(0, requiredPA - currentPA);
  if (reached) {
    return {
      ...base,
      eligible: afterDecision,
      provisional: !afterDecision,
      reason: afterDecision
        ? `出場資格あり：${isPitcher ? "規定投球回" : "規定打席"}30％以上`
        : `現時点で基準クリア（10月1日に確定）`,
      status: afterDecision ? "eligible_threshold" : "provisional_clear"
    };
  }

  const shortageText = isPitcher ? `${outsToInnings(shortage)}回` : `${shortage}打席`;
  return {
    ...base,
    provisional: !afterDecision,
    reason: `基準到達まであと${shortageText}`,
    status: afterDecision ? "ineligible" : "needs_more"
  };
}
