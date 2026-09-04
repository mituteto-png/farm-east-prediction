export const FARM_CHAMP_CONFIG = Object.freeze({
  season: 2026,
  rosterSnapshotDate: "2026-08-31",
  eligibilityDecisionDate: "2026-10-01",
  firstTeamRegistrationStartDate: "2026-03-27",
  officialUrl: "https://npb.jp/farmchamp/2026/",
  officialRulesUrl: "https://npb.jp/farmchamp/2026/information.html",
  tournament: {
    firstStage: "2026-10-03",
    finalStage: "2026-10-04",
    reserveDate: "2026-10-05",
    format: "4チームによるトーナメント方式"
  },
  rules: {
    plateAppearancesPerTeamGame: 2.7,
    inningsPerTeamGame: 0.8,
    qualificationRate: 0.3,
    round: "floor"
  },
  teams: {
    "日本ハム": { fullName: "北海道日本ハムファイターズ", code: "f", district: "east" },
    "楽天": { fullName: "東北楽天ゴールデンイーグルス", code: "e", district: "east" },
    "ロッテ": { fullName: "千葉ロッテマリーンズ", code: "m", district: "east" },
    "ヤクルト": { fullName: "東京ヤクルトスワローズ", code: "s", district: "east" },
    "オイシックス": { fullName: "オイシックス新潟アルビレックスBC", code: "a", district: "east", participatingClub: true },
    "DeNA": { fullName: "横浜DeNAベイスターズ", code: "db", district: "central" },
    "巨人": { fullName: "読売ジャイアンツ", code: "g", district: "central" },
    "西武": { fullName: "埼玉西武ライオンズ", code: "l", district: "central" },
    "中日": { fullName: "中日ドラゴンズ", code: "d", district: "central" },
    "ハヤテ": { fullName: "くふうハヤテベンチャーズ静岡", code: "v", district: "central", participatingClub: true },
    "ソフトバンク": { fullName: "福岡ソフトバンクホークス", code: "h", district: "west" },
    "オリックス": { fullName: "オリックス・バファローズ", code: "b", district: "west" },
    "広島": { fullName: "広島東洋カープ", code: "c", district: "west" },
    "阪神": { fullName: "阪神タイガース", code: "t", district: "west" }
  }
});

