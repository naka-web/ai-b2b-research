import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import test from 'node:test';
const require = createRequire(import.meta.url);
const ts = require('typescript');
require.extensions['.ts'] = (module, filename) => module._compile(ts.transpileModule(readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText, filename);
const { createTradeDataProvider, importTradeCsv, parseTradeCsv } = require('../services/overseas/candidates/tradeData.ts');
const { placeToCandidate } = require('../services/overseas/candidates/googlePlaces.ts');
const { candidateTypeFromEvidence, deduplicateCandidates } = require('../services/overseas/candidates/normalize.ts');
const { extract } = require('../services/overseas/extraction.ts');

const headers = ['companyName','country','hsCode','productDescription','source','role','sourceUrl','originCountry','supplierName','importerName','exporterName','shipmentDate','quantity','unit','billOfLading','rawEvidence','officialWebsite'];
const quote = value => `"${String(value ?? '').replaceAll('"','""')}"`;
const csv = rows => [headers.join(','), ...rows.map(row => headers.map(key => quote(row[key])).join(','))].join('\n');
const fixtures = [
  { companyName:'Example Matcha Importer',country:'USA',role:'consignee',source:'trade_test',sourceUrl:'https://data.example.test/a',hsCode:'090220',productDescription:'JAPANESE MATCHA GREEN TEA',originCountry:'Japan',billOfLading:'TEST-A',rawEvidence:'Fixture A only',officialWebsite:'https://matcha.example.test/' },
  { companyName:'Example Green Tea Company',country:'Germany',role:'importer',source:'trade_test',hsCode:'090210',productDescription:'GREEN TEA',originCountry:'Japan',rawEvidence:'Fixture B only',officialWebsite:'https://green.example.test/' },
];

test('manual trade provider imports HS 090210/090220 without any external request',()=>{
  const provider=createTradeDataProvider(); const result=provider.importCsv(csv(fixtures));
  assert.equal(provider.kind,'hs_trade_data'); assert.equal(result.apiRequests,0); assert.equal(result.candidates.length,2);
  assert.deepEqual(result.candidates.map(c=>c.hsCode).sort(),['090210','090220']);
  const raw=parseTradeCsv(csv([fixtures[1]]))[0];
  assert.equal(raw.researchStatus,'未調査'); assert.equal(raw.candidateWebsiteStatus,'candidate_found'); assert.equal(raw.sourceUrl,null); assert.equal(raw.supplierName,null); assert.equal(raw.billOfLading,null);
});

test('matcha descriptions are high signal, while green tea and Japan origin do not confirm matcha',()=>{
  const [matcha,green]=importTradeCsv(csv(fixtures)).candidates;
  assert.equal(matcha.candidateType,'matcha_direct'); assert.equal(green.candidateType,'green_tea_candidate');
  assert.equal(green.tradeEvidence[0].originCountry,'Japan'); assert.notEqual(green.candidateType,'matcha_direct');
});

test('all configured product-description signals remain candidates without treating plain green tea as matcha',()=>{
  for (const description of ['matcha','matcha powder','Japanese matcha']) assert.equal(candidateTypeFromEvidence(description,'090220'),'matcha_direct');
  for (const description of ['green tea powder','powdered green tea','Japanese green tea','green tea']) assert.equal(candidateTypeFromEvidence(description,'090210'),'green_tea_candidate');
});

test('consignee remains consignee and never becomes importer or a confirmed company role',()=>{
  const candidate=importTradeCsv(csv([fixtures[0]])).candidates[0];
  assert.equal(candidate.tradeDirection,'consignee'); assert.equal(candidate.tradeEvidence[0].role,'consignee');
  const researched=extract({id:'trade-a',name:candidate.companyName,country:candidate.country,website:candidate.candidateOfficialUrl,discoveryEvidence:candidate.tradeEvidence},[
    {url:candidate.candidateOfficialUrl,html:'<h1>Example Matcha Importer</h1><p>Green tea products.</p>',fetchedAt:new Date().toISOString()},
  ]);
  assert.equal(researched.products.length,0); assert.deepEqual(researched.companyRoles.map(role=>role.role),['unknown']);
  assert.deepEqual(researched.discoveryEvidence,candidate.tradeEvidence);
});

test('trade evidence survives existing research handoff and retains traceable source fields',()=>{
  const candidate=importTradeCsv(csv([fixtures[0]])).candidates[0];
  const researched=extract({id:'handoff',name:candidate.companyName,country:candidate.country,website:candidate.candidateOfficialUrl,discoveryEvidence:candidate.tradeEvidence},[
    {url:candidate.candidateOfficialUrl,html:'<h1>Example Matcha Importer</h1><p>We sell matcha powder.</p>',fetchedAt:new Date().toISOString()},
  ]);
  const evidence=researched.discoveryEvidence[0];
  assert.equal(evidence.source,'trade_test'); assert.equal(evidence.sourceUrl,'https://data.example.test/a');
  assert.equal(evidence.hsCode,'090220'); assert.equal(evidence.productDescription,'JAPANESE MATCHA GREEN TEA');
  assert.equal(evidence.originCountry,'Japan'); assert.equal(evidence.role,'consignee');
  assert.equal(evidence.billOfLading,'TEST-A'); assert.equal(evidence.rawEvidence,'Fixture A only');
});

test('an obvious same-name and same-domain cross-provider duplicate preserves both sources',()=>{
  const trade=importTradeCsv(csv([fixtures[0]])).candidates[0];
  const places=placeToCandidate({id:'place-a',displayName:{text:'Example Matcha Importer'},formattedAddress:'New York, NY, USA',addressComponents:[{types:['country'],shortText:'US'}],websiteUri:'https://matcha.example.test/',googleMapsUri:'https://maps.google.test/a'},'matcha importer','US');
  const merged=deduplicateCandidates([places,trade]);
  assert.equal(merged.candidates.length,1); assert.equal(merged.duplicatesRemoved,1);
  assert.equal(merged.candidates[0].provider,'google_places'); assert.equal(merged.candidates[0].tradeEvidence.length,1);
  assert.equal(merged.candidates[0].evidence.length,2);
});

test('repeated trade candidates are deduplicated without losing distinct shipment evidence',()=>{
  const rows=[fixtures[0],{...fixtures[0],billOfLading:'TEST-A2',rawEvidence:'Second fixture shipment'}];
  const result=importTradeCsv(csv(rows));
  assert.equal(result.candidates.length,1); assert.equal(result.duplicatesRemoved,1);
  assert.deepEqual(result.candidates[0].tradeEvidence.map(e=>e.billOfLading),['TEST-A','TEST-A2']);
});

test('unsupported HS codes, countries and roles are rejected rather than inferred',()=>{
  assert.throws(()=>importTradeCsv(csv([{...fixtures[0],hsCode:'090230'}])));
  assert.throws(()=>importTradeCsv(csv([{...fixtures[0],country:'China'}])));
  assert.throws(()=>importTradeCsv(csv([{...fixtures[0],role:'final_buyer'}])));
});
