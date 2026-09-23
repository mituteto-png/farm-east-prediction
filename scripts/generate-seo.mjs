import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {SEO_CONFIG, PAGE_SEO, absoluteUrl} from '../seo-config.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const xml = value => String(value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');
const stats = JSON.parse(fs.readFileSync(path.join(root, 'player-stats-data.json'), 'utf8'));
const players = Object.values(stats.teams).flatMap(team => team.players).filter(player => player.recordId);
const lastmod = String(stats.generatedAt || new Date().toISOString()).slice(0, 10);
const staticPages = Object.values(PAGE_SEO).filter(page => page.path !== 'players/').map(page => page.path);
const urls = [
  ...staticPages.map(urlPath => ({loc: absoluteUrl(urlPath), changefreq: urlPath === '' ? 'daily' : 'weekly', priority: urlPath === '' ? '1.0' : '0.8'})),
  ...players.map(player => ({loc: absoluteUrl(`players/?id=${encodeURIComponent(player.recordId)}`), changefreq: 'weekly', priority: '0.6'}))
];
const sitemap = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.map(item => `  <url>\n    <loc>${xml(item.loc)}</loc>\n    <lastmod>${lastmod}</lastmod>\n    <changefreq>${item.changefreq}</changefreq>\n    <priority>${item.priority}</priority>\n  </url>`).join('\n')}\n</urlset>\n`;
fs.writeFileSync(path.join(root, 'sitemap.xml'), sitemap);

const robots = `User-agent: *\nAllow: /\nDisallow: /tests/\nDisallow: /scripts/\nSitemap: ${absoluteUrl('sitemap.xml')}\n`;
fs.writeFileSync(path.join(root, 'robots.txt'), robots);
console.log(`Generated sitemap.xml with ${urls.length} canonical URLs (${players.length} players).`);
