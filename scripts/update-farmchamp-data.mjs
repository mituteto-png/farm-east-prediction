import { readFile, writeFile } from "node:fs/promises";
import { FARM_CHAMP_CONFIG as CONFIG } from "../farmchamp-config.js";
import { getAdvancementCandidates } from "../farmchamp-advancement.js";

const OUTPUT = new URL("../farmchamp-data.js", import.meta.url);
const AUTO_DATA = new URL("../auto-data.js", import.meta.url);
const TEAM_NAMES = Object.fromEntries(Object.entries(CONFIG.teams).map(([short, value]) => [value.fullName, short]));
const JST_OFFSET_MS = 9 * 60 * 60 * 1000;

function parseAssignedJson(source, variable) {
  const match = source.match(new RegExp(`(?:window\\.)?${variable}\\s*=\\s*([\\s\\S]*);\\s*$`));
  if (!match) throw new Error(`Could not parse ${variable}.`);
  return JSON.parse(match[1]);
}

function stripHtml(value = "") {
  return value
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<sup[^>]*>[\s\S]*?<\/sup>/gi, " ")
    .replace(/<br\s*\/?>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;|&#160;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeName(value = "") {
  return stripHtml(value)
    .normalize("NFKC")
    .replace(/[\s・･.．]/g, "")
    .replace(/^[A-Z]{1,3}/i, "")
    .toLowerCase();
}

function tableCells(row) {
  return [...row.matchAll(/<(?:td|th)[^>]*>([\s\S]*?)<\/(?:td|th)>/gi)].map(match => stripHtml(match[1]));
}

function findStatsTable(html, requiredHeader) {
  for (const match of html.matchAll(/<table[^>]*class=["'][^"']*tablefix2[^"']*["'][^>]*>([\s\S]*?)<\/table>/gi)) {
    const table = match[1];
    const headerRow = table.match(/<thead[\s\S]*?<tr[^>]*>([\s\S]*?)<\/tr>/i)?.[1] || "";
    const headers = tableCells(headerRow);
    if (headers.includes(requiredHeader)) return { table, headers };
  }
  throw new Error(`Could not find the ${requiredHeader} table.`);
}

function parseBatting(html) {
  const { table, headers } = findStatsTable(html, "打席");
  const gameIndex = headers.indexOf("試合");
  const paIndex = headers.indexOf("打席");
  const output = new Map();
  const body = table.match(/<tbody[^>]*>([\s\S]*?)<\/tbody>/i)?.[1] || "";
  for (const row of body.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi)) {
    const cells = tableCells(row[1]);
    if (cells.length !== headers.length) continue;
    const name = cells[0];
    if (!name) continue;
    output.set(normalizeName(name), { name, games: Number(cells[gameIndex] || 0), pa: Number(cells[paIndex] || 0) });
  }
  return output;
}

function inningsToOuts(value) {
  const text = String(value || "0").replace(/\s+/g, "");
  const match = text.match(/^(\d+)(?:\.(\d))?$/);
  if (!match) return 0;
  return Number(match[1]) * 3 + Math.min(2, Number(match[2] || 0));
}

function parsePitching(html) {
  const { table, headers } = findStatsTable(html, "投球回");
  const gameIndex = headers.indexOf("登板");
  const ipIndex = headers.indexOf("投球回");
  const output = new Map();
  const body = table.match(/<tbody[^>]*>([\s\S]*?)<\/tbody>/i)?.[1] || "";
  for (const row of body.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi)) {
    const cells = tableCells(row[1]);
    if (cells.length !== headers.length) continue;
    const name = cells[0];
    if (!name) continue;
    output.set(normalizeName(name), { name, games: Number(cells[gameIndex] || 0), ipOuts: inningsToOuts(cells[ipIndex]) });
  }
  return output;
}

