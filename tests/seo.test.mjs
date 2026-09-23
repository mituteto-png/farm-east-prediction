import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {SEO_CONFIG,PAGE_SEO,absoluteUrl} from '../seo-config.js';

const files=['index.html','prediction.html','simulator.html','farmchamp.html','power-ranking.html','about.html','stats/index.html','stats/titles/index.html','stats/prospects/index.html','stats/compare/index.html'];
const load=file=>readFile(new URL(`../${file}`,import.meta.url),'utf8');
const matches=(html,re)=>[...html.matchAll(re)];

test('major pages have unique titles, descriptions, canonicals and one H1',async()=>{
 const rows=await Promise.all(files.map(async file=>[file,await load(file)]));
 const titles=[];
 for(const [file,html] of rows){
  const title=html.match(/<title>([^<]+)<\/title>/)?.[1];
  assert.ok(title,`${file}: title`);titles.push(title);
  assert.equal(matches(html,/<meta name="description" content="[^"]+">/g).length,1,`${file}: description`);
  assert.equal(matches(html,/<link rel="canonical" href="https:\/\/[^"]+">/g).length,1,`${file}: canonical`);
  assert.equal(matches(html,/<h1>[\s\S]*?<\/h1>/g).length,1,`${file}: one H1`);
  assert.match(html,/property="og:title"/);assert.match(html,/name="twitter:card" content="summary_large_image"/);
  const json=html.match(/<script type="application\/ld\+json" id="pageStructuredData">([\s\S]*?)<\/script>/)?.[1];
  assert.doesNotThrow(()=>JSON.parse(json),`${file}: valid JSON-LD`);
 }
 assert.equal(new Set(titles).size,titles.length,'titles must be unique');
});

test('player template has dynamic social metadata without a conflicting static canonical',async()=>{
 const html=await load('players/index.html');
 assert.match(html,/2026 NPBファーム選手詳細/);
 assert.match(html,/property="og:title"/);
 assert.doesNotMatch(html,/rel="canonical"/);
 assert.match(await load('stats-app.js'),/playerSeo\(/);
});

test('sitemap lists all major pages and every unique player URL',async()=>{
 const sitemap=await load('sitemap.xml');
 const stats=JSON.parse(await load('player-stats-data.json'));
 const ids=Object.values(stats.teams).flatMap(team=>team.players.map(player=>player.recordId));
 assert.equal(new Set(ids).size,ids.length);
 for(const page of Object.values(PAGE_SEO).filter(page=>page.path!=='players/'))assert.ok(sitemap.includes(absoluteUrl(page.path)));
 for(const id of ids)assert.ok(sitemap.includes(`players/?id=${encodeURIComponent(id)}`),id);
 assert.equal(matches(sitemap,/<url>/g).length,ids.length+10);
});

test('robots exposes sitemap and 404 is noindex with useful links',async()=>{
 const robots=await load('robots.txt'),notFound=await load('404.html');
 assert.ok(robots.includes(`Sitemap: ${absoluteUrl('sitemap.xml')}`));
 assert.match(notFound,/name="robots" content="noindex,follow"/);
 assert.match(notFound,/href="stats\/"/);
 assert.equal(SEO_CONFIG.baseUrl,'https://mituteto-png.github.io/farm-east-prediction/');
});
