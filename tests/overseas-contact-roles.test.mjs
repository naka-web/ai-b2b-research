import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import test from 'node:test';
const require = createRequire(import.meta.url), ts = require('typescript');
require.extensions['.ts'] = (m, f) => m._compile(ts.transpileModule(readFileSync(f, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText, f);
const { extract } = require('../services/overseas/extraction.ts');
const { research } = require('../services/overseas/siteResearch.ts');
const { companyRoles } = require('../services/overseas/companyRoles.ts');
const cache = require('../services/overseas/pageCache.ts');
const input = { id:'contact-roles',name:'Example Tea',country:'US',website:'https://example.com/' };
const page = (html, path='/') => ({ url:new URL(path,input.website).href,html,fetchedAt:'2026-09-09T00:00:00Z' });
const form = '<form><label>Email<input type="email" name="email"></label><textarea name="message"></textarea><button type="submit">Send message</button></form>';
const roles = (text, path='/about') => companyRoles(input,page(`<h1>Example Tea</h1><p>${text}</p>`,path));
test('all contact statuses distinguish confirmed forms, email, missing HTML and no contact',()=>{
 for (const title of ['Contact','Contact Us','Inquiry','Enquiry','Get in touch','Wholesale inquiry','Business inquiry','Kontakt','Nous contacter','Contact opnemen','お問い合わせ']) {
  const c = extract(input,[page(`<h1>${title}</h1>${form}`,'/reach-us')]);
  assert.equal(c.contactFormUrl,'https://example.com/reach-us',title); assert.equal(c.contactStatus,'form_found');assert.equal(c.email,null);
  assert.ok(c.evidence.some(e=>e.field==='contactForm' && e.url===c.contactFormUrl));
 }
 const email='<a href="mailto:sales@example.com">Email</a>';
 const both=extract(input,[page(`<h1>Contact</h1>${email}${form}`)]);
 assert.equal(both.contactStatus,'email_and_form_found');assert.equal(both.email,'sales@example.com');assert.deepEqual(both.emails,['sales@example.com']);
 assert.equal(extract(input,[page(email)]).contactStatus,'email_found');
 assert.equal(extract(input,[page('<h1>Tea</h1>')]).contactStatus,'not_found');
 assert.equal(extract(input,[]).contactStatus,'fetch_failed');
});
test('links, newsletters, search, hidden forms, missing controls and booking embeds are not forms',()=>{
 for(const html of [
  '<a href="/contact">Contact us</a>', '<h1>Contact</h1><form><input type="email"><button>Subscribe</button></form>',
  '<h1>Contact</h1><form><input name="q"><button>Search</button></form>',
  '<h1>Contact</h1><form><input type="email"><textarea></textarea></form>',
  '<h1>Contact</h1><form><textarea></textarea><button>Submit</button></form>',
  `<h1>Contact</h1><div hidden>${form}</div>`,
  '<h1>Contact</h1><iframe src="https://calendly.com/example"></iframe>',
  `<h1>Contact</h1>${form.replace('<form>','<form action="https://calendly.com/example">')}`,
  `<h1>Contact</h1>${form.replace('<form>','<form action="https://facebook.com/example">')}`,
 ]) assert.equal(extract(input,[page(html)]).contactFormUrl,null,html);
 for(const url of ['https://calendly.com/contact','https://facebook.com/contact','https://other.example/contact']) assert.equal(extract(input,[page(`<h1>Contact</h1>${form}`,url)]).contactFormUrl,null,url);
});
test('multiple own roles have short official evidence, without confusing audiences',()=>{
 const result=roles('We import matcha from Japan. We are the official distributor of Example Brand. We are a wholesale supplier of tea to cafes and food manufacturers.');
 assert.deepEqual(result.map(r=>r.role).sort(),['distributor','importer','supplier','wholesaler']);
 for(const r of result) { assert.equal(r.evidenceUrl,'https://example.com/about');assert.ok(r.evidenceText.length<=420);assert.ok(r.evidenceText.length>10); }
 for(const [text,expected] of [
  ['We operate an online shop for matcha.','ecommerce'],['We are a tea retailer.','retailer'],['Our cafe offers matcha drinks.','cafe_or_shop'],['We run a café.','cafe_or_shop'],['We manufacture matcha powder.','manufacturer'],
  ['With 100 years of experience, we provide wholesale matcha to companies.','wholesaler'],
  ['Wir sind ein Importeur von Matcha.','importer'],['Nous sommes un distributeur de thé.','distributor'],['Wij zijn een groothandel in matcha.','wholesaler'],
  ['We supply matcha to horeca and business customers.','wholesaler'],
  ['We specialize in sourcing and distributing multiple grades of matcha for commercial use.','distributor'],
 ]) assert.ok(roles(text).some(r=>r.role===expected),text);
});
test('weak words, third parties, negations, articles and external pages cannot establish import/distribution',()=>{
 for(const text of [
  'Japanese tea. Premium matcha. Shipping worldwide.', 'We sell Japanese tea and premium matcha.',
  'Our customers are distributors and importers.', 'Our wholesale customers are importers.', 'Our tea supplier imports matcha.', 'Our tea is sold by distributors.', 'Our supplier is an importer.', 'Other Tea is an official distributor.',
  'We work with a manufacturer and distributor.', 'We are looking for an importer.', 'We are not a distributor.',
  'We supply importers and distributors with matcha.', 'We are a supplier to importers and distributors.',
  'From beverage manufacturers to food brands, our matcha is trusted.We offer a range of matcha grades.',
  'We import no matcha.', 'We were formerly an importer.',
  'Example Tea is a wholesale supplier of matcha, serving cafés, beverage brands, restaurants, and food manufacturers.',
 ]) assert.ok(!roles(text).some(r=>['importer','distributor','manufacturer'].includes(r.role)),text);
 assert.deepEqual(roles('Example Tea is a wholesale supplier of matcha, serving cafés, beverage brands, restaurants, and food manufacturers.').map(r=>r.role).sort(),['supplier','wholesaler']);
 assert.ok(companyRoles({...input,name:'Example Tea Company'},page('<p>Example is a manufacturer of matcha.</p>')).some(r=>r.role==='manufacturer'));
 assert.deepEqual(roles('We are an importer.','/blog/import-guide'),[]);
 assert.deepEqual(roles('We are an importer.','https://directory.example/company'),[]);
 assert.deepEqual(companyRoles(input,page('<blockquote><p>We are an importer.</p></blockquote>')),[]);
 const c=extract(input,[page('<h1>Matcha powder</h1><p>Premium matcha. Shipping worldwide.</p>')]);
 assert.deepEqual(c.companyRoles,[{role:'unknown',evidenceUrl:null,evidenceText:null}]);
});
test('unknown and non-Japanese origin with no named supplier never exclude confirmed B2B matcha',()=>{
 for(const origin of ['', 'Origin: China.', 'Origin: Vietnam.']) {
  const c=extract(input,[page(`<h1>Example Tea</h1><p>We are a US-based company.</p><h2>Matcha powder</h2><p>We supply matcha powder to wholesale customers. ${origin}</p>`)]);
  assert.equal(c.assessment,'A');assert.equal(c.suppliers.length,0);assert.ok(c.products.length);assert.ok(!c.reasons.join(' ').includes('不足'));
 }
});
test('crawler prioritizes inquiry even when email is known and records form and role evidence',async t=>{
 const host='https://contact-priority.example'; const seen=[];
 const responses={
  '/robots.txt': {status:404,body:''},
  '/': {status:200,body:'<h1>Example Tea</h1><p>We are a US-based company.</p><h2>Japanese Matcha</h2><p>We supply Japanese matcha powder to wholesale customers.</p><a href="mailto:sales@contact-priority.example">Email</a><a href="/terms">Terms</a><a href="/reach">Wholesale inquiry</a><a href="/about">About us</a>'},
  '/reach': {status:200,body:`<h1>Business enquiry</h1>${form}`},
  '/terms': {status:200,body:'<h1>Terms</h1>'},
  '/about': {status:200,body:'<h1>About Example Tea</h1><p>We are an importer and official distributor of matcha.</p>'},
 };
 t.mock.method(cache,'readPageCache',async url=>{seen.push(url);const r=responses[new URL(url).pathname];assert.ok(r,url);return {at:Date.now(),type:'text/html',...r};});
 const c=await research({...input,website:host+'/'});
 assert.equal(seen[2],host+'/reach');assert.equal(c.contactStatus,'email_and_form_found');assert.equal(c.contactFormUrl,host+'/reach');
 assert.ok(c.companyRoles.some(r=>r.role==='importer' && r.evidenceUrl===host+'/about'));
 assert.equal(c.assessment,'A');assert.ok(c.pages.length<=6);assert.ok(c.requests<=8);
});
test('failed contact fetch is fetch_failed, but acquired email or form remains usable',async t=>{
 for(const email of ['', '<a href="mailto:sales@contact-failure.example">Email</a>']) {
  t.mock.method(cache,'readPageCache',async url=>({at:Date.now(),status:url.endsWith('/reach')?404:200,type:'text/html',body:url.endsWith('/robots.txt')?'':`<h1>Example Tea</h1>${email}<a href="/reach">Get in touch</a>`}));
  const c=await research({...input,website:'https://contact-failure.example/'});
  assert.equal(c.contactStatus,email?'email_found':'fetch_failed');assert.equal(c.contactFormUrl,null);assert.ok(c.warnings.length);
 }
});
