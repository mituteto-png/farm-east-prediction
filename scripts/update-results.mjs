import { readFile, writeFile } from "node:fs/promises";

const YEAR = 2026;
const BASE_DATE = Number(process.env.FARM_BASE_DATE || 822);
const MONTHS = [8, 9];
const OUTPUT = new URL("../auto-data.js", import.meta.url);
const SOURCE = `https://npb.jp/farm/${YEAR}/`;

const teamAliases = new Map([
  ["北海道日本ハムファイターズ", "日本ハム"],
  ["日本ハム", "日本ハム"],
  ["東北楽天ゴールデンイーグルス", "楽天"],
  ["楽天", "楽天"],
  ["千葉ロッテマリーンズ", "ロッテ"],
  ["ロッテ", "ロッテ"],
  ["東京ヤクルトスワローズ", "ヤクルト"],
  ["ヤクルト", "ヤクルト"],
  ["オイシックス新潟アルビレックスBC", "オイシックス"],
  ["オイシックス", "オイシックス"],
  ["横浜DeNAベイスターズ", "DeNA"],
  ["DeNA", "DeNA"],
  ["読売ジャイアンツ", "巨人"],
  ["巨人", "巨人"],
  ["埼玉西武ライオンズ", "西武"],
  ["西武", "西武"],
  ["くふうハヤテベンチャーズ静岡", "ハヤテ"],
  ["ハヤテ", "ハヤテ"],
  ["中日ドラゴンズ", "中日"],
  ["中日", "中日"],
  ["阪神タイガース", "阪神"],
  ["阪神", "阪神"],
  ["広島東洋カープ", "広島"],
  ["広島", "広島"],
  ["オリックス・バファローズ", "オリックス"],
  ["オリックス", "オリックス"],
  ["福岡ソフトバンクホークス", "ソフトバンク"],
  ["ソフトバンク", "ソフトバンク"]
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

function normalTeam(name) {
  return teamAliases.get(name) || name;
}

function parsePage(html) {
  const results = [];
  const rowPattern = /<tr\s+id=["']date(\d{4})["'][^>]*>([\s\S]*?)<\/tr>/gi;
  for (const match of html.matchAll(rowPattern)) {
    const mmdd = Number(match[1]);
    if (mmdd <= BASE_DATE) continue;
    const row = match[2];
    const home = normalTeam(takeClass(row, "team1"));
    const away = normalTeam(takeClass(row, "team2"));
    if (!home || !away) continue;
    const month = Number(match[1].slice(0, 2));
    const day = Number(match[1].slice(2));
    const date = `${month}/${day}`;
    const homeScoreText = takeClass(row, "score1");
    const awayScoreText = takeClass(row, "score2");
    const homeScore = /^\d+$/.test(homeScoreText) ? Number(homeScoreText) : null;
    const awayScore = /^\d+$/.test(awayScoreText) ? Number(awayScoreText) : null;
    const statusText = takeClass(row, "state");
    if (homeScore !== null && awayScore !== null) {
      results.push({ date, home, away, homeScore, awayScore, status: "final" });
    } else if (/中止/.test(stripHtml(row)) || /中止/.test(statusText)) {
      results.push({ date, home, away, status: "cancelled" });
    }
  }
  return results;
}

async function fetchText(url, attempts = 3) {
  let lastError;
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      const response = await fetch(url, {
        headers: {
          "user-agent": "farm-east-prediction/1.0 (+https://github.com/mituteto-png/farm-east-prediction)",
          "accept": "text/html,application/xhtml+xml"
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

const pages = await Promise.all(MONTHS.map(async month => {
  const url = `${SOURCE}schedule_${String(month).padStart(2, "0")}_detail.html`;
  return parsePage(await fetchText(url));
}));

const unique = new Map();
for (const result of pages.flat()) {
  unique.set(`${result.date}|${result.home}|${result.away}`, result);
}
const results = [...unique.values()].sort((a, b) => {
  const [am, ad] = a.date.split("/").map(Number);
  const [bm, bd] = b.date.split("/").map(Number);
  return am * 100 + ad - (bm * 100 + bd) || a.home.localeCompare(b.home, "ja");
});

const lastCompletedDate = results.at(-1)?.date ?? null;
const payload = { season: YEAR, source: SOURCE, lastCompletedDate, results };
const next = `window.FARM_AUTO_DATA = ${JSON.stringify(payload, null, 2)};\n`;
if (process.env.FARM_DRY_RUN === "1") {
  console.log(JSON.stringify(payload, null, 2));
  process.exit(0);
}
const current = await readFile(OUTPUT, "utf8").catch(() => "");
if (current !== next) {
  await writeFile(OUTPUT, next, "utf8");
  console.log(`Updated ${results.length} official results through ${lastCompletedDate ?? "none"}.`);
} else {
  console.log(`No changes (${results.length} official results).`);
}
