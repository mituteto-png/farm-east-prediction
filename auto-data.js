window.FARM_AUTO_DATA = {
  "season": 2026,
  "source": "https://npb.jp/farm/2026/",
  "lastCompletedDate": null,
  "results": []
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
