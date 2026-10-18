import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {resolve} from 'node:path';

const require=createRequire(import.meta.url);
const wranglerRequire=createRequire(require.resolve('wrangler/package.json'));
const {build}=wranglerRequire('esbuild');
const compiled=await build({
  stdin:{contents:"export {DEFAULT_CONTENT} from './src/data/content'; export * from './src/server/indexnow';",resolveDir:resolve('.'),loader:'ts'},
  bundle:true,platform:'node',format:'esm',write:false,
});
const {DEFAULT_CONTENT,publicPageUrls,changedPageUrls,submitIndexNow}=await import('data:text/javascript;base64,'+Buffer.from(compiled.outputFiles[0].contents).toString('base64'));

test('IndexNow notices include changed, new and removed public pages, with no-op saves excluded',()=>{
  assert.equal(publicPageUrls(DEFAULT_CONTENT).length,1002);
  assert.deepEqual(changedPageUrls(DEFAULT_CONTENT,structuredClone(DEFAULT_CONTENT)),[]);
  const hidden=structuredClone(DEFAULT_CONTENT);hidden.works[0].visible=false;
  const removed=changedPageUrls(DEFAULT_CONTENT,hidden);
  for(const locale of ['pl','ru','en'])assert.ok(removed.includes('https://www.klim-lux.com/'+locale+'/portfolio/'+hidden.works[0].id+'/'));
  assert.equal(publicPageUrls(hidden).length,999);
  const translated=structuredClone(DEFAULT_CONTENT);translated.translations.pl.works['301'].title='Zmiana tylko polskiego opisu';
  assert.ok(changedPageUrls(DEFAULT_CONTENT,translated).includes('https://www.klim-lux.com/pl/portfolio/301/'));
  const global=structuredClone(DEFAULT_CONTENT);global.business.phone='+48 700 000 000';
  assert.equal(changedPageUrls(DEFAULT_CONTENT,global).length,1002);
  const added=structuredClone(DEFAULT_CONTENT);added.works.push({...added.works[0],id:'9ed5d1fa-31d9-49af-977b-996b768af772',visible:true});
  assert.ok(changedPageUrls(DEFAULT_CONTENT,added).includes('https://www.klim-lux.com/en/portfolio/9ed5d1fa-31d9-49af-977b-996b768af772/'));
  assert.ok(changedPageUrls(DEFAULT_CONTENT,added).every(url=>url.startsWith('https://www.klim-lux.com/')));
  const bookEdit=structuredClone(DEFAULT_CONTENT);bookEdit.library[0].descriptions.pl='Nowy opis podręcznika';
  assert.ok(changedPageUrls(DEFAULT_CONTENT,bookEdit).includes('https://www.klim-lux.com/pl/library/'+bookEdit.library[0].id+'/'));
  bookEdit.library[0].visible=false;assert.equal(publicPageUrls(bookEdit).length,999);
  assert.ok(changedPageUrls(DEFAULT_CONTENT,bookEdit).includes('https://www.klim-lux.com/ru/library/'+bookEdit.library[0].id+'/'));
  const edition=structuredClone(DEFAULT_CONTENT);edition.library.push({...edition.library[0],id:'translation-test',language:'ru',translationOf:edition.library[0].id});
  const notice=changedPageUrls(DEFAULT_CONTENT,edition);
  assert.ok(notice.includes('https://www.klim-lux.com/ru/library/translation-test/'));
  assert.ok(notice.includes('https://www.klim-lux.com/pl/library/'+edition.library[0].id+'/'));
});

test('IndexNow uses canonical ownership, filters foreign/query URLs and treats 202 as pending validation',async()=>{
  let request;
  const result=await submitIndexNow(['https://www.klim-lux.com/pl/','https://www.klim-lux.com/pl/','https://evil.example/','https://www.klim-lux.com/pl/?q=test'],async(url,options)=>{
    request={url,options,payload:JSON.parse(options.body)};
    return new Response(null,{status:202});
  });
  assert.equal(result.count,1);assert.equal(result.accepted,true);assert.equal(result.pendingKeyValidation,true);
  assert.equal(request.url,'https://api.indexnow.org/indexnow');
  assert.equal(request.options.method,'POST');
  assert.equal(request.payload.host,'www.klim-lux.com');
  assert.match(request.payload.key,/^[a-f0-9]{32}$/);
  assert.equal(request.payload.keyLocation,'https://www.klim-lux.com/'+request.payload.key+'.txt');
  assert.deepEqual(request.payload.urlList,['https://www.klim-lux.com/pl/']);
});

test('IndexNow retries transient failures once, respects long Retry-After and never calls failure indexing success',async()=>{
  const urls=['https://www.klim-lux.com/pl/'];let attempts=0;
  const recovered=await submitIndexNow(urls,async()=>new Response(null,{status:++attempts===1?503:200,headers:{'Retry-After':'0'}}));
  assert.equal(attempts,2);assert.equal(recovered.accepted,true);assert.equal(recovered.pendingKeyValidation,false);
  attempts=0;
  const limited=await submitIndexNow(urls,async()=>{attempts++;return new Response(null,{status:429,headers:{'Retry-After':'120'}});});
  assert.equal(attempts,1);assert.equal(limited.accepted,false);assert.equal(limited.status,429);
  attempts=0;
  const denied=await submitIndexNow(urls,async()=>{attempts++;return new Response(null,{status:403});});
  assert.equal(attempts,1);assert.equal(denied.accepted,false);
  attempts=0;
  const network=await submitIndexNow(urls,async()=>{attempts++;throw new Error('network unavailable');});
  assert.equal(attempts,2);assert.equal(network.accepted,false);assert.equal(network.error,'network_or_timeout');
});

