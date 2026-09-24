import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {SEO_CONFIG, PAGE_SEO, absoluteUrl} from '../seo-config.js';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const pages=[
 ['index.html','index.html','ホーム'],['prediction.html','prediction.html','優勝・順位予測'],['simulator.html','simulator.html','試合シミュレーター'],['farmchamp.html','farmchamp.html','ファーム日本選手権'],['power-ranking.html','power-ranking.html','パワーランキング'],['about.html','about.html','モデル・データ'],
 ['stats/index.html','stats','個人成績'],['stats/titles/index.html','titles','個人タイトル'],['stats/prospects/index.html','prospects','若手ランキング'],['stats/compare/index.html','compare','選手比較'],['players/index.html','player','選手詳細']
];
const headings={
 'index.html':'2026 NPBファーム3地区 優勝・順位予測','prediction.html':'2026 NPBファーム 優勝・順位予測','simulator.html':'2026 ファーム優勝確率シミュレーター','farmchamp.html':'2026 プロ野球ファーム日本選手権','power-ranking.html':'2026 ファーム全14球団 パワーランキング','about.html':'予測モデル・データ出典',stats:'2026 NPBファーム個人成績',titles:'2026 NPBファーム個人タイトル争い',prospects:'2026 ファーム若手・新人・育成ランキング',compare:'2026 NPBファーム選手比較',player:'2026 NPBファーム選手詳細'
};
const footerNav='<nav class="footerNav" aria-label="サイト内リンク"><a href="index.html">ホーム</a><a href="prediction.html">ファーム優勝・順位予測</a><a href="stats/">ファーム個人成績</a><a href="stats/titles/">個人タイトル争い</a><a href="stats/prospects/">若手・育成ランキング</a><a href="stats/compare/">選手比較</a><a href="farmchamp.html">ファーム日本選手権</a><a href="power-ranking.html">パワーランキング</a><a href="about.html">データ・モデル</a></nav><p class="siteDisclaimer">NPB公式サイトではない、非公式のファームデータ・予測サイトです。</p>';
const esc=s=>String(s).replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
for(const [file,key,label] of pages){
 const target=path.join(root,file),seo=PAGE_SEO[key],dynamic=key==='player',url=absoluteUrl(seo.path),image=absoluteUrl(SEO_CONFIG.imagePath);
 const crumbs=key==='index.html'?[]:[{name:'ホーム',item:SEO_CONFIG.baseUrl},{name:label,item:url}];
 const graph=[{'@type':'WebPage','@id':`${url}#webpage`,url,name:seo.title,description:seo.description,isPartOf:{'@id':`${SEO_CONFIG.baseUrl}#website`}}];
 if(key==='index.html')graph.unshift({'@type':'WebSite','@id':`${SEO_CONFIG.baseUrl}#website`,url:SEO_CONFIG.baseUrl,name:SEO_CONFIG.siteName,description:SEO_CONFIG.description,inLanguage:'ja-JP'});
 if(crumbs.length)graph.push({'@type':'BreadcrumbList',itemListElement:crumbs.map((c,i)=>({'@type':'ListItem',position:i+1,name:c.name,item:c.item}))});
 const tags=`<!-- SEO:START --><title>${esc(seo.title)}</title><meta name="description" content="${esc(seo.description)}"><meta name="robots" content="index,follow,max-image-preview:large"><link rel="icon" type="image/svg+xml" href="assets/favicon.svg"><meta property="og:locale" content="ja_JP"><meta property="og:site_name" content="${esc(SEO_CONFIG.siteName)}"><meta property="og:type" content="${dynamic?'profile':'website'}"><meta property="og:title" content="${esc(seo.title)}"><meta property="og:description" content="${esc(seo.description)}">${dynamic?'':`<meta property="og:url" content="${url}"><link rel="canonical" href="${url}">`}<meta property="og:image" content="${image}"><meta property="og:image:width" content="1200"><meta property="og:image:height" content="630"><meta property="og:image:alt" content="2026 NPBファームデータのサイト紹介画像"><meta name="twitter:card" content="summary_large_image"><meta name="twitter:title" content="${esc(seo.title)}"><meta name="twitter:description" content="${esc(seo.description)}"><meta name="twitter:image" content="${image}">${key==='index.html'?'<meta name="google-site-verification" content="Pyqrlcr54yct9qiKlkrNugllblJIUV0xEOgzvIaKOuE">':''}${dynamic?'':`<script type="application/ld+json" id="pageStructuredData">${JSON.stringify({'@context':'https://schema.org','@graph':graph})}</script>`}<!-- SEO:END -->`;
 let html=fs.readFileSync(target,'utf8');
 if(/<!-- SEO:START -->/.test(html))html=html.replace(/<!-- SEO:START -->[\s\S]*?<!-- SEO:END -->/g,tags);
 else if(/<title>/i.test(html))html=html.replace(/<title>[\s\S]*?<\/title>/i,tags);
 else html=html.replace('</head>',`${tags}</head>`);
 html=html.replace(/<h1>[\s\S]*?<\/h1>/i,`<h1>${headings[key]}</h1>`);
 html=html.replace(/<nav class="footerNav"[\s\S]*?<p class="siteDisclaimer">[\s\S]*?<\/p>/g,'').replace('</footer>',`${footerNav}</footer>`);
 html=html.replace(/(<img src="https:\/\/hits\.sh\/[^>]+" alt="累計閲覧数")>/g,'$1 width="92" height="18" loading="lazy">');
 html=html.replace(/styles\.css\?v=\d+/g,'styles.css?v=8').replace(/site\.js\?v=\d+/g,'site.js?v=10').replace(/stats-app\.js\?v=\d+/g,'stats-app.js?v=12');
 fs.writeFileSync(target,html);
}
console.log(`Injected static SEO metadata into ${pages.length} pages.`);
