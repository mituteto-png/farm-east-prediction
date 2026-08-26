import { readFile, writeFile } from "node:fs/promises";

const YEAR = 2026;
// Current standings already contain the full season; only the remaining-season
// schedule and recent results are needed here.
const MONTHS = [8, 9, 10];
const OUTPUT = new URL("../auto-data.js", import.meta.url);
const SCHEDULE_SOURCE = `https://npb.jp/farm/${YEAR}/`;
const STATS_SOURCE = `https://npb.jp/bis/${YEAR}/stats/index_farm.html`;

const DISTRICTS = {
  east: { name: "東地区", teams: ["日本ハム", "楽天", "ロッテ", "ヤクルト", "オイシックス"] },
  central: { name: "中地区", teams: ["DeNA", "巨人", "西武", "中日", "ハヤテ"] },
  west: { name: "西地区", teams: ["ソフトバンク", "オリックス", "広島", "阪神"] }
};

const teamAliases = new Map([
  ["北海道日本ハムファイターズ", "日本ハム"], ["北海道日本ハム", "日本ハム"], ["日本ハム", "日本ハム"],
  ["東北楽天ゴールデンイーグルス", "楽天"], ["東北楽天", "楽天"], ["楽天", "楽天"],
  ["千葉ロッテマリーンズ", "ロッテ"], ["千葉ロッテ", "ロッテ"], ["ロッテ", "ロッテ"],
  ["東京ヤクルトスワローズ", "ヤクルト"], ["東京ヤクルト", "ヤクルト"], ["ヤクルト", "ヤクルト"],
  ["オイシックス新潟アルビレックスBC", "オイシックス"], ["オイシックス新潟", "オイシックス"], ["オイシックス", "オイシックス"],
  ["横浜DeNAベイスターズ", "DeNA"], ["横浜DeNA", "DeNA"], ["DeNA", "DeNA"],
  ["読売ジャイアンツ", "巨人"], ["読売", "巨人"], ["巨人", "巨人"],
  ["埼玉西武ライオンズ", "西武"], ["埼玉西武", "西武"], ["西武", "西武"],
  ["くふうハヤテベンチャーズ静岡", "ハヤテ"], ["ハヤテベンチャーズ静岡", "ハヤテ"], ["ハヤテ静岡", "ハヤテ"], ["ハヤテ", "ハヤテ"],
  ["中日ドラゴンズ", "中日"], ["中日", "中日"],
  ["阪神タイガース", "阪神"], ["阪神", "阪神"],
  ["広島東洋カープ", "広島"], ["広島東洋", "広島"], ["広島", "広島"],
  ["オリックス・バファローズ", "オリックス"], ["オリックス", "オリックス"],
  ["福岡ソフトバンクホークス", "ソフトバンク"], ["福岡ソフトバンク", "ソフトバンク"], ["ソフトバンク", "ソフトバンク"]
]);

