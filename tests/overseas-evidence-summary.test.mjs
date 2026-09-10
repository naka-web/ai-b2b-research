import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import test from 'node:test';
const require = createRequire(import.meta.url);
const ts = require('typescript');
require.extensions['.ts'] = (module, filename) => module._compile(ts.transpileModule(readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText, filename);
const { collectEvidenceSummaries, generateEvidenceSummaries } = require('../services/overseas/evidenceSummary.ts');
const { extract } = require('../services/overseas/extraction.ts');
const { pendingCompany } = require('../services/overseas/types.ts');

const checkedAt='2026-09-09T00:00:00.000Z';
const evidence=(id,field,quote,url='https://example.test/about')=>({id,field,quote,url,checkedAt,source:'official_website'});
const company=()=>{
 const value=pendingCompany({id:'tao',name:'The Tao of Tea',country:'US',website:'https://taooftea.com/',discoveryEvidence:[{provider:'hs_trade_data',source:'ITC Trade Map',sourceUrl:null,hsCode:'090220',productDescription:'GREEN TEA',originCountry:null,role:'importer',supplierName:null,importerName:null,exporterName:null,shipmentDate:null,quantity:null,unit:null,billOfLading:null,rawEvidence:null}]});
 value.evidence=[evidence('e1','identity','The Tao Of Tea: 3432 SE Belmont St., Portland, OR 97214','https://taooftea.com/contact-us/'),evidence('e2','role:wholesaler','Join Our Wholesale Family','https://taooftea.com/wholesale/'),evidence('e3','b2b','We offer customized programs suited to the individual needs of our wholesale clients.','https://taooftea.com/wholesale/')];
 value.b2bEvidenceIds=['e3']; return value;
};

test('The Tao of Tea keeps original text and gets safe local Japanese B2B and Trade summaries without an API key',async()=>{
 const generated=await generateEvidenceSummaries(company());
 assert.equal(generated.apiRequests,0);
 const b2b=generated.summaries.find(row=>row.category==='b2b');
 assert.equal(b2b.originalText,'We offer customized programs suited to the individual needs of our wholesale clients.');
 assert.equal(b2b.japaneseSummary,'卸売顧客の個別ニーズに合わせたプログラムを提供している。');
 assert.equal(b2b.sourceUrl,'https://taooftea.com/wholesale/'); assert.equal(b2b.summaryStatus,'generated');
 const trade=generated.summaries.find(row=>row.category==='trade_source');
 assert.match(trade.japaneseSummary,/HS090220/); assert.match(trade.japaneseSummary,/抹茶取扱いは未確認/); assert.doesNotMatch(trade.japaneseSummary,/抹茶輸入企業/);
});

test('multiple non-English evidence rows are summarized in one structured API request',async()=>{
 const value=company(); value.evidence=[evidence('fr','b2b','Nous proposons des tarifs de gros aux professionnels.'),evidence('de','product','Wir bieten Matcha-Pulver an.')];
 let calls=0, sent;
 const request=async(_url,options)=>{calls++;sent=JSON.parse(options.body);return new Response(JSON.stringify({output_text:JSON.stringify({summaries:[
  {id:'official:fr',japaneseSummary:'事業者向けに卸売価格を提供している。',sourceLanguage:'fr',confidence:'high'},
  {id:'official:de',japaneseSummary:'抹茶粉末を提供している。',sourceLanguage:'de',confidence:'high'},
 ]})}),{status:200,headers:{'content-type':'application/json'}});};
 const generated=await generateEvidenceSummaries(value,{apiKey:'fixture',request});
 assert.equal(calls,1); assert.equal(generated.apiRequests,1); assert.equal(sent.store,false);
 assert.equal(generated.summaries.find(row=>row.id==='official:fr').japaneseSummary,'事業者向けに卸売価格を提供している。');
 assert.equal(generated.summaries.find(row=>row.id==='official:de').sourceLanguage,'de');
});

test('unsupported roles and protected matcha/origin meanings are rejected from AI summaries',async()=>{
 const value=company(); value.evidence=[evidence('identity','identity','Example Tea is based in Portland.'),evidence('flavor','product','Matcha-flavored cookies inspired by Japan.'),evidence('style','origin','Japanese-style matcha drink.')];
 const request=async()=>new Response(JSON.stringify({output_text:JSON.stringify({summaries:[
  {id:'official:identity',japaneseSummary:'抹茶の輸入企業である。',sourceLanguage:'en',confidence:'high'},
  {id:'official:flavor',japaneseSummary:'抹茶そのものを販売している。',sourceLanguage:'en',confidence:'high'},
  {id:'official:style',japaneseSummary:'日本産抹茶飲料である。',sourceLanguage:'en',confidence:'high'},
 ]})}),{status:200});
 const generated=await generateEvidenceSummaries(value,{apiKey:'fixture',request});
 for(const id of ['official:identity','official:flavor','official:style']) assert.equal(generated.summaries.find(row=>row.id===id).japaneseSummary,null);
});

test('AI failure keeps every original evidence and marks only summary generation failed',async()=>{
 const value=company(); const originals=collectEvidenceSummaries(value).map(row=>row.originalText);
 const generated=await generateEvidenceSummaries(value,{apiKey:'fixture',request:async()=>new Response('',{status:429})});
 assert.deepEqual(generated.summaries.map(row=>row.originalText),originals);
 assert.equal(generated.summaries.find(row=>row.category==='company_identity').japaneseSummary,null);
 assert.equal(generated.summaries.find(row=>row.category==='company_identity').summaryStatus,'fetch_failed');
 assert.equal(generated.summaries.find(row=>row.category==='trade_source').summaryStatus,'generated');
});

test('matcha-flavored and Japanese-style text do not change existing matcha raw-product or Japanese-origin judgments',()=>{
 const result=extract({id:'safe',name:'Example Tea',country:'US',website:'https://example.test/'},[{url:'https://example.test/products',html:'<p>Matcha-flavored cookies.</p><p>Japanese-style matcha drink.</p>',fetchedAt:checkedAt}]);
 assert.equal(result.products.some(product=>product.kind==='抹茶原料・茶商品'),false);
 assert.equal(result.products.some(product=>product.origin==='JP'),false);
});
