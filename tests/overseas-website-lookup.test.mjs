import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import test from 'node:test';
const require = createRequire(import.meta.url);
const ts = require('typescript');
require.extensions['.ts'] = (module, filename) => module._compile(ts.transpileModule(readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText, filename);
const { resolveTradeCandidateWebsite } = require('../services/overseas/candidates/websiteLookup.ts');
const { findCompanyWebsiteCandidates } = require('../services/overseas/candidates/googlePlaces.ts');
const { pendingCompany } = require('../services/overseas/types.ts');

const match = (extra={}) => ({url:'https://tea.example.test/',placeName:'Example Tea Company',location:'Portland, OR, USA',nameSimilarity:1,sourceUrl:'https://maps.google.test/tea',...extra});
const company = (extra={}) => ({...pendingCompany({id:'check',name:'Example Tea Company',country:'US',website:'https://tea.example.test/'}),pages:[{url:'https://tea.example.test/',html:'<h1>Example Tea Company</h1>',fetchedAt:'2026-09-09T00:00:00Z'}],...extra});

test('candidate_found and verified are distinct and verified carries existing identity evidence',async()=>{
  const candidate=await resolveTradeCandidateWebsite({companyName:'Example Tea Company'},async()=>[match()],async()=>company());
  assert.equal(candidate.candidateWebsiteStatus,'candidate_found'); assert.equal(candidate.candidateWebsiteUrl,'https://tea.example.test/');
  const verified=await resolveTradeCandidateWebsite({companyName:'Example Tea Company'},async()=>[match()],async()=>company({identityConfirmed:true,evidence:[{id:'e1',field:'identity',url:'https://tea.example.test/contact',quote:'Example Tea Company: Portland, OR, USA',checkedAt:'2026-09-09T00:00:00Z',source:'official_website'}]}));
  assert.equal(verified.candidateWebsiteStatus,'verified'); assert.equal(verified.identityEvidence.text,'Example Tea Company: Portland, OR, USA');
});

test('mismatched supplied URLs and multiple close company matches remain ambiguous',async()=>{
  const mismatch=await resolveTradeCandidateWebsite({companyName:'Duran Trading Co. Inc.',candidateWebsiteUrl:'https://james-herbert.example/'},async()=>[],async()=>company());
  assert.equal(mismatch.candidateWebsiteStatus,'ambiguous');
  const multiple=await resolveTradeCandidateWebsite({companyName:'Example Tea Company'},async()=>[match(),match({url:'https://other.example.test/',nameSimilarity:.94})],async()=>company({identityConfirmed:true}));
  assert.equal(multiple.candidateWebsiteStatus,'ambiguous');
});

test('third-party URLs, no results and failed fetches have separate terminal states',async()=>{
  const thirdParty=await resolveTradeCandidateWebsite({companyName:'Example Tea',candidateWebsiteUrl:'https://facebook.com/example'},async()=>[],async()=>company());
  assert.equal(thirdParty.candidateWebsiteStatus,'not_found'); assert.equal(thirdParty.candidateWebsiteUrl,null);
  const none=await resolveTradeCandidateWebsite({companyName:'Example Tea'},async()=>[],async()=>company());
  assert.equal(none.candidateWebsiteStatus,'not_found');
  const searchFailed=await resolveTradeCandidateWebsite({companyName:'Example Tea'},async()=>{throw new Error('timeout')},async()=>company());
  assert.equal(searchFailed.candidateWebsiteStatus,'fetch_failed');
  const fetchFailed=await resolveTradeCandidateWebsite({companyName:'Example Tea'},async()=>[match()],async()=>company({pages:[],warnings:['HTTP 403']}));
  assert.equal(fetchFailed.candidateWebsiteStatus,'fetch_failed'); assert.equal(fetchFailed.candidateWebsiteUrl,'https://tea.example.test/');
});

test('existing Google Places lookup fixes region, rejects other countries and directory sites, and ranks names',async()=>{
  let requestBody;
  const rows=await findCompanyWebsiteCandidates('fixture',{companyName:'The Tao of Tea',country:'US'},async(_url,options)=>{
    requestBody=JSON.parse(options.body);
    return new Response(JSON.stringify({places:[
      {id:'1',displayName:{text:'The Tao of Tea'},formattedAddress:'Portland, OR, USA',addressComponents:[{types:['country'],shortText:'US'}],websiteUri:'https://tao.example/',googleMapsUri:'https://maps.google.test/1'},
      {id:'2',displayName:{text:'The Tao of Tea'},formattedAddress:'Canada',addressComponents:[{types:['country'],shortText:'CA'}],websiteUri:'https://canada.example/'},
      {id:'3',displayName:{text:'The Tao of Tea'},formattedAddress:'Portland, OR, USA',addressComponents:[{types:['country'],shortText:'US'}],websiteUri:'https://facebook.com/tao'},
    ]}),{status:200,headers:{'content-type':'application/json'}});
  });
  assert.equal(requestBody.regionCode,'US'); assert.match(requestBody.textQuery,/The Tao of Tea United States official website/);
  assert.equal(rows.length,1); assert.equal(rows[0].url,'https://tao.example/'); assert.equal(rows[0].nameSimilarity,1);
});
