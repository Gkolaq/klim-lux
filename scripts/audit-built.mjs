import {readFile,readdir,mkdtemp,rm,writeFile} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {tmpdir} from 'node:os';
import {createRequire} from 'node:module';
const authoredArticles=JSON.parse(await readFile('src/data/authored-articles.json','utf8'));
const require=createRequire(import.meta.url),wr=createRequire(require.resolve('wrangler/package.json'));
const {Miniflare,convertV4MiniflareOptions}=wr('miniflare');
const root=resolve('dist/server'),state=await mkdtemp(join(tmpdir(),'klim-full-audit-'));
const modules=[{type:'ESModule',path:join(root,'index.js')},...(await readdir(root,{recursive:true})).filter(f=>/\.m?js$/.test(f)&&f!=='index.js').map(f=>({type:'ESModule',path:join(root,f)}))];
const mf=new Miniflare(convertV4MiniflareOptions({name:'klim-audit',modules,modulesRoot:root,compatibilityDate:'2026-10-01',compatibilityFlags:['nodejs_compat'],d1Databases:{DB:'audit'},r2Buckets:{BUCKET:'audit'},resourcePersistencePath:state,bindings:{EDITOR_EMAILS:'xelogen9999@gmail.com'},assets:{directory:resolve('dist/client'),binding:'ASSETS',routerConfig:{has_user_worker:true,invoke_user_worker_ahead_of_assets:true}},cf:false,logRequests:false}));
const origin='https://www.klim-lux.com',issues=[],pages=[],assets=new Set();
try{
 const db=await mf.getD1Database('DB');for(const f of (await readdir('drizzle')).filter(f=>f.endsWith('.sql')).sort()){const sql=(await readFile(join('drizzle',f),'utf8')).split('--> statement-breakpoint').map(s=>s.trim()).filter(Boolean);await db.batch(sql.map(s=>db.prepare(s)));}
 const map=await mf.dispatchFetch(origin+'/sitemap.xml');const xml=await map.text();const urls=[...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map(m=>m[1]);
 if(map.status!==200||!urls.length||new Set(urls).size!==urls.length)throw Error('invalid sitemap');
 let index=0;async function worker(){while(index<urls.length){const url=urls[index++];const r=await mf.dispatchFetch(url);const html=await r.text();const found=[];
 if(r.status!==200)found.push('http_'+r.status);
 if((html.match(/<h1(?:\s|>)/g)||[]).length!==1)found.push('h1');
 const can=html.match(/rel="canonical" href="([^"]+)"/);if(!can||can[1]!==url)found.push('canonical');
 if((html.match(/<link[^>]*hreflang="/g)||[]).length!==4)found.push('hreflang_count');
 if(!html.includes('name="viewport"'))found.push('viewport');
 for(const m of html.matchAll(/<script[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/g))try{JSON.parse(m[1])}catch{found.push('jsonld')}
 for(const m of html.matchAll(/(?:src|href)="(\/(?:images|brand|fonts|_astro)\/[^"?#]+)"/g))assets.add(m[1]);
 pages.push({url,status:r.status,bytes:Buffer.byteLength(html),issues:found});if(found.length)issues.push({url,issues:found});
 if(pages.length%200===0)console.log(JSON.stringify({checked:pages.length,total:urls.length}));
 }}await Promise.all(Array.from({length:4},()=>worker()));
 const missing=[];for(const path of assets){try{await readFile('dist/client'+path)}catch{missing.push(path)}}
 const probes=[];for(const [path,status] of [['/robots.txt',200],['/api/health/',200],['/api/content/',401],['/api/history/',401],['/api/library-upload/',405],['/.env',404],['/.git/config',404],['/pl/missing/',404]]){const r=await mf.dispatchFetch(origin+path);probes.push({path,expected:status,status:r.status});}
 const report={date:new Date().toISOString(),mode:'local-built-worker-not-production',urls:urls.length,pages:pages.length,issues,assets:assets.size,missing,probes,limitations:['Not a public network test','No browser interaction or Core Web Vitals','No Google indexing confirmation'],details:pages};
 await writeFile(process.argv[2]||'/tmp/klim-audit.json',JSON.stringify(report,null,2));console.log(JSON.stringify({date:report.date,mode:report.mode,pages:report.pages,issues:issues.length,assets:report.assets,missing:report.missing,probes:report.probes}));
 if(issues.length||missing.length||probes.some(p=>p.status!==p.expected))process.exitCode=1;
}finally{await mf.dispose();await rm(state,{recursive:true,force:true})}
