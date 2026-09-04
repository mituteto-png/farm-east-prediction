import test from "node:test";
import assert from "node:assert/strict";
import {
  getFarmChampionshipEligibility,
  inningsToOuts,
  outsToInnings,
  requiredInnings,
  requiredPlateAppearances
} from "../farmchamp-eligibility.js";
import { getAdvancementCandidates } from "../farmchamp-advancement.js";

const beforeCutoff = new Date("2026-09-04T12:00:00+09:00");
const afterCutoff = new Date("2026-10-01T15:01:00+09:00");
const seasonData = { teams: { "日本ハム": { gamesCompleted: 140, projectedTeamGames: 140 } } };
const basePlayer = {
  registeredAtCutoff: true,
  farmAppeared: true,
  participatingClub: false,
  dataStatus: "complete",
  rookie: false,
  firstTeamRegistered: true,
  role: "batter",
  pa: 0,
  ipOuts: 0
};

test("qualification thresholds use floor", () => {
  assert.equal(requiredPlateAppearances(140), 113);
  assert.equal(requiredInnings(140), 33);
});

test("baseball innings are converted without treating .1 as one tenth", () => {
  assert.equal(inningsToOuts("52.1"), 157);
  assert.equal(outsToInnings(157), "52.1");
});

test("rookie is eligible by rule 1", () => {
  const result = getFarmChampionshipEligibility({ ...basePlayer, rookie: true }, "日本ハム", seasonData, beforeCutoff);
  assert.equal(result.eligible, true);
  assert.equal(result.status, "eligible_rookie");
});

test("player never registered with first team is eligible by rule 2", () => {
  const result = getFarmChampionshipEligibility({ ...basePlayer, firstTeamRegistered: false }, "日本ハム", seasonData, beforeCutoff);
  assert.equal(result.eligible, true);
  assert.equal(result.status, "eligible_no_first_team");
});

test("batter threshold is provisional before October 1 and final after publication time", () => {
  const player = { ...basePlayer, pa: 113 };
  assert.equal(getFarmChampionshipEligibility(player, "日本ハム", seasonData, beforeCutoff).status, "provisional_clear");
  assert.equal(getFarmChampionshipEligibility(player, "日本ハム", seasonData, afterCutoff).status, "eligible_threshold");
});

test("pitcher threshold compares outs and reports remaining innings", () => {
  const clear = { ...basePlayer, role: "pitcher", ipOuts: 99 };
  const short = { ...basePlayer, role: "pitcher", ipOuts: 97 };
  assert.equal(getFarmChampionshipEligibility(clear, "日本ハム", seasonData, beforeCutoff).status, "provisional_clear");
  assert.match(getFarmChampionshipEligibility(short, "日本ハム", seasonData, beforeCutoff).reason, /あと0\.2回/);
});

test("missing official inputs never produce an eligibility assertion", () => {
  const result = getFarmChampionshipEligibility({ ...basePlayer, dataStatus: "partial" }, "日本ハム", seasonData, beforeCutoff);
  assert.equal(result.eligible, false);
  assert.equal(result.status, "data_missing");
});

test("advancement candidates exclude only a team whose optimistic ceiling is below the required floors", () => {
  const autoData = {
    districts: {
      east: { teams: ["A", "B", "C"] },
      central: { teams: ["D", "E", "F"] },
      west: { teams: ["G", "H", "I"] }
    },
    standings: {
      A: { w: 80, l: 20 }, B: { w: 60, l: 40 }, C: { w: 10, l: 90 },
      D: { w: 70, l: 30 }, E: { w: 55, l: 45 }, F: { w: 30, l: 70 },
      G: { w: 75, l: 25 }, H: { w: 50, l: 50 }, I: { w: 20, l: 80 }
    },
    schedule: []
  };
  const result = getAdvancementCandidates(autoData);
  assert.equal(Boolean(result.candidates.A), true);
  assert.equal(Boolean(result.candidates.C), false);
});
