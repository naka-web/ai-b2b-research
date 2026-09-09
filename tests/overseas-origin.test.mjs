import {createRequire} from 'node:module';
import {readFileSync} from 'node:fs';
import assert from 'node:assert/strict';
import test from 'node:test';
const require=createRequire(import.meta.url),ts=require('typescript');
require.extensions['.ts']=(m,f)=>m._compile(ts.transpileModule(readFileSync(f,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText,f);
const {extract}=require('../services/overseas/extraction.ts');
const input={id:'origin',name:'Example Tea',country:'US',website:'https://example.com/'};
const result=text=>extract(input,[{url:input.website,html:`<h1>Matcha powder</h1><p>${text}</p>`,fetchedAt:new Date().toISOString()}]);
const origins=text=>result(text).products.map(p=>p.origin);
test('literal Japanese matcha remains official product-origin evidence including AOI wording',()=>{
 for(const text of ['Premium Japanese Matcha Straight from the source','Japanese matcha','Japanese organic matcha','Japanese green tea matcha','produced in Japan','sourced from Japan','Origin: Japan'])assert.deepEqual(origins(text),['JP'],text);
});
test('non-origin qualifiers and negated production are not Japanese origin',()=>{
 for(const text of ['Japanese style matcha','Japanese-inspired matcha','Japanese quality matcha','Japanese matcha-inspired powder','Inspired by Japanese matcha','Japanese matcha quality','Japanese organic matcha style','Japanese green tea matcha-style','Japanese matcha tradition','Not produced in Japan','Not sourced from Japan']){
  assert.deepEqual(origins(text),['未確認'],text);
  assert.ok(!result(text).evidence.some(e=>e.field==='origin'),text);
 }
});
test('removing a qualifier preserves independent explicit origin evidence and other countries',()=>{
 assert.deepEqual(origins('Inspired by Japanese matcha. Origin: Japan.'),['JP']);
 assert.deepEqual(origins('Japanese matcha-inspired powder. Origin: China.'),['CN']);
 assert.deepEqual(origins('Japanese matcha style. Origin: Vietnam.'),['OTHER']);
});
test('existing conservative treatment of green tea, unqualified from/made and regional names is unchanged',()=>{
 for(const text of ['Japanese green tea','from Japan','made in Japan','Uji','Kyoto','Nishio','Shizuoka','Straight from the source'])assert.deepEqual(origins(text),['未確認'],text);
 const c=result('Origin: Japan, Uji.');assert.equal(c.products[0].origin,'JP');assert.equal(c.products[0].region,'Uji');
});
