window.FARM_AUTO_DATA = {
  "season": 2026,
  "source": "https://npb.jp/farm/2026/",
  "lastCompletedDate": "8/23",
  "results": [
    {
      "date": "8/23",
      "home": "オリックス",
      "away": "広島",
      "homeScore": 2,
      "awayScore": 1,
      "status": "final"
    },
    {
      "date": "8/23",
      "home": "ハヤテ",
      "away": "DeNA",
      "homeScore": 0,
      "awayScore": 14,
      "status": "final"
    },
    {
      "date": "8/23",
      "home": "ヤクルト",
      "away": "西武",
      "homeScore": 4,
      "awayScore": 6,
      "status": "final"
    },
    {
      "date": "8/23",
      "home": "楽天",
      "away": "オイシックス",
      "homeScore": 5,
      "awayScore": 1,
      "status": "final"
    },
    {
      "date": "8/23",
      "home": "阪神",
      "away": "ソフトバンク",
      "homeScore": 3,
      "awayScore": 2,
      "status": "final"
    },
    {
      "date": "8/23",
      "home": "日本ハム",
      "away": "ロッテ",
      "homeScore": 5,
      "awayScore": 14,
      "status": "final"
    }
  ]
};

(() => {
  const badges = document.querySelector(".badges");
  if (!badges || document.getElementById("updateScheduleBadge")) return;
  const badge = document.createElement("span");
  badge.className = "badge";
  badge.id = "updateScheduleBadge";
  badge.textContent = "自動更新：毎日8:00・17:00";
  badges.appendChild(badge);
})();
