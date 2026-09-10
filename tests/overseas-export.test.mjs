import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import test from 'node:test';
const require = createRequire(import.meta.url);
const ts = require('typescript');
require.extensions['.ts'] = (module, filename) => module._compile(ts.transpileModule(readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText, filename);
const XLSX = require('xlsx');
const { strFromU8, unzipSync } = require('fflate');
const { pendingCompany } = require('../services/overseas/types.ts');
const { buildExportPackage, createDeliveryCsv, deduplicateForExport, exportFilename, filterCompaniesForExport } = require('../services/overseas/exportData.ts');
const { createDeliveryWorkbook } = require('../services/overseas/exportWorkbook.ts');

const trade = { provider:'hs_trade_data',source:'ITC Trade Map',sourceUrl:'https://trade.example.test/record',hsCode:'090220',productDescription:'JAPANESE MATCHA GREEN TEA',originCountry:'Japan',role:'consignee',supplierName:'Uji Test Supplier',importerName:null,exporterName:'Kyoto Test Exporter',shipmentDate:'2026-08-30',quantity:'25',unit:'kg',billOfLading:'TEST-BL',rawEvidence:'Shipment description: JAPANESE MATCHA GREEN TEA' };
function company(id, name, country='US', website=`https://${id}.example.test/`) {
  return pendingCompany({ id, name, country, website });
}
function confirmed(id='a', name='The Tao of Tea', country='US') {
  const value=company(id,name,country); const checkedAt='2026-09-10T03:04:05.000Z';
  return { ...value, legalName:name, address:`${name} address`, identityConfirmed:true, emails:[`hello@${id}.example.test`], email:`hello@${id}.example.test`, phones:['+1 555 0100'], contactFormUrl:`https://${id}.example.test/contact`, contactStatus:'email_and_form_found',
    companyRoles:[{role:'wholesaler',evidenceUrl:`https://${id}.example.test/wholesale`,evidenceText:'Wholesale matcha for cafés.'}],
    products:[{id:'p1',name:'Japanese ceremonial matcha',url:`https://${id}.example.test/matcha`,kind:'抹茶原料・茶商品',origin:'JP',region:'Uji',processing:null,evidenceIds:['e2']}],
    suppliers:[{name:'Uji Test Supplier',relationship:'Supplier関係確認',productId:'p1',evidenceIds:['e3']}], b2bEvidenceIds:['e1'],
    evidence:[{id:'e0',field:'identity',url:`https://${id}.example.test/about`,quote:`${name} is based in ${country}.`,checkedAt,source:'official_website'},{id:'e1',field:'b2b',url:`https://${id}.example.test/wholesale`,quote:'We supply wholesale matcha to cafés.',checkedAt,source:'official_website'},{id:'e2',field:'product',url:`https://${id}.example.test/matcha`,quote:'Japanese ceremonial matcha from Uji.',checkedAt,source:'official_website'}],
    evidenceSummaries:[{id:'official:e2',category:'matcha_product',originalText:'Japanese ceremonial matcha from Uji.',japaneseSummary:'宇治産のセレモニアル抹茶。',sourceUrl:`https://${id}.example.test/matcha`,sourceLanguage:'en',confidence:'high',status:'confirmed',summaryStatus:'generated'}],
    discoveryEvidence:[trade], screeningStatus:'matcha_confirmed',isQualifiedLead:true,screenedAt:checkedAt,screeningVersion:'1',assessment:'A',status:'完了',checkedAt };
}

test('delivery and internal export tables use the requested columns',()=>{
  const data=buildExportPackage([confirmed()]);
  assert.equal(data.count,1); assert.equal(data.delivery.headers[0],'No.'); assert.ok(data.delivery.headers.includes('抹茶取扱状況'));
  assert.ok(data.internal.headers.includes('candidateWebsiteStatus')); assert.ok(data.internal.headers.includes('isQualifiedLead'));
  assert.ok(data.evidence.headers.includes('原文・元データ'));
});

for (const [label, companyRoles, expected] of [
  ['undefined', undefined, '未確認'],
  ['null', null, '未確認'],
  ['empty', [], '未確認'],
  ['unknown only', [{role:'unknown',evidenceUrl:null,evidenceText:null}], '未確認'],
  ['known roles', [{role:'wholesaler',evidenceUrl:null,evidenceText:null},{role:'supplier',evidenceUrl:null,evidenceText:null}], 'wholesaler\nsupplier'],
]) test(`legacy companyRoles ${label} remains exportable`,()=>{
  const value=confirmed(`roles-${label.replaceAll(' ','-')}`); value.companyRoles=companyRoles;
  const data=buildExportPackage([value]); const roleIndex=data.delivery.headers.indexOf('企業属性');
  assert.equal(data.delivery.rows[0][roleIndex],expected);
  assert.doesNotThrow(()=>createDeliveryCsv(data));
  assert.doesNotThrow(()=>XLSX.read(createDeliveryWorkbook(data),{type:'array'}));
});

test('workbook contains delivery, internal, and evidence sheets with filters',()=>{
  const bytes=createDeliveryWorkbook(buildExportPackage([confirmed()])); const workbook=XLSX.read(bytes,{type:'array',cellDates:true});
  assert.deepEqual(workbook.SheetNames,['提出用','内部チェック用','出典・根拠一覧']);
  for (const name of workbook.SheetNames) assert.ok(workbook.Sheets[name]['!autofilter']?.ref);
});

test('xlsx output preserves freeze panes, wrapped styles, hyperlinks, and dates',()=>{
  const files=unzipSync(createDeliveryWorkbook(buildExportPackage([confirmed()])));
  const sheet=strFromU8(files['xl/worksheets/sheet1.xml']); const styles=strFromU8(files['xl/styles.xml']);
  assert.match(sheet,/state="frozen"/); assert.match(sheet,/hyperlinks/); assert.match(styles,/wrapText="1"/); assert.match(styles,/FF166534/);
  const internal=XLSX.read(createDeliveryWorkbook(buildExportPackage([confirmed()])),{type:'array',cellDates:true}).Sheets['内部チェック用'];
  assert.ok(internal['V2'].v instanceof Date);
});

test('CSV is UTF-8 BOM prefixed and preserves multilingual text',()=>{
  const rows=[confirmed('th','มัทฉะค้าส่ง','TH'),confirmed('kr','한국 말차 유통','KR'),confirmed('tw','臺灣抹茶批發','TW'),confirmed('vn','Nhà phân phối Việt','VN'),confirmed('de','Grüner Tee Großhandel','DE')];
  const csv=createDeliveryCsv(buildExportPackage(rows));
  assert.equal(csv.charCodeAt(0),0xFEFF); for (const text of ['มัทฉะค้าส่ง','한국 말차 유통','臺灣抹茶批發','Nhà phân phối Việt','Grüner Tee Großhandel']) assert.match(csv,new RegExp(text));
});

test('CSV neutralizes spreadsheet formulas without changing ordinary URLs',()=>{
  const value=confirmed(); value.legalName='=HYPERLINK("https://evil.invalid")';
  const csv=createDeliveryCsv(buildExportPackage([value]));
  assert.match(csv,/"'=HYPERLINK/); assert.match(csv,/https:\/\/a\.example\.test\//);
});

test('unknown, none-found, and fetch failure remain distinct',()=>{
  const pending=company('pending','Pending Tea'); const none={...company('none','No Matcha Tea'),screeningStatus:'no_matcha_found'};
  const failed={...company('failed','Failed Tea'),screeningStatus:'fetch_failed',contactStatus:'fetch_failed'};
  const data=buildExportPackage([pending,none,failed]); const matcha=data.delivery.headers.indexOf('抹茶取扱状況'); const email=data.delivery.headers.indexOf('メール');
  assert.equal(data.delivery.rows[0][matcha],'未確認'); assert.equal(data.delivery.rows[1][matcha],'抹茶根拠なし'); assert.equal(data.delivery.rows[2][matcha],'取得失敗'); assert.equal(data.delivery.rows[2][email],'取得失敗');
});

test('plain green tea and Japan origin never become confirmed matcha or Japanese matcha',()=>{
  const value=company('green','Green Tea Company','DE'); value.discoveryEvidence=[{...trade,hsCode:'090210',productDescription:'GREEN TEA',originCountry:'Japan'}]; value.screeningStatus='green_tea_only';
  const data=buildExportPackage([value]); const row=data.delivery.rows[0];
  assert.equal(row[data.delivery.headers.indexOf('抹茶取扱状況')],'緑茶のみ（抹茶未確認）'); assert.equal(row[data.delivery.headers.indexOf('日本産確認')],'未確認');
});

test('Trade evidence and Japanese summaries survive in internal and evidence sheets',()=>{
  const data=buildExportPackage([confirmed()]);
  assert.match(String(data.internal.rows[0][data.internal.headers.indexOf('original evidence text')]),/JAPANESE MATCHA GREEN TEA/);
  assert.match(String(data.internal.rows[0][data.internal.headers.indexOf('Japanese summary')]),/宇治産/);
  assert.ok(data.evidence.rows.some(row=>row[data.evidence.headers.indexOf('B/L')]==='TEST-BL'));
});

test('scope and country filters reuse existing screening fields',()=>{
  const qualified=confirmed('us','US Matcha','US'); const review={...company('de','German Review','DE'),screeningStatus:'ambiguous'}; const rejected={...company('fr','French Tea','FR'),screeningStatus:'no_matcha_found'};
  assert.equal(filterCompaniesForExport([qualified,review,rejected],'matcha_confirmed','all').length,1);
  assert.equal(filterCompaniesForExport([qualified,review,rejected],'qualified','all').length,1);
  assert.equal(filterCompaniesForExport([qualified,review,rejected],'include_review','EU').length,1);
  assert.equal(filterCompaniesForExport([qualified,review,rejected],'all','FR').length,1);
});

test('exact existing duplicate rules merge evidence without merging different identities',()=>{
  const first=confirmed('first','Same Tea','DE'); const duplicate={...company('second','Same Tea','DE','https://first.example.test/'),discoveryEvidence:[{...trade,billOfLading:'TEST-BL-2'}]};
  const distinct=company('third','Same Tea Berlin','DE','https://third.example.test/'); const groups=deduplicateForExport([first,duplicate,distinct]);
  assert.equal(groups.length,2); assert.equal(groups[0].company.discoveryEvidence.length,2); assert.ok(groups[0].company.evidence.length>=3);
});

test('automatic filenames include date and optional country filter',()=>{
  const now=new Date(2026,8,10,12,0,0); assert.equal(exportFilename('xlsx','all',now),'matcha_company_list_2026-09-10.xlsx');
  assert.equal(exportFilename('csv','US',now),'matcha_company_list_US_2026-09-10.csv'); assert.equal(exportFilename('xlsx','EU',now),'matcha_company_list_EU_2026-09-10.xlsx');
});
