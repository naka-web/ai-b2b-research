import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import test from 'node:test';
const require = createRequire(import.meta.url);
const ts = require('typescript');
require.extensions['.ts'] = (module, filename) => module._compile(ts.transpileModule(readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText, filename);
const { extract } = require('../services/overseas/extraction.ts');
const { findDuplicate } = require('../services/overseas/deduplication.ts');
const { robotsAllowed, publicAddress } = require('../services/overseas/siteResearch.ts');
const input = { id: '1', name: 'Example Tea', country: 'DE', website: 'https://example.com/' };
const page = (html, url = 'https://example.com/products') => ({ html, url, fetchedAt: '2026-09-08T00:00:00.000Z' });
const legal = page('<h1>Impressum</h1><p>Example Tea GmbH</p><p>Teestrasse 5</p><p>20457 Hamburg</p><p>Deutschland</p><p>Telefon: +49 40 1234567</p><a href="mailto:office@example.com">Kontakt</a>', 'https://example.com/impressum');
const wholesale = page('<h1>Großhandel</h1><p>Wir bieten japanischen Matcha für den Großhandel und B2B Kunden in Deutschland.</p>');
test('A requires country identity + matcha + own B2B, not supplier name or Japanese origin', () => {
 const c = extract(input, [legal, wholesale, page('<h1>Japanese Matcha</h1><p>Origin: Japan. Pure matcha powder for matcha latte.</p>')]);
 assert.equal(c.assessment, 'A'); assert.equal(c.suppliers.length, 0); assert.equal(c.products.find(p=>p.name==='Japanese Matcha').kind, '抹茶原料・茶商品');
 assert.ok(c.phones.length); assert.ok(c.emails.length);
});
test('product cards preserve Japan and China separately', () => {
 const c = extract(input, [legal, wholesale, page('<div class="product-card"><h2>Japanese Matcha</h2><p>Matcha powder. Origin: Japan, Uji.</p></div><div class="product-card"><h2>China Matcha</h2><p>Matcha powder. Origin: China.</p></div>')]);
 assert.equal(c.assessment, 'A'); assert.ok(c.products.some(p=>p.origin==='JP')); assert.ok(c.products.some(p=>p.origin==='CN'));
 assert.ok(c.products.filter(p=>p.name==='China Matcha').every(p=>p.origin==='CN'));
});
test('style and tradition are not Japanese origin evidence', () => {
 const c = extract(input, [legal, page('<h1>Matcha powder</h1><p>Japanese style, inspired by Japanese tradition. Our matcha powder is sold online.</p>')]);
 assert.equal(c.assessment, 'B'); assert.ok(c.products.every(p=>p.origin==='未確認'));
});
test('no pages is review pending, never C', () => { const c = extract(input, []); assert.equal(c.assessment, null); assert.equal(c.status, '確認待ち'); });
test('processed products only remain C; Chinese matcha remains eligible', () => {
 assert.equal(extract(input, [page('<h1>Matcha cookies</h1><p>Our cookies contain matcha from Japan.</p>')]).assessment, 'C');
 const c = extract(input, [legal, page('<h1>China Matcha</h1><p>Matcha powder. Origin: China.</p>')]); assert.equal(c.assessment, 'B'); assert.ok(c.products.some(p=>p.origin==='CN'));
});
test('France legal address and French wholesale evidence', () => {
 const c = extract({...input, country:'FR'}, [page('<h1>Mentions légales</h1><p>Example Tea SAS</p><p>10 Rue du Thé</p><p>75001 Paris</p><p>France</p>', 'https://example.com/mentions-legales'), page('<h1>Matcha japonais</h1><p>Notre matcha japonais est une poudre de thé. Nous fournissons notre matcha aux professionnels de la restauration.</p>')]); assert.equal(c.assessment, 'A');
});
test('US structured company address and product origin', () => {
 const c = extract({...input, country:'US'}, [page('<script type="application/ld+json">{"@type":"Organization","name":"Example Tea","address":{"streetAddress":"1 Tea St","addressLocality":"Torrance","addressRegion":"CA","postalCode":"90503","addressCountry":"US"}}</script><h1>Example Tea</h1><p>We supply Japanese matcha powder to wholesale customers.</p><script type="application/ld+json">{"@type":"Product","name":"Ceremonial matcha powder","countryOfOrigin":"JP"}</script>')]); assert.equal(c.assessment,'A');
});
test('origin cannot be borrowed from unrelated company history', () => {
 const c = extract(input, [legal, page('<h1>About</h1><p>Our teaware is made in Japan.</p><h2>Matcha powder</h2><p>Wholesale matcha powder for beverages.</p>')]); assert.ok(c.products.every(p=>p.origin==='未確認')); assert.notEqual(c.assessment,'A');
});
test('group name alone never creates a supplier; named manufacturer is not direct trade', () => {
 const c = extract(input, [page('<h1>Japanese Matcha</h1><p>We import direct from Japan. Our group includes Example Japan.</p>')]); assert.equal(c.suppliers.length,0);
 const d = extract(input, [page('<h1>Japanese Matcha</h1><p>Japanese matcha powder. Manufacturer: Example Maker (Japan).</p>')]); assert.equal(d.suppliers[0].relationship,'商品掲載メーカー');
});
test('duplicates reuse a domain without merging two legal entities', () => { assert.ok(findDuplicate([input], {...input,id:'2',name:'Other brand',website:'https://www.example.com/shop'})); assert.equal(findDuplicate([input], {...input,name:'Other',website:'https://elsewhere.com'}),undefined); });
test('robots most specific Allow wins and private/nonpublic IPs are rejected', () => {
 assert.equal(robotsAllowed('User-agent: *\nDisallow: /private\nAllow: /private/public', '/private/secret'),false);
 assert.equal(robotsAllowed('User-agent: *\nDisallow: /private\nAllow: /private/public', '/private/public'),true);
 for (const ip of ['127.0.0.1','10.0.0.1','169.254.169.254','::1','::ffff:127.0.0.1','fc00::1','100.64.0.1','2001:db8::1']) assert.equal(publicAddress(ip),false,ip);
 assert.equal(publicAddress('8.8.8.8'),true);
});

for (const country of ['US', 'FR', 'DE']) {
 test(`${country}: A/B/C, mixed origins, style, and culinary powder`, () => {
  const company = {...input, country};
  const identity = page(`<h1>Example Tea</h1><script type="application/ld+json">${JSON.stringify({'@type':'Organization',name:'Example Tea',address:{streetAddress:'1 Tea Street',addressLocality:'Example City',addressCountry:country}})}</script>`);
  const supply = page('<h1>Wholesale</h1><p>We supply matcha powder to wholesale and foodservice customers.</p>');
  for (const title of ['Culinary matcha powder', 'Matcha powder for latte', 'Matcha powder for baking']) {
   const c = extract(company, [identity, supply, page(`<h1>${title}</h1><p>Origin: Japan. Pure matcha powder for foodservice.</p>`)]);
   assert.equal(c.assessment, 'A', title);
   assert.equal(c.products.find(p => p.name === title).kind, '抹茶原料・茶商品');
  }
  for (const style of ['Japanese style', 'Japanese-style', 'Japanese matcha style']) {
   const c = extract(company, [identity, supply, page(`<h1>Matcha powder</h1><p>${style}. Pure matcha powder for beverages.</p>`)]);
   assert.equal(c.assessment, 'A', style);
   assert.ok(c.products.every(p => p.origin === '未確認'), style);
  }
  const mixed = extract(company, [identity, supply, page('<div class="product-card"><h2>Matcha Japan</h2><p>Pure matcha powder. Origin: Japan.</p></div><div class="product-card"><h2>Matcha China</h2><p>Pure matcha powder. Origin: China.</p></div>')]);
  assert.equal(mixed.assessment, 'A');
  assert.equal(mixed.products.find(p => p.name === 'Matcha China').origin, 'CN');
  for (const p of mixed.products) for (const id of p.evidenceIds) assert.ok(mixed.evidence.some(e => e.id === id && e.url && e.quote && e.checkedAt));
  assert.equal(extract(company, [identity, page('<h1>Matcha latte mix</h1><p>Sweetened Japanese matcha latte mix with milk.</p>')]).assessment, 'C');
  assert.equal(extract(company, [identity, page('<h1>Matcha powder</h1><p>Origin: China.</p>')]).assessment, 'B');
  assert.equal(extract(company, []).assessment, null);
 });
}

test('failed product page must not leave C after a processed product was fetched', async t => {
 const pageCache = require('../services/overseas/pageCache.ts');
 t.mock.method(pageCache, 'readPageCache', async url => ({at:Date.now(),status:url.endsWith('/missing') ? 404 : 200,type:'text/html',body:url.endsWith('/robots.txt') ? '' : '<h1>Matcha cookies</h1><p>Cookies with Japanese matcha.</p><a href="/missing">Matcha powder</a>'}));
 const c = await require('../services/overseas/siteResearch.ts').research({...input,website:'https://partial-failure.example/'});
 assert.equal(c.status, '確認待ち');
 assert.equal(c.assessment, null);
 assert.ok(c.warnings.length);
 assert.equal(c.requests, 0);
});
