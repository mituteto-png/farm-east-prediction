function pct(wins, losses) {
  return wins + losses ? wins / (wins + losses) : 0;
}

export function getAdvancementCandidates(autoData) {
  const remaining = Object.fromEntries(Object.keys(autoData.standings).map(team => [team, 0]));
  for (const game of autoData.schedule || []) {
    if (remaining[game.home] !== undefined) remaining[game.home]++;
    if (remaining[game.away] !== undefined) remaining[game.away]++;
  }

  const bounds = {};
  for (const [team, record] of Object.entries(autoData.standings)) {
    bounds[team] = {
      min: pct(record.w, record.l + remaining[team]),
      max: pct(record.w + remaining[team], record.l),
      remaining: remaining[team]
    };
  }

  const runnerUpFloor = {};
  for (const [key, district] of Object.entries(autoData.districts)) {
    runnerUpFloor[key] = district.teams.map(team => bounds[team].min).sort((a, b) => b - a)[1] || 0;
  }

  const candidates = {};
  for (const [key, district] of Object.entries(autoData.districts)) {
    for (const team of district.teams) {
      const higherFloors = district.teams.filter(rival => rival !== team && bounds[rival].min > bounds[team].max + 1e-12).length;
      const canWinDistrict = higherFloors === 0;
      const canFinishTopTwo = higherFloors <= 1;
      const otherRunnerUpFloor = Math.max(...Object.entries(runnerUpFloor).filter(([other]) => other !== key).map(([, value]) => value));
      const canReachWildCard = canFinishTopTwo && bounds[team].max + 1e-12 >= otherRunnerUpFloor;
      if (!canWinDistrict && !canReachWildCard) continue;
      candidates[team] = {
        district: key,
        canWinDistrict,
        canReachWildCard,
        maxFinalPct: bounds[team].max,
        remaining: bounds[team].remaining,
        reason: canWinDistrict && canReachWildCard ? "地区優勝またはワイルドカードの可能性あり" : canWinDistrict ? "地区優勝の可能性あり" : "ワイルドカードの可能性あり"
      };
    }
  }
  return { candidates, bounds, runnerUpFloor };
}