function parseRoster(html) {
  const roster = [];
  const headingPattern = /<h3[^>]*>\s*(?:<[^>]+>)*\s*■\s*(支配下選手|育成選手)[\s\S]*?<\/h3>/gi;
  const headings = [...html.matchAll(headingPattern)];
  for (let index = 0; index < headings.length; index++) {
    const registrationType = headings[index][1] === "育成選手" ? "development" : "controlled";
    const start = headings[index].index + headings[index][0].length;
    const end = headings[index + 1]?.index ?? html.length;
    const section = html.slice(start, end);
    for (const tableMatch of section.matchAll(/<table[^>]*>([\s\S]*?)<\/table>/gi)) {
      const table = tableMatch[1];
      let position = null;
      for (const rowMatch of table.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi)) {
        const row = rowMatch[1];
        if (/<th\b/i.test(row)) {
          position = stripHtml(row).match(/投手|捕手|内野手|外野手/)?.[0] || position;
          continue;
        }
        const playerLink = row.match(/href=["']\/bis\/players\/(\d+)\.html["'][^>]*>([\s\S]*?)<\/a>/i);
        if (!playerLink || !position) continue;
        const cells = tableCells(row);
        const note = cells.at(-1) || "";
        if (/へ移籍|自由契約|任意引退/.test(note) && !/より移籍/.test(note)) continue;
        roster.push({
          id: playerLink[1],
          name: stripHtml(playerLink[2]),
          number: cells[0] || "—",
          position,
          role: position === "投手" ? "pitcher" : "batter",
          registrationType,
          registeredAtCutoff: true
        });
      }
    }
  }
  return roster;
}

function parseDraftNames(html) {
  return [...html.matchAll(/<td[^>]*class=["'][^"']*name[^"']*["'][^>]*>([\s\S]*?)<\/td>/gi)].map(match => ({
    key: normalizeName(match[1]),
    text: stripHtml(match[1])
  }));
}

function isDraftedRookie(playerName, draftNames) {
  const key = normalizeName(playerName);
  const tokens = stripHtml(playerName).normalize("NFKC").split(/\s+/).map(normalizeName).filter(Boolean);
  return draftNames.some(draft => draft.key === key || (tokens.length > 1 && tokens.every(token => draft.key.includes(token))));
}

function parseFirstTeamRegistrations(html) {
  const registrations = [];
  for (const blockMatch of html.matchAll(/<div[^>]*class=["'][^"']*half_inner_wrap[^"']*["'][^>]*>([\s\S]*?)<\/div>\s*<\/div>/gi)) {
    const block = blockMatch[1];
    const heading = stripHtml(block.match(/<h5[^>]*>([\s\S]*?)<\/h5>/i)?.[1] || "");
    if (heading !== "出場選手登録") continue;
    for (const rowMatch of block.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi)) {
      const row = rowMatch[1];
      const id = row.match(/\/bis\/players\/(\d+)\.html/i)?.[1] || null;
      const cells = tableCells(row);
      if (cells.length < 4) continue;
      registrations.push({ team: TEAM_NAMES[cells[0]] || null, id, nameKey: normalizeName(cells[3]) });
    }
  }
  return registrations.filter(item => item.team && item.nameKey);
}

async function fetchText(url, { optional = false, attempts = 3 } = {}) {
  let lastError;
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      const response = await fetch(url, {
        headers: { "user-agent": "farm-east-prediction/3.1 (+https://github.com/mituteto-png/farm-east-prediction)", accept: "text/html" },
        signal: AbortSignal.timeout(25000)
      });
      if (optional && response.status === 404) return null;
      if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
      return await response.text();
    } catch (error) {
      lastError = error;
      if (attempt < attempts) await new Promise(resolve => setTimeout(resolve, attempt * 1500));
    }
  }
  if (optional) return { error: String(lastError) };
  throw lastError;
}

function jstDateString(date = new Date()) {
  return new Date(date.getTime() + JST_OFFSET_MS).toISOString().slice(0, 10);
}

function dateRange(start, end) {
  const dates = [];
  let cursor = new Date(`${start}T00:00:00Z`);
  const last = new Date(`${end}T00:00:00Z`);
  while (cursor <= last) {
    dates.push(cursor.toISOString().slice(0, 10));
    cursor = new Date(cursor.getTime() + 86400000);
  }
  return dates;
}

async function mapLimit(items, limit, callback) {
  const output = Array(items.length);
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const index = next++;
      output[index] = await callback(items[index], index);
    }
  }));
  return output;
}

