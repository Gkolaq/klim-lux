// Isolated code rollback check. Never connects to production or sends an email.
import assert from 'node:assert/strict';
import {readFile,readdir,mkdtemp,rm} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import {join,resolve} from 'node:path';
import {tmpdir} from 'node:os';

const [currentInput,previousInput]=process.argv.slice(2);
if(!currentInput||!previousInput)throw Error('Usage: node scripts/verify-rollback.mjs CURRENT_SOURCE PREVIOUS_SOURCE (both built)');
const current=resolve(currentInput),previous=resolve(previousInput);
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
async function schema(source){
 const files=(await readdir(join(source,'drizzle'))).filter(file=>file.endsWith('.sql')).sort();
 return Promise.all(files.map(async file=>({file,sha256:hash(await readFile(join(source,'drizzle',file)))})));
}
const currentConfig=JSON.parse(await readFile(join(current,'.openai/hosting.json'),'utf8'));
const previousConfig=JSON.parse(await readFile(join(previous,'.openai/hosting.json'),'utf8'));
assert.equal(currentConfig.project_id,previousConfig.project_id,'rollback must remain in the same Site');
assert.deepEqual(await schema(current),await schema(previous),'changed migrations require a separate compatibility check');
const require=createRequire(join(current,'package.json')),wr=createRequire(require.resolve('wrangler/package.json'));
const {Miniflare,convertV4MiniflareOptions}=wr('miniflare');
const mr=createRequire(wr.resolve('miniflare')),{Response:MockResponse}=mr('undici');
const state=await mkdtemp(join(tmpdir(),'klim-code-rollback-'));
const origin='https://www.klim-lux.com',owner={'oai-authenticated-user-id':'rollback-fixture','oai-authenticated-user-email':'rollback@example.test'};
async function start(source){
 const root=join(source,'dist/server');
 const modules=[{type:'ESModule',path:join(root,'index.js')},...(await readdir(root,{recursive:true})).filter(file=>/\.m?js$/.test(file)&&file!=='index.js').map(file=>({type:'ESModule',path:join(root,file)}))];
 return new Miniflare(convertV4MiniflareOptions({name:'klim-code-rollback-check',modules,modulesRoot:root,compatibilityDate:'2026-10-01',compatibilityFlags:['nodejs_compat'],
  d1Databases:{DB:'isolated-rollback-content'},r2Buckets:{BUCKET:'isolated-rollback-files'},resourcePersistencePath:state,
  bindings:{EDITOR_EMAILS:'rollback@example.test',CONTACT_EMAIL_ENABLED:'false'},cf:false,logRequests:false,
  assets:{directory:join(source,'dist/client'),binding:'ASSETS',routerConfig:{has_user_worker:true,invoke_user_worker_ahead_of_assets:true}},
  outboundService:async request=>{assert.equal(new URL(request.url).hostname,'api.indexnow.org','no other outbound traffic is allowed');return new MockResponse('{}',{status:200});},
 }));
}
let mf;
try{
 mf=await start(current);
 const db=await mf.getD1Database('DB');
 for(const {file} of await schema(current))await db.batch((await readFile(join(current,'drizzle',file),'utf8')).split('--> statement-breakpoint').map(sql=>sql.trim()).filter(Boolean).map(sql=>db.prepare(sql)));
 const initial=await mf.dispatchFetch(origin+'/api/content/',{headers:owner});assert.equal(initial.status,200);
 const snapshot=await initial.json();assert.equal(snapshot.revision,0);snapshot.content.home.title='Isolated rollback fixture';
 const save=await mf.dispatchFetch(origin+'/api/content/',{method:'PUT',headers:{...owner,Origin:origin,'Content-Type':'application/json'},body:JSON.stringify({revision:snapshot.revision,content:snapshot.content})});assert.equal(save.status,200,(await save.clone().text()).slice(0,200));
 const saved=await (await mf.dispatchFetch(origin+'/api/content/',{headers:owner})).json();assert.equal(saved.revision,1);
 await (await mf.getR2Bucket('BUCKET')).put('release/rollback-fixture.txt','retained through code rollback');
 await mf.dispose();mf=undefined;
 for(const source of [previous,current]){
  mf=await start(source);
  const response=await mf.dispatchFetch(origin+'/api/content/',{headers:owner});assert.equal(response.status,200);const content=await response.json();
  assert.equal(content.revision,1);assert.deepEqual(content.content,saved.content);
  const object=await (await mf.getR2Bucket('BUCKET')).get('release/rollback-fixture.txt');assert.equal(await object.text(),'retained through code rollback');
  const health=await mf.dispatchFetch(origin+'/api/health/');assert.equal(health.status,200);assert.deepEqual((await health.json()).checks,{content:true,files:true});
  assert.equal((await mf.dispatchFetch(origin+'/api/content/')).status,401);
  await mf.dispose();mf=undefined;
 }
 console.log(JSON.stringify({ok:true,sequence:'current -> previous -> current',migrations_equal:true,content_revision:1,content_preserved:true,r2_object_preserved:true,health_ok:true,admin_closed:true,production_mutations:0,real_emails_sent:0}));
}finally{if(mf)await mf.dispose();await rm(state,{recursive:true,force:true});}