function stripHtml(value = "") {
  return value
    .replace(/<br\s*\/?>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;|&#160;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&quot;/gi, '"')
    .replace(/\s+/g, " ")
    .trim();
}

function takeClass(row, className) {
  const match = row.match(new RegExp(`<[^>]+class=["'][^"']*\\b${className}\\b[^"']*["'][^>]*>([\\s\\S]*?)<\\/[^>]+>`, "i"));
  return stripHtml(match?.[1]);
}

function normalTeam(name = "") {
  const compact = name.replace(/[　\s]/g, "");
  for (const [alias, team] of teamAliases) {
    if (compact === alias.replace(/[　\s]/g, "")) return team;
  }
  return name.trim();
}

function dateOrder(date) {
  const [month, day] = date.split("/").map(Number);
  return month * 100 + day;
}

function parseSchedulePage(html) {
  const games = [];
  const rowPattern = /<tr\s+id=["']date(\d{4})["'][^>]*>([\s\S]*?)<\/tr>/gi;
  for (const match of html.matchAll(rowPattern)) {
    const row = match[2];
    const home = normalTeam(takeClass(row, "team1"));
    const away = normalTeam(takeClass(row, "team2"));
    if (!home || !away) continue;
    const month = Number(match[1].slice(0, 2));
    const day = Number(match[1].slice(2));
    const date = `${month}/${day}`;
    const venue = takeClass(row, "place");
    const homeScoreText = takeClass(row, "score1");
    const awayScoreText = takeClass(row, "score2");
    const statusText = takeClass(row, "state");
    const homeScore = /^\d+$/.test(homeScoreText) ? Number(homeScoreText) : null;
    const awayScore = /^\d+$/.test(awayScoreText) ? Number(awayScoreText) : null;
    if (homeScore !== null && awayScore !== null) {
      games.push({ date, home, away, venue, homeScore, awayScore, status: "final" });
    } else if (/中止|ノーゲーム/.test(stripHtml(row)) || /中止|ノーゲーム/.test(statusText)) {
      games.push({ date, home, away, venue, status: "cancelled" });
    } else {
      games.push({ date, home, away, venue, status: "scheduled" });
    }
  }
  return games;
}

function parseStandings(html) {
  const standings = {};
  for (const district of ["east", "central", "west"]) {
    const block = html.match(new RegExp(`standings_wrap--${district}[\\s\\S]*?<tbody>([\\s\\S]*?)<\\/tbody>`, "i"));
    if (!block) throw new Error(`Could not parse ${district} standings.`);
    for (const rowMatch of block[1].matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi)) {
      const row = rowMatch[1];
      const shortName = row.match(/class=["']hide_sp["'][^>]*>([\s\S]*?)<\/span>/i);
      const team = normalTeam(stripHtml(shortName?.[1] || row.match(/<th[^>]*>([\s\S]*?)<\/th>/i)?.[1]));
      const cells = [...row.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)].map(m => stripHtml(m[1]));
      if (!team || cells.length < 4) continue;
      standings[team] = { district, w: Number(cells[1]), l: Number(cells[2]), t: Number(cells[3]), rs: 0, ra: 0 };
    }
  }
  const asOfMatch = html.match(/(\d{4})年(\d{1,2})月(\d{1,2})日\s*現在/);
  const asOfDate = asOfMatch ? `${Number(asOfMatch[2])}/${Number(asOfMatch[3])}` : null;
  return { standings, asOfDate };
}

function parseTeamMetric(html, wantedHeader) {
  const table = html.match(/<table[^>]*class=["'][^"']*tablefix2[^"']*["'][^>]*>([\s\S]*?)<\/table>/i);
  if (!table) throw new Error(`Could not parse team metric table for ${wantedHeader}.`);
  const headers = [...table[1].matchAll(/<th[^>]*>([\s\S]*?)<\/th>/gi)].map(m => stripHtml(m[1]));
  const metricIndex = headers.indexOf(wantedHeader);
  if (metricIndex < 0) throw new Error(`Metric ${wantedHeader} was not found.`);
  const output = {};
  for (const rowMatch of table[1].matchAll(/<tr[^>]*class=["'][^"']*ststats[^"']*["'][^>]*>([\s\S]*?)<\/tr>/gi)) {
    const cells = [...rowMatch[1].matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)].map(m => stripHtml(m[1]));
    if (cells.length <= metricIndex) continue;
    output[normalTeam(cells[0])] = Number(cells[metricIndex].replace(/,/g, ""));
  }
  return output;
}

async function fetchText(url, attempts = 3) {
  let lastError;
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      const response = await fetch(url, {
        headers: {
          "user-agent": "farm-east-prediction/2.0 (+https://github.com/mituteto-png/farm-east-prediction)",
          accept: "text/html,application/xhtml+xml"
        },
        signal: AbortSignal.timeout(20000)
      });
      if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
      return await response.text();
    } catch (error) {
      lastError = error;
      if (attempt < attempts) await new Promise(resolve => setTimeout(resolve, attempt * 3000));
    }
  }
  throw lastError;
}

const regionSuffixes = ["2e", "2c", "2w"];
const [statsHtml, schedulePages, battingPages, pitchingPages] = await Promise.all([
  fetchText(STATS_SOURCE),
  Promise.all(MONTHS.map(month => fetchText(`${SCHEDULE_SOURCE}schedule_${String(month).padStart(2, "0")}_detail.html`))),
  Promise.all(regionSuffixes.map(suffix => fetchText(`https://npb.jp/bis/${YEAR}/stats/tmb_${suffix}.html`))),
  Promise.all(regionSuffixes.map(suffix => fetchText(`https://npb.jp/bis/${YEAR}/stats/tmp_${suffix}.html`)))
]);

const { standings, asOfDate } = parseStandings(statsHtml);
if (!asOfDate) throw new Error("Could not determine the official standings date.");

for (const page of battingPages) {
  for (const [team, value] of Object.entries(parseTeamMetric(page, "得点"))) {
    if (standings[team]) standings[team].rs = value;
  }
}
for (const page of pitchingPages) {
  for (const [team, value] of Object.entries(parseTeamMetric(page, "失点"))) {
    if (standings[team]) standings[team].ra = value;
  }
}

const unique = new Map();
for (const game of schedulePages.flatMap(parseSchedulePage)) {
  unique.set(`${game.date}|${game.home}|${game.away}`, game);
}
const allGames = [...unique.values()].sort((a, b) => dateOrder(a.date) - dateOrder(b.date) || a.home.localeCompare(b.home, "ja"));
const asOfOrder = dateOrder(asOfDate);
const newerFinals = allGames.filter(game => game.status === "final" && dateOrder(game.date) > asOfOrder);

for (const game of newerFinals) {
  const home = standings[game.home];
  const away = standings[game.away];
  if (!home || !away) continue;
  home.rs += game.homeScore;
  home.ra += game.awayScore;
  away.rs += game.awayScore;
  away.ra += game.homeScore;
  if (game.homeScore === game.awayScore) {
    home.t++;
    away.t++;
  } else if (game.homeScore > game.awayScore) {
    home.w++;
    away.l++;
  } else {
    away.w++;
    home.l++;
  }
}

const completed = allGames.filter(game => game.status === "final");
const lastCompletedDate = completed.at(-1)?.date ?? asOfDate;
const officialThroughDate = dateOrder(lastCompletedDate) > asOfOrder ? lastCompletedDate : asOfDate;
const schedule = allGames.filter(game => game.status === "scheduled" && dateOrder(game.date) > asOfOrder);
const recentResults = allGames.filter(game => game.status !== "scheduled" && dateOrder(game.date) >= Math.max(301, dateOrder(officialThroughDate) - 7)).slice(-40);

const payload = {
  season: YEAR,
  source: SCHEDULE_SOURCE,
  statsSource: STATS_SOURCE,
  standingsAsOf: asOfDate,
  lastCompletedDate,
  officialThroughDate,
  fetchedAt: new Date().toISOString(),
  districts: DISTRICTS,
  standings,
  schedule,
  results: recentResults
};

const next = `window.FARM_AUTO_DATA = ${JSON.stringify(payload, null, 2)};\n`;

if (process.env.FARM_DRY_RUN === "1") {
  console.log(JSON.stringify(payload, null, 2));
  process.exit(0);
}

const current = await readFile(OUTPUT, "utf8").catch(() => "");
if (current !== next) {
  await writeFile(OUTPUT, next, "utf8");
  console.log(`Updated ${Object.keys(standings).length} teams and ${schedule.length} remaining games through ${officialThroughDate}.`);
} else {
  console.log(`No changes (${Object.keys(standings).length} teams through ${officialThroughDate}).`);
}
