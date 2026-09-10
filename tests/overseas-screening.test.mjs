import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import test from 'node:test';
const require = createRequire(import.meta.url);
const ts = require('typescript');
require.extensions['.ts'] = (module, filename) => module._compile(ts.transpileModule(readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText, filename);
const { applyScreening, screeningStatusFromCompany, screeningStatusFromWebsite, screenTradeCandidateBatch } = require('../services/overseas/candidates/screening.ts');
const { pendingCompany } = require('../services/overseas/types.ts');

const now = '2026-09-09T00:00:00.000Z';
const tradeEvidence = [{ provider:'hs_trade_data', source:'ITC Trade Map', sourceUrl:'https://trade.example.test/', hsCode:'090220', productDescription:'GREEN TEA', originCountry:null, role:'importer', supplierName:null, importerName:null, exporterName:null, shipmentDate:null, quantity:null, unit:null, billOfLading:'TEST-BL', rawEvidence:'Fixture only' }];
const page = html => ({ url:'https://example.test/', html, fetchedAt:now });
const company = (extra={}) => ({ ...pendingCompany({ id:'trade:1', name:'Example Tea', country:'US', website:'https://example.test/', discoveryEvidence:tradeEvidence }), identityConfirmed:true, pages:[page('<h1>Example Tea</h1>')], ...extra });
const product = kind => ({ id:'p1', name:'Tea product', url:'https://example.test/product', kind, origin:'未確認', region:null, processing:null, evidenceIds:['e1'] });
const candidate = (id, status='verified') => ({ id, companyName:`Company ${id}`, country:'US', location:'', candidateOfficialUrl:'https://example.test/', candidateWebsiteStatus:status, candidateWebsiteReason:'verified fixture', candidateWebsiteIdentityEvidence:null, candidateWebsiteMatchaStatus:'unconfirmed', provider:'hs_trade_data', sourceType:'trade_manual', sourceName:'ITC Trade Map', sourceUrl:'https://trade.example.test/', matchedKeyword:'GREEN TEA', hsCode:'090220', productDescription:'GREEN TEA', tradeDirection:'importer', supplierName:'', evidence:[], candidateType:'green_tea_candidate', attributions:[], tradeEvidence });

test('screening derives every result from official-site outcomes, never HS or GREEN TEA alone',()=>{
  assert.equal(screeningStatusFromCompany(company({ products:[product('抹茶原料・茶商品')] })),'matcha_confirmed');
  assert.equal(screeningStatusFromCompany(company({ products:[product('加工品')] })),'matcha_related_processed_only');
  assert.equal(screeningStatusFromCompany(company({ pages:[page('<p>Premium green tea leaves.</p>')] })),'green_tea_only');
  assert.equal(screeningStatusFromCompany(company()),'no_matcha_found');
  assert.equal(screeningStatusFromCompany(company({ warnings:['一部ページ取得失敗'] })),'ambiguous');
  assert.equal(screeningStatusFromCompany(company({ pages:[] })),'fetch_failed');
  const hsOnly=applyScreening(company()); assert.equal(hsOnly.screeningStatus,'no_matcha_found'); assert.equal(hsOnly.isQualifiedLead,false);
  const raw=applyScreening(company({ products:[product('抹茶原料・茶商品')] })); assert.equal(raw.isQualifiedLead,true);
});

test('website discovery terminal states remain distinct',()=>{
  assert.equal(screeningStatusFromWebsite('ambiguous'),'ambiguous'); assert.equal(screeningStatusFromWebsite('candidate_found'),'ambiguous');
  assert.equal(screeningStatusFromWebsite('not_found'),'not_found'); assert.equal(screeningStatusFromWebsite('fetch_failed'),'fetch_failed');
  assert.equal(screeningStatusFromWebsite('not_searched'),'pending');
});

test('batch researches verified candidates only, continues after one failure, and preserves evidence for saving',async()=>{
  const rows=[candidate('raw'),candidate('ambiguous','ambiguous'),candidate('failed')]; const researched=[]; const saved=[];
  const result=await screenTradeCandidateBatch(rows,{existing:new Map(),lookup:async value=>value,research:async value=>{
    researched.push(value.id); if(value.id==='failed') throw new Error('fixture timeout');
    const valueCompany=company({id:value.id,products:[product('抹茶原料・茶商品')],evidence:[{id:'e1',field:'product',url:'https://example.test/product',quote:'Raw matcha powder',checkedAt:now,source:'official_website'}],evidenceSummaries:[{id:'official:e1',category:'matcha_product',originalText:'Raw matcha powder',japaneseSummary:'抹茶粉末を提供している。',sourceUrl:'https://example.test/product',sourceLanguage:'en',confidence:'high',status:'confirmed',summaryStatus:'generated'}]});
    return valueCompany;
  },save:async outcome=>saved.push(outcome),now:()=>now});
  assert.deepEqual(researched,['raw','failed']); assert.equal(result.processed,3); assert.equal(result.counts.matcha_confirmed,1); assert.equal(result.counts.ambiguous,1); assert.equal(result.counts.fetch_failed,1);
  assert.equal(saved.find(row=>row.record.candidateId==='raw').record.isQualifiedLead,true);
  assert.deepEqual(saved.find(row=>row.record.candidateId==='raw').record.tradeEvidence,tradeEvidence);
  assert.equal(saved.find(row=>row.record.candidateId==='raw').company.evidenceSummaries[0].japaneseSummary,'抹茶粉末を提供している。');
  assert.equal(saved.find(row=>row.record.candidateId==='ambiguous').company,null);
});

test('batch processes at most ten with at most two concurrent workers and skips final records',async()=>{
  const rows=Array.from({length:13},(_,index)=>candidate(String(index),'not_searched')); let active=0,maxActive=0; const saved=[];
  const result=await screenTradeCandidateBatch(rows,{existing:new Map([['0',{screeningStatus:'not_found'}]]),lookup:async value=>{active++;maxActive=Math.max(maxActive,active);await new Promise(resolve=>setTimeout(resolve,2));active--;return {...value,candidateWebsiteStatus:'not_found'};},research:async()=>{throw new Error('must not research');},save:async outcome=>saved.push(outcome)});
  assert.equal(result.processed,10); assert.equal(saved.length,10); assert.equal(maxActive,2); assert.ok(!saved.some(row=>row.record.candidateId==='0'));
});
