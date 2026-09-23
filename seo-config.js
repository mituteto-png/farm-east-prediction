export const SEO_CONFIG = Object.freeze({
  season: 2026,
  siteName: '2026 NPBファームデータ',
  baseUrl: 'https://mituteto-png.github.io/farm-east-prediction/',
  imagePath: 'assets/ogp.png',
  description: 'NPBファーム全14球団の順位、優勝確率、個人成績、若手ランキング、日本選手権予測を掲載する非公式データサイト。'
});

export const PAGE_SEO = Object.freeze({
  'index.html': {
    path: '',
    title: '2026 NPBファーム順位・優勝確率・個人成績｜ファームデータ分析',
    description: SEO_CONFIG.description,
    heading: '2026 NPBファーム3地区 優勝・順位予測'
  },
  'prediction.html': {
    path: 'prediction.html',
    title: '2026 ファーム優勝確率・順位予測｜NPBファームデータ',
    description: '2026年NPBファーム東・中・西地区の現在順位、優勝確率、最終順位確率、優勝予想日、マジック推移、残り日程を確認できます。'
  },
  'simulator.html': {
    path: 'simulator.html',
    title: 'ファーム優勝確率シミュレーター｜2026 NPBファームデータ',
    description: '今後の複数試合の勝敗を仮定し、2026年NPBファーム各地区の優勝確率がどう変わるか20,000回の計算で比較します。'
  },
  'farmchamp.html': {
    path: 'farmchamp.html',
    title: '2026 ファーム日本選手権｜出場資格・優勝確率',
    description: '2026年プロ野球ファーム日本選手権の進出・優勝確率、出場資格選手、資格ボーダー、ベストメンバー予想を掲載します。'
  },
  'power-ranking.html': {
    path: 'power-ranking.html',
    title: '2026 ファーム全14球団パワーランキング',
    description: 'NPBファーム全14球団を勝率、ピタゴラス勝率、得点力、失点抑制から同じ基準で比較する当サイト独自のパワーランキングです。'
  },
  'about.html': {
    path: 'about.html',
    title: '予測モデル・データ出典｜2026 NPBファームデータ',
    description: '2026年NPBファーム予測モデルV3.0、20,000回シミュレーション、地区戦力指数、データソース、自動更新の仕組みを説明します。'
  },
  stats: {
    path: 'stats/',
    title: '2026 ファーム個人成績・選手ランキング｜NPBファームデータ',
    description: '2026年NPBファーム全14球団の打撃・投手個人成績を検索し、球団・地区・年齢・新人・育成などで絞り込み、指標別に比較できます。'
  },
  titles: {
    path: 'stats/titles/',
    title: '2026 ファーム個人タイトル争い｜NPBファームデータ',
    description: '2026年NPBファーム東・中・西地区の首位打者、本塁打、打点、防御率、勝利、奪三振などの個人タイトル争いを確認できます。'
  },
  prospects: {
    path: 'stats/prospects/',
    title: '2026 ファーム若手・新人・育成ランキング',
    description: '2026年NPBファーム全14球団のU20・U23・U25、新人、育成選手を打率、OPS、防御率、WHIPなどで比較できる成績ランキングです。'
  },
  compare: {
    path: 'stats/compare/',
    title: 'ファーム選手比較｜2026 NPBファーム成績',
    description: '2026年NPBファームの打者・投手を2〜4人選び、基本成績とOPS、WHIP、K/9などの詳細指標を同じ画面で比較できます。'
  },
  player: {
    path: 'players/',
    title: '2026 NPBファーム選手詳細｜個人成績・経歴',
    description: '2026年NPBファーム選手の個人成績、プロフィール、経歴、日本選手権出場資格を確認できます。'
  }
});

export function absoluteUrl(path = '') {
  return new URL(path, SEO_CONFIG.baseUrl).href;
}