const autoSource = await readFile(AUTO_DATA, "utf8");
const autoData = parseAssignedJson(autoSource, "FARM_AUTO_DATA");
const previousSource = await readFile(OUTPUT, "utf8").catch(() => "");
const previous = previousSource ? parseAssignedJson(previousSource, "FARM_CHAMP_DATA") : null;
const advancement = getAdvancementCandidates(autoData);
const candidateTeams = Object.keys(advancement.candidates);

const previousHistory = previous?.firstTeamRegistrationHistory || { ids: [], names: [] };
const registeredIds = new Set(previousHistory.ids || []);
const registeredNames = new Set(previousHistory.names || []);
const today = jstDateString();
const registrationEnd = today < CONFIG.eligibilityDecisionDate ? today : CONFIG.eligibilityDecisionDate;
let registrationStart = CONFIG.firstTeamRegistrationStartDate;
if (previous?.historyFetchedThrough) {
  const rewind = new Date(`${previous.historyFetchedThrough}T00:00:00Z`);
  rewind.setUTCDate(rewind.getUTCDate() - 2);
  registrationStart = rewind.toISOString().slice(0, 10);
}
const historyDates = dateRange(registrationStart, registrationEnd);
let historyComplete = true;
const dailyPages = await mapLimit(historyDates, 12, async date => {
  const [, month, day] = date.split("-");
  const result = await fetchText(`https://npb.jp/announcement/roster/roster_${month}${day}.html`, { optional: true, attempts: 2 });
  if (result && typeof result === "object" && result.error) historyComplete = false;
  return typeof result === "string" ? result : null;
});
for (const html of dailyPages.filter(Boolean)) {
  for (const item of parseFirstTeamRegistrations(html)) {
    if (item.id) registeredIds.add(item.id);
    registeredNames.add(`${item.team}|${item.nameKey}`);
  }
}

