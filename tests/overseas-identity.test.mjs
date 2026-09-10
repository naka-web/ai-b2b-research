import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import test from 'node:test';
const require = createRequire(import.meta.url);
const ts = require('typescript');
require.extensions['.ts'] = (module, filename) => module._compile(ts.transpileModule(readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText, filename);
const { extract } = require('../services/overseas/extraction.ts');
const input = {id:'identity-test',name:'Matchia.us | Matcha Wholesale',country:'US',website:'https://matchia.us/'};
const page = (html, url=input.website) => ({html,url,fetchedAt:'2026-09-09T00:00:00.000Z'});
const product = page('<h1>Japanese Matcha</h1><p>Pure matcha powder. Origin: Japan. We supply our matcha powder to wholesale customers.</p>', 'https://matchia.us/products/matcha');
const branded = text => `<title>Matchia.us | Wholesale Matcha</title><h1>Matchia</h1><p>${text}</p>`;

test('Matchia: official self description completes identity without inventing legal name or street address',()=>{
 const statement='Matchia is a U.S.-based wholesale supplier of premium matcha, serving cafés, beverage brands, restaurants, and food manufacturers.';
 const c=extract(input,[page(branded(statement)),product]);
 assert.equal(c.assessment,'A'); assert.equal(c.identityConfirmed,true); assert.equal(c.legalName,null); assert.equal(c.address,null); assert.equal(c.suppliers.length,0);
 const e=c.evidence.find(e=>e.field==='identity'); assert.equal(e.quote,statement); assert.equal(e.url,input.website); assert.equal(e.source,'official_website'); assert.equal(e.checkedAt,'2026-09-09T00:00:00.000Z');
});
test('explicit first-person target country statements on official company pages',()=>{
 for(const text of ['Matchia is U.S.-based.','We are US-based.','We are based in the United States.','We are a United States company.','We are a US-based supplier.','We are a US-based wholesaler.','Our company is headquartered in Los Angeles, United States.','We are located in the United States.','We serve from the United States.','At Matchia, we are based in the United States.']) {
  for(const path of ['/','/pages/about','/pages/contact','/policies/terms','/policies/privacy']) {
   assert.equal(extract(input,[page(branded(text),'https://matchia.us'+path),product]).assessment,'A',`${path}: ${text}`);
  }
 }
});
test('Germany/France self descriptions apply only to the matching existing country',()=>{
 for(const [country,label] of [['DE','Germany'],['FR','France']]) {
  const p=page(branded(`Matchia is a ${label}-based wholesaler.`));
  assert.equal(extract({...input,country},[p,product]).assessment,'A');
  assert.equal(extract(input,[p,product]).identityConfirmed,false);
 }
});
test('official footer can contain a strong explicit self description',()=>{
 const c=extract(input,[page('<title>Matchia</title><footer><p>Matchia is a US-based supplier.</p></footer>'),product]); assert.equal(c.assessment,'A');
});
test('shipping destinations, customers, suppliers and third-party quotations are not own location',()=>{
 for(const html of [
  branded('We supply matcha to U.S.-based wholesale suppliers.'),
  branded('Our customers are US-based wholesalers.'),
  branded('Our supplier is based in the United States.'),
  branded('Other Tea is a US-based supplier.'),
  branded('We work with a US-based supplier.'),
  branded('We are a supplier serving the United States.'),
  branded('We ship to the United States.'),
  '<title>Matchia</title><blockquote><p>We are a US-based supplier.</p></blockquote>',
  '<title>Matchia</title><div class="testimonial"><p>Matchia is a US-based supplier.</p></div>',
 ]) assert.equal(extract(input,[page(html),product]).identityConfirmed,false,html);
});
test('negated, historic and conflicting location descriptions remain unconfirmed',()=>{
 for(const text of ['Matchia is not a US-based supplier.','We are not based in the United States.','Matchia was formerly a US-based supplier.','We are no longer based in the United States.']) assert.equal(extract(input,[page(branded(text)),product]).identityConfirmed,false,text);
 const c=extract(input,[page(branded('Matchia is a US-based supplier.')),page(branded('We are based in Germany.'),'https://matchia.us/pages/about'),product]);
 assert.equal(c.identityConfirmed,false); assert.equal(c.assessment,'B'); assert.ok(c.warnings.length);
});
test('weak signals alone, search snippets, unrelated company names and articles do not establish identity',()=>{
 for(const html of [branded('Call +1 555 123 4567. Prices in USD.'),branded('California / Los Angeles / USA'),branded('Our green tea is sourced from Japan.'),'<title>Other Company</title><p>We are a US-based supplier.</p>']) assert.equal(extract(input,[page(html),product]).identityConfirmed,false,html);
 assert.equal(extract(input,[page(branded('Matchia is a US-based supplier.'),'https://directory.example/company/matchia'),product]).identityConfirmed,false);
 assert.equal(extract(input,[page(branded('Matchia is a US-based supplier.'),'https://matchia.us/blogs/news/industry'),product]).identityConfirmed,false);
 assert.equal(extract({...input,name:'Other company'},[page(branded('Matchia is a US-based supplier.')),product]).identityConfirmed,false);
});
test('identity alone does not bypass matcha product or own B2B requirements',()=>{
 const identity=page(branded('Matchia is a US-based company.'));
 assert.notEqual(extract(input,[identity]).assessment,'A');
 const c=extract(input,[identity,page('<h1>Japanese Matcha</h1><p>Origin: Japan. Pure matcha powder.</p>')]); assert.equal(c.assessment,'B'); assert.ok(c.reasons.some(r=>r.includes('B2B')));
});
test('WAKABA full official German address and Japanese wholesale remain A',()=>{
 const c=extract({id:'wakaba',name:'WAKABA Matcha & Tea GmbH',country:'DE',website:'https://matcha-wakaba.com/'},[
  page('<h1>Kontaktinformationen</h1><p>WAKABA Matcha & Tea GmbH<br>Hansaallee 113<br>40549 Düsseldorf<br>Deutschland</p>','https://matcha-wakaba.com/policies/contact-information'),
  page('<h1>Japanese Matcha</h1><p>Origin: Japan. We supply Japanese matcha powder to wholesale customers.</p>','https://matcha-wakaba.com/pages/wholesale-1'),
 ]); assert.equal(c.assessment,'A'); assert.equal(c.identityConfirmed,true); assert.ok(c.address.includes('Düsseldorf'));
});
test('AIYA 403: no official body means pending, never A or C',async t=>{
 const cache=require('../services/overseas/pageCache.ts');
 t.mock.method(cache,'readPageCache',async url=>({at:Date.now(),status:url.endsWith('/robots.txt')?404:403,type:'text/html',body:'<p>AIYA America is a US-based supplier.</p>'}));
 const c=await require('../services/overseas/siteResearch.ts').research({id:'aiya',name:'AIYA America',country:'US',website:'https://www.aiya-america.com/'});
 assert.equal(c.status,'確認待ち'); assert.equal(c.assessment,null); assert.equal(c.identityConfirmed,false); assert.equal(c.pages.length,0); assert.ok(c.warnings.some(w=>w.includes('403')));
});
