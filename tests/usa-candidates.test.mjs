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
 for (const u of [undefined,'javascript:alert(1)','https://a:b@example.com','https://www.importyeti.com/company/test','https://facebook.com/example']) assert.equal(candidateWebsite(u),'');
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
 for (const value of [null,{...conditions,country:'FR'},{...conditions,keywords:[]},{...conditions,keywords:['other']},{...conditions,keywords:Array(4).fill('matcha importer')},{...conditions,limit:31},{...conditions,hsCodes:['090210']}]) assert.throws(()=>normalizeConditions(value));
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
