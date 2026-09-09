import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import test from 'node:test';
const require = createRequire(import.meta.url);
const ts = require('typescript');
require.extensions['.ts'] = (m, f) => m._compile(ts.transpileModule(readFileSync(f, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText, f);
const cache = require('../services/overseas/pageCache.ts');
const { research } = require('../services/overseas/siteResearch.ts');
const fetchedAt = Date.now();
const html = '<title>Example Tea</title><h1>Example Tea</h1><p>We are a US-based supplier.</p>\n<h2>Japanese Matcha</h2>\n<p>We supply Japanese matcha powder to wholesale customers.</p>';
function fixture(t, responses) {
 const seen = [];
 t.mock.method(cache, 'readPageCache', async url => {
  seen.push(url); assert.ok(responses[url], `Unexpected request: ${url}`);
  return { at: fetchedAt, type: 'text/html', body: '', ...responses[url] };
 });
 return seen;
}
const input = host => ({ id: host, name: 'Example Tea', country: 'US', website: `http://www.${host}/` });
test('candidate HTTP/www robots redirects reach the same evidence as manual HTTPS input', async t => {
 const host = 'redirect-flow.example', http = `http://www.${host}`, www = `https://www.${host}`, https = `https://${host}`;
 fixture(t, {
  [`${http}/robots.txt`]: {status:301,location:`${www}/robots.txt`},
  [`${www}/robots.txt`]: {status:308,location:`${https}/robots.txt`},
  [`${https}/robots.txt`]: {status:200,body:'User-agent: *\nDisallow: /private'},
  [`${http}/`]: {status:301,location:`${www}/`},
  [`${www}/`]: {status:302,location:`${https}/`},
  [`${https}/`]: {status:200,body:html},
 });
 const candidate = await research(input(host));
 const manual = await research({...input(host),website:`${https}/`});
 assert.equal(candidate.assessment,'A',JSON.stringify(candidate.warnings)); assert.equal(candidate.identityConfirmed,true);
 assert.deepEqual(candidate.evidence,manual.evidence);
 assert.equal(candidate.pages[0].url,`${https}/`);
 assert.ok(candidate.products.some(p=>p.origin==='JP')); assert.ok(candidate.b2bEvidenceIds.length);
});
for (const [label, response] of [
 ['disallow',{status:200,body:'User-agent: *\nDisallow: /'}],
 ['403',{status:403}],
 ['loop',{status:301,location:'/robots.txt'}],
 ['external',{status:301,location:'https://other.example/robots.txt'}],
]) test(`robots redirect ${label} stops without fetching or inventing evidence`, async t => {
 const host=`${label}-flow.example`, start=`http://www.${host}/robots.txt`, end=`https://www.${host}/robots.txt`;
 const seen=fixture(t,{[start]:{status:301,location:end},[end]:response});
 const c=await research(input(host));
 assert.equal(c.assessment,null); assert.equal(c.status,'確認待ち'); assert.equal(c.pages.length,0); assert.equal(c.evidence.length,0);
 assert.ok(seen.every(u=>u.endsWith('/robots.txt'))); assert.ok(c.warnings.length);
});
test('page redirect checks destination origin robots before fetching HTML',async t=>{
 const host='origin-flow.example', start=`http://www.${host}`, end=`https://${host}`;
 const seen=fixture(t,{
  [`${start}/robots.txt`]:{status:404},[`${start}/`]:{status:301,location:end+'/'},
  [`${end}/robots.txt`]:{status:200,body:'User-agent: *\nDisallow: /'},
 });
 const c=await research(input(host)); assert.equal(c.pages.length,0); assert.equal(c.assessment,null);
 assert.ok(!seen.includes(end+'/'));
});
test('oversized or aborted HTML settles research as pending instead of hanging', async t => {
 const { EventEmitter } = require('node:events');
 const dns = require('node:dns/promises');
 const https = require('node:https');
 t.mock.method(dns,'lookup',async()=>[{address:'8.8.8.8',family:4}]);
 t.mock.method(cache,'writePageCache',async()=>{});
 t.mock.method(https,'request',(_url,_options,callback)=>{
  const req=new EventEmitter();
  req.destroy=()=>{}; // A closed request need not emit another error.
  req.end=()=>queueMicrotask(()=>{
   const response=new EventEmitter(); response.statusCode=200; response.headers={'content-type':'text/html'};
   response.destroy=()=>response.emit('aborted');
   callback(response); req.emit('close');
   if(String(_url).includes('aborted-flow')) response.emit('aborted');
   else response.emit('data',Buffer.alloc(750_001));
  });
  return req;
 });
 for(const kind of ['oversized','aborted']) {
  const host=`${kind}-flow.example`;
  t.mock.method(cache,'readPageCache',async url=>url.endsWith('/robots.txt')?{at:Date.now(),status:404,type:'text/plain',body:''}:null);
  let timer;
  try {
   const c=await Promise.race([research({...input(host),website:`https://${host}/`}),new Promise((_,reject)=>{timer=setTimeout(()=>reject(new Error('Research did not settle')),1000);})]);
   assert.equal(c.assessment,null); assert.equal(c.status,'確認待ち'); assert.equal(c.pages.length,0);
   assert.ok(c.warnings.some(w=>w.includes(kind==='oversized'?'容量上限':'中断')));
  } finally {clearTimeout(timer);}
 }
});