const teams = {};
await mapLimit(candidateTeams, 4, async team => {
  const meta = CONFIG.teams[team];
  const record = autoData.standings[team];
  const candidate = advancement.candidates[team];
  const gamesCompleted = record.w + record.l + record.t;
  const projectedTeamGames = gamesCompleted + candidate.remaining;
  if (meta.participatingClub) {
    try {
      const [battingHtml, pitchingHtml] = await Promise.all([
        fetchText(`https://npb.jp/bis/${CONFIG.season}/stats/idb2_${meta.code}.html`),
        fetchText(`https://npb.jp/bis/${CONFIG.season}/stats/idp2_${meta.code}.html`)
      ]);
      const batting = parseBatting(battingHtml);
      const pitching = parsePitching(pitchingHtml);
      const keys = new Set([...batting.keys(), ...pitching.keys()]);
      const players = [...keys].map(key => {
        const battingStats = batting.get(key);
        const pitchingStats = pitching.get(key);
        const role = (pitchingStats?.games || 0) > 0 ? "pitcher" : "batter";
        return {
          id: `${meta.code}-${key}`, name: battingStats?.name || pitchingStats?.name || key, number: "—",
          position: role === "pitcher" ? "投手" : "野手", role, registrationType: "participatingClub",
          registeredAtCutoff: true, participatingClub: true, rookie: null, firstTeamRegistered: null,
          farmAppeared: true, farmGames: Math.max(battingStats?.games || 0, pitchingStats?.games || 0),
          pa: battingStats?.pa || 0, ipOuts: pitchingStats?.ipOuts || 0, dataStatus: "complete"
        };
      }).filter(player => player.farmGames > 0);
      teams[team] = { ...candidate, fullName: meta.fullName, gamesCompleted, projectedTeamGames, dataStatus: "complete", players };
    } catch (error) {
      teams[team] = { ...candidate, fullName: meta.fullName, gamesCompleted, projectedTeamGames, dataStatus: "fetch_error", players: [], note: String(error) };
    }
    return;
  }

  try {
    const savedRoster = previous?.rosterSnapshotDate === CONFIG.rosterSnapshotDate
      ? previous?.teams?.[team]?.rosterSnapshot
      : null;
    const hasSavedRoster = Array.isArray(savedRoster) && savedRoster.length > 0;
    const [battingHtml, pitchingHtml, rosterHtml, draftHtml] = await Promise.all([
      fetchText(`https://npb.jp/bis/${CONFIG.season}/stats/idb2_${meta.code}.html`),
      fetchText(`https://npb.jp/bis/${CONFIG.season}/stats/idp2_${meta.code}.html`),
      hasSavedRoster ? Promise.resolve(null) : fetchText(`https://npb.jp/bis/teams/rst_${meta.code}.html`),
      fetchText(`https://draft.npb.jp/draft/${CONFIG.season - 1}/draftlist_${meta.code}.html`, { optional: true })
    ]);
    const batting = parseBatting(battingHtml);
    const pitching = parsePitching(pitchingHtml);
    // 8月31日の資格基準日後に名簿が変わっても判定対象が揺れないよう、
    // 初回取得した公式名簿を年度内はスナップショットとして再利用する。
    const roster = hasSavedRoster ? savedRoster : parseRoster(rosterHtml);
    const draftAvailable = typeof draftHtml === "string";
    const rookies = draftAvailable ? parseDraftNames(draftHtml) : [];
    const players = [];
    for (const player of roster) {
      const key = normalizeName(player.name);
      const battingStats = batting.get(key);
      const pitchingStats = pitching.get(key);
      const farmGames = Math.max(battingStats?.games || 0, pitchingStats?.games || 0);
      if (!farmGames) continue;
      const knownRegistered = registeredIds.has(player.id) || registeredNames.has(`${team}|${key}`);
      const rookie = isDraftedRookie(player.name, rookies) ? true : draftAvailable ? false : null;
      const firstTeamRegistered = knownRegistered ? true : historyComplete ? false : null;
      players.push({
        ...player,
        participatingClub: false,
        rookie,
        firstTeamRegistered,
        farmAppeared: true,
        farmGames,
        pa: battingStats?.pa || 0,
        ipOuts: pitchingStats?.ipOuts || 0,
        dataStatus: rookie !== null && firstTeamRegistered !== null ? "complete" : "partial"
      });
    }
    teams[team] = {
      ...candidate,
      fullName: meta.fullName,
      gamesCompleted,
      projectedTeamGames,
      dataStatus: "complete",
      rosterSnapshot: roster,
      players: players.sort((a, b) => a.role.localeCompare(b.role) || Number(a.number) - Number(b.number) || a.name.localeCompare(b.name, "ja"))
    };
  } catch (error) {
    teams[team] = {
      ...candidate, fullName: meta.fullName, gamesCompleted, projectedTeamGames,
      dataStatus: "fetch_error", players: [], note: String(error)
    };
  }
});

const payload = {
  season: CONFIG.season,
  asOf: autoData.officialThroughDate || autoData.standingsAsOf,
  fetchedAt: new Date().toISOString(),
  rosterSnapshotDate: CONFIG.rosterSnapshotDate,
  historyFetchedThrough: registrationEnd,
  historyComplete,
  advancementDefinition: "各球団が残り全勝、競合球団が残り全敗した場合の勝率上下限で消滅だけを証明する保守的判定。地区1位、または地区2位かつ他地区2位の最低到達勝率以上となり得る球団を候補とする。同率時は公式タイブレーク未確定のため可能性ありとして残す。",
  sources: {
    rules: CONFIG.officialRulesUrl,
    farmStats: `https://npb.jp/bis/${CONFIG.season}/stats/index_farm.html`,
    roster: "https://npb.jp/bis/teams/",
    firstTeamRegistration: "https://npb.jp/announcement/roster/",
    rookie: `https://draft.npb.jp/draft/${CONFIG.season - 1}/`
  },
  firstTeamRegistrationHistory: { ids: [...registeredIds].sort(), names: [...registeredNames].sort() },
  teams
};

const next = `window.FARM_CHAMP_DATA = ${JSON.stringify(payload, null, 2)};\n`;
if (process.env.FARM_DRY_RUN === "1") {
  console.log(JSON.stringify(payload, null, 2));
} else {
  await writeFile(OUTPUT, next, "utf8");
  console.log(`Updated farm championship data for ${candidateTeams.length} advancement candidates (${Object.values(teams).reduce((sum, team) => sum + team.players.length, 0)} players).`);
}
