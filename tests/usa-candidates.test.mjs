import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import test from 'node:test';
const require = createRequire(import.meta.url);
const ts = require('typescript');
require.extensions['.ts'] = (module, filename) => module._compile(ts.transpileModule(readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText, filename);
const { createGooglePlacesProvider, placeToCandidate, normalizeConditions } = require('../services/overseas/candidates/googlePlaces.ts');
const { candidateTypeFromEvidence, candidateWebsite, deduplicateCandidates } = require('../services/overseas/candidates/normalize.ts');
const place = (extra = {}) => ({id:'fixture-1',displayName:{text:'Example Matcha LLC'},formattedAddress:'1 Test St, Los Angeles, CA, USA',addressComponents:[{types:['country'],shortText:'US'}],websiteUri:'https://example.com/',googleMapsUri:'https://maps.google.com/?cid=1',...extra});
const conditions = {country:'US',keywords:['matcha importer','matcha distributor','Japanese green tea importer'],limit:30};
const response = places => new Response(JSON.stringify({places}), {status:200});

test('USA country comes from API address, not requested search region', () => {
 assert.equal(placeToCandidate(place({addressComponents:[{types:['country'],shortText:'DE'}]}),'matcha importer'),null);
 assert.equal(placeToCandidate(place({addressComponents:[]}), 'matcha importer'),null);
 assert.equal(placeToCandidate(place(), 'matcha importer').country,'US');
});
test('query does not establish matcha, Japanese origin, B2B, or A/B/C', () => {
 const c = placeToCandidate(place({displayName:{text:'Example Trading LLC'}}), 'Japanese matcha importer');
 assert.equal(c.candidateType,'unconfirmed');
 for (const k of ['hsCode','productDescription','tradeDirection','supplierName']) assert.equal(c[k],'');
 for (const k of ['assessment','identityConfirmed','b2bEvidenceIds','origin']) assert.equal(k in c,false);
 assert.ok(c.evidence[0].quote.includes('Example Trading LLC'));
 assert.equal(placeToCandidate(place({displayName:{text:'Example Green Tea'}}),'matcha importer').candidateType,'green_tea_candidate');
});
test('HS codes and generic green tea never establish matcha', () => {
 for (const hs of ['090210','090220','0902.10']) assert.equal(candidateTypeFromEvidence('',hs),'green_tea_candidate');
 for (const text of ['green tea','powdered green tea','Japanese green tea']) assert.equal(candidateTypeFromEvidence(text),'green_tea_candidate');
 assert.equal(candidateTypeFromEvidence('matcha powder','090210'),'matcha_direct');
 assert.equal(candidateTypeFromEvidence('importer'),'unconfirmed');
});
test('official URL remains empty for missing, unsafe, or directory websites', () => {
 for (const u of [undefined,'javascript:alert(1)','https://a:b@example.com','https://www.importyeti.com/company/test','https://facebook.com/example','https://calendly.com/example-tasting','https://www.calendly.com/example-tasting']) assert.equal(candidateWebsite(u),'');
 assert.equal(candidateWebsite('https://calendly.com.example.com/'),'https://calendly.com.example.com/');
 assert.equal(candidateWebsite('https://example.com/wholesale?utm_source=x#top'),'https://example.com/wholesale');
});
test('same source company across keywords merges all discovery evidence', () => {
 const a = placeToCandidate(place(),'matcha importer'); const b = placeToCandidate(place(),'matcha distributor');
 const result = deduplicateCandidates([a,b]);
 assert.equal(result.duplicatesRemoved,1); assert.equal(result.candidates.length,1); assert.equal(result.candidates[0].evidence.length,2);
 assert.equal(a.evidence.length,1);
});
test('domain alone or conflicting legal names/locations never merge', () => {
 const a = placeToCandidate(place(),'matcha importer');
 for (const other of [place({id:'2',displayName:{text:'Other Matcha LLC'}}),place({id:'2',formattedAddress:'2 Different St, NY, USA'}),place({id:'2',websiteUri:'https://other.example/'})]) {
  assert.equal(deduplicateCandidates([a,placeToCandidate(other,'matcha importer')]).candidates.length,2);
 }
 assert.equal(deduplicateCandidates([a,placeToCandidate(place({id:'2'}),'matcha importer')]).duplicatesRemoved,1);
 assert.equal(deduplicateCandidates([a,placeToCandidate(place({id:'2',formattedAddress:''}),'matcha importer')]).duplicatesRemoved,0);
});
test('unsupported country, freeform query, trade filters and excessive limits are rejected', () => {
 for (const value of [null,{...conditions,country:'GB'},{...conditions,keywords:[]},{...conditions,keywords:['other']},{...conditions,keywords:Array(4).fill('matcha importer')},{...conditions,limit:31},{...conditions,hsCodes:['090210']}]) assert.throws(()=>normalizeConditions(value));
 assert.deepEqual(normalizeConditions({...conditions,keywords:['matcha importer','matcha importer']}).keywords,['matcha importer']);
});
test('live provider makes at most 3 search requests and never visits any company website', async () => {
 const calls=[];
 const provider=createGooglePlacesProvider('fixture-key',async (url,options)=>{calls.push({url,options}); return response([place()]);});
 const result=await provider.search(conditions);
 assert.equal(calls.length,3); assert.equal(result.incomplete,false); assert.equal(result.apiRequests,3); assert.equal(result.candidates.length,1); assert.equal(result.duplicatesRemoved,2);
 for (const c of calls) {
  assert.equal(c.url,'https://places.googleapis.com/v1/places:searchText');
  const body=JSON.parse(c.options.body); assert.equal(body.regionCode,'US'); assert.ok(body.textQuery.endsWith('in United States')); assert.equal(body.pageSize,10); assert.equal(body.pageToken,undefined);
  assert.equal(c.options.cache,'no-store');
 }
});
test('missing credentials never produce invented candidates or API calls', async () => {
 const result=await createGooglePlacesProvider('',async()=>assert.fail('must not fetch')).search(conditions);
 assert.equal(result.apiRequests,0); assert.deepEqual(result.candidates,[]); assert.ok(result.warnings.length);
});
test('403/429/500 and timeout stop without retrying', async () => {
 for (const status of [403,429,500,'timeout']) {
  let calls=0; const result=await createGooglePlacesProvider('fixture',async()=>{calls++; if(status==='timeout') throw new Error('timeout'); return new Response('',{status});}).search(conditions);
  assert.equal(calls,1); assert.equal(result.incomplete,true); assert.equal(result.apiRequests,1); assert.equal(result.candidates.length,0); assert.ok(result.warnings.length);
 }
});
test('partial failure retains acquired candidates and reports missing coverage', async () => {
 let calls=0; const result=await createGooglePlacesProvider('fixture',async()=> ++calls===1 ? response([place()]) : new Response('',{status:429})).search(conditions);
 assert.equal(result.candidates.length,1); assert.equal(result.incomplete,true); assert.equal(result.apiRequests,2); assert.ok(result.warnings.length);
});
test('candidate limit stops further queries, with no pagination', async () => {
 let calls=0; const result=await createGooglePlacesProvider('fixture',async()=>{calls++;return response([place()]);}).search({...conditions,limit:1});
 assert.equal(calls,1); assert.equal(result.candidates.length,1);
});

const { countryProfiles, isCountry } = require('../services/overseas/countryProfiles.ts');
const { extract } = require('../services/overseas/extraction.ts');
const euCountries = ['DE','FR','NL','IT','ES','BE','AT','PL','IE','PT','LU','DK','SE','FI','CZ','SK','HU','SI','HR','RO','BG','GR','CY','MT','LT','LV','EE'];
const nonEuCountries = ['US','TH','KR','TW','IN','VN'];
const supportedCountries = [...nonEuCountries, ...euCountries];
test('all EU 27 and existing non-EU countries are configured exactly once, while China remains excluded',()=>{
 assert.equal(euCountries.length,27); assert.equal(new Set(euCountries).size,27);
 assert.ok(euCountries.every(isCountry)); assert.ok(nonEuCountries.every(isCountry)); assert.equal(isCountry('CN'),false);
 assert.deepEqual(new Set(Object.keys(countryProfiles)),new Set(supportedCountries));
});
for (const country of supportedCountries) {
 test(`${country}: selected region, country filtering, limits, deduplication and research handoff`,async()=>{
  const profile=countryProfiles[country]; const calls=[];
  const local=place({addressComponents:[{types:['country'],shortText:country}]});
  const foreign=place({id:'foreign',addressComponents:[{types:['country'],shortText:country==='US'?'DE':'US'}]});
  const provider=createGooglePlacesProvider('fixture',async(url,options)=>{calls.push({url,body:JSON.parse(options.body)});return response([local,foreign,place({id:'missing-country',addressComponents:[]})]);});
  const conditions={country,keywords:profile.candidateSearch.defaults,limit:30};
  const result=await provider.search(conditions);
  assert.equal(calls.length,3); assert.equal(result.candidates.length,1);assert.equal(result.duplicatesRemoved,2);
  assert.equal(result.candidates[0].country,country);
  assert.ok(result.warnings[0].includes(profile.label));
  for(const call of calls){assert.equal(call.body.regionCode,country);assert.ok(call.body.textQuery.endsWith('in '+profile.candidateSearch.placeName));assert.equal(call.body.pageSize,10);}
  for(const keyword of profile.candidateSearch.keywords) assert.doesNotThrow(()=>normalizeConditions({country,keywords:[keyword]}));
  const c=result.candidates[0];
  const researched=extract({id:'handoff',name:c.companyName,country:c.country,website:c.candidateOfficialUrl},[{url:c.candidateOfficialUrl,html:'<h1>Matcha powder</h1><p>We supply matcha powder to wholesale customers.</p>',fetchedAt:new Date().toISOString()}]);
  assert.equal(researched.country,country);assert.equal(researched.assessment,'B');assert.ok(researched.products.every(p=>p.origin==='未確認'));
 });
}
test('country-specific terms cannot be submitted for a different country',()=>{
 assert.throws(()=>normalizeConditions({country:'US',keywords:['Matcha Großhandel']}));
 assert.throws(()=>normalizeConditions({country:'DE',keywords:['grossiste matcha']}));
 assert.throws(()=>normalizeConditions({country:'TH',keywords:['말차 도매']}));
 assert.throws(()=>normalizeConditions({country:'IN',keywords:['matcha bán sỉ']}));
 for(const country of ['CN','GB','toString','__proto__']) assert.equal(isCountry(country),false);
});
test('same Places identifier in different countries is never merged',()=>{
 const rows=supportedCountries.map(country=>placeToCandidate(place({addressComponents:[{types:['country'],shortText:country}]}),'matcha importer',country));
 assert.equal(deduplicateCandidates(rows).candidates.length,supportedCountries.length);
});
test('Netherlands official contact address works without changing US/DE/FR address formats',()=>{
 const input={id:'nl',name:'Example Tea',country:'NL',website:'https://example.com/'};
 const c=extract(input,[{url:'https://example.com/contact',fetchedAt:new Date().toISOString(),html:'<h1>Example Tea</h1><p>Tea Street 1<br>1234 AB Amsterdam<br>Nederland</p><h2>Matcha powder</h2><p>We supply Japanese matcha powder to wholesale customers.</p>'}]);
 assert.equal(c.identityConfirmed,true);assert.ok(c.address.includes('1234 AB'));assert.equal(c.assessment,'A');
});
