import {SEO_CONFIG, PAGE_SEO, absoluteUrl} from './seo-config.js';

function ensureMeta(selector, attributes) {
  let node = document.head.querySelector(selector);
  if (!node) {
    node = document.createElement('meta');
    document.head.append(node);
  }
  Object.entries(attributes).forEach(([key, value]) => node.setAttribute(key, value));
  return node;
}

function setCanonical(url) {
  let link = document.head.querySelector('link[rel="canonical"]');
  if (!link) {
    link = document.createElement('link');
    link.rel = 'canonical';
    document.head.append(link);
  }
  link.href = url;
}

export function setPageSeo({title, description, path, type = 'website', schema, canonical = true}) {
  const url = absoluteUrl(path);
  const image = absoluteUrl(SEO_CONFIG.imagePath);
  document.title = title;
  ensureMeta('meta[name="description"]', {name: 'description', content: description});
  ensureMeta('meta[property="og:title"]', {property: 'og:title', content: title});
  ensureMeta('meta[property="og:description"]', {property: 'og:description', content: description});
  ensureMeta('meta[property="og:type"]', {property: 'og:type', content: type});
  ensureMeta('meta[property="og:url"]', {property: 'og:url', content: url});
  ensureMeta('meta[property="og:image"]', {property: 'og:image', content: image});
  ensureMeta('meta[name="twitter:title"]', {name: 'twitter:title', content: title});
  ensureMeta('meta[name="twitter:description"]', {name: 'twitter:description', content: description});
  ensureMeta('meta[name="twitter:image"]', {name: 'twitter:image', content: image});
  if (canonical) setCanonical(url);
  if (schema) {
    let node = document.getElementById('dynamicStructuredData');
    if (!node) {
      node = document.createElement('script');
      node.id = 'dynamicStructuredData';
      node.type = 'application/ld+json';
      document.head.append(node);
    }
    node.textContent = JSON.stringify(schema);
  }
}

export function applyStaticPageSeo(page) {
  const seo = PAGE_SEO[page];
  if (seo) setPageSeo(seo);
}

export function playerSeo(player, recordId) {
  const team = player.teamFullName || player.team;
  const title = `${player.name}｜2026 ファーム個人成績・経歴｜${SEO_CONFIG.siteName}`;
  const description = `${player.name}（${team}）の2026年ファーム個人成績、プロフィール、経歴、日本選手権出場資格を掲載しています。`;
  const path = `players/?id=${encodeURIComponent(recordId)}`;
  const url = absoluteUrl(path);
  setPageSeo({
    title,
    description,
    path,
    type: 'profile',
    schema: {
      '@context': 'https://schema.org',
      '@graph': [
        {'@type': 'WebPage', '@id': `${url}#webpage`, url, name: title, description, isPartOf: {'@id': `${SEO_CONFIG.baseUrl}#website`}},
        {'@type': 'BreadcrumbList', itemListElement: [
          {'@type': 'ListItem', position: 1, name: 'ホーム', item: SEO_CONFIG.baseUrl},
          {'@type': 'ListItem', position: 2, name: '個人成績', item: absoluteUrl('stats/')},
          {'@type': 'ListItem', position: 3, name: player.name, item: url}
        ]},
        {'@type': 'Person', name: player.name, birthDate: player.birthDate || undefined, affiliation: team ? {'@type': 'SportsTeam', name: team} : undefined, url}
      ]
    }
  });
}
