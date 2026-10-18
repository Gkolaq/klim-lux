import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile,readdir,mkdtemp,rm,mkdir,writeFile} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {tmpdir} from 'node:os';
import {createRequire} from 'node:module';
import {createHash} from 'node:crypto';
import {gunzipSync} from 'node:zlib';
const require=createRequire(import.meta.url);
// Miniflare is the runtime bundled with the pinned Wrangler toolchain.
const wranglerRequire=createRequire(require.resolve('wrangler/package.json'));
const {Miniflare,convertV4MiniflareOptions}=wranglerRequire('miniflare');
const miniflareRequire=createRequire(wranglerRequire.resolve('miniflare'));
const {Response:NetworkResponse}=miniflareRequire('undici');

test('production Worker: routes, editor access, durable changes, conflicts, uploads and recovery',async()=>{
  const notifications=[];
  const outboundService=async request=>{
    assert.equal(request.url,'https://api.indexnow.org/indexnow','tests permit only the mocked search endpoint');
    assert.equal(request.method,'POST');
    notifications.push(await request.json());
    return new NetworkResponse('',{status:200});
  };
  const state=await mkdtemp(join(tmpdir(),'klim-lux-test-'));
  const serverRoot=resolve('dist/server');
  const modules=[{type:'ESModule',path:join(serverRoot,'index.js')},...(await readdir(serverRoot,{recursive:true})).filter(f=>/\.m?js$/.test(f)&&f!=='index.js').map(f=>({type:'ESModule',path:join(serverRoot,f)}))];
  const options=()=>convertV4MiniflareOptions({
    name:'klim-cms-test',
    modules,modulesRoot:serverRoot,
    compatibilityDate:'2026-10-01',compatibilityFlags:['nodejs_compat'],
    d1Databases:{DB:'cms-tests'},r2Buckets:{BUCKET:'cms-media'},resourcePersistencePath:state,
    bindings:{EDITOR_EMAILS:'xelogen9999@gmail.com',GA4_MEASUREMENT_ID:'G-TEST123456'},
    assets:{directory:resolve('dist/client'),binding:'ASSETS',routerConfig:{has_user_worker:true,invoke_user_worker_ahead_of_assets:true}},
    cf:false,logRequests:false,outboundService,
  });
  let mf=new Miniflare(options());
  const origin='https://www.klim-lux.com';
  const owner={'oai-authenticated-user-id':'test-owner','oai-authenticated-user-email':'xelogen9999@gmail.com'};
  const fetch=(path,options={})=>mf.dispatchFetch(origin+path,{redirect:'manual',...options});
  const write=(payload,headers={})=>fetch('/api/content/',{method:'PUT',headers:{...owner,Origin:origin,'Content-Type':'application/json',...headers},body:JSON.stringify({revision:payload.revision,content:payload.content})});
  try {
    const db=await mf.getD1Database('DB');
    for(const file of (await readdir('drizzle')).filter(f=>f.endsWith('.sql')).sort()){
      const statements=(await readFile(join('drizzle',file),'utf8')).split('--> statement-breakpoint').map(s=>s.trim()).filter(Boolean);
      await db.batch(statements.map(sql=>db.prepare(sql)));
    }
    const apex=await mf.dispatchFetch('https://klim-lux.com/portfolio/?category=covers',{redirect:'manual'});assert.equal(apex.status,308);assert.equal(apex.headers.get('Location'),'https://www.klim-lux.com/portfolio/?category=covers');
    const locales=['pl','ru','en'],hreflang={pl:'pl-PL',ru:'ru',en:'en'};
    for(const country of ['PL','BY','RU','UA','GB','US']) {
      const response=await fetch('/?campaign=test',{cf:{country}});
      assert.equal(response.status,301);
      assert.equal(response.headers.get('Location'),'/pl/?campaign=test');
      assert.equal((await fetch('/',{cf:{country},headers:{'User-Agent':'Googlebot'}})).headers.get('Location'),'/pl/');
    }
    assert.equal((await fetch('/',{cf:{country:'PL'},headers:{Cookie:'klim_locale=uk'}})).headers.get('Location'),'/pl/');
    assert.equal((await fetch('/',{headers:{'Accept-Language':'en;q=1,ru-RU;q=0.9'}})).headers.get('Location'),'/pl/');
    const language=await fetch('/language/?locale=en&path=%2Fportfolio%2F301%2F&query=campaign%3Dx');
    assert.equal(language.status,302);assert.equal(language.headers.get('Location'),'/en/portfolio/301/?campaign=x');
    assert.match(language.headers.get('Set-Cookie'),/klim_locale=en/);assert.match(language.headers.get('Set-Cookie'),/HttpOnly/);assert.match(language.headers.get('Set-Cookie'),/Secure/);
    for(const retired of ['be','uk']){
      const response=await fetch('/'+retired+'/portfolio/301/?campaign=old');
      assert.equal(response.status,301);assert.equal(response.headers.get('Location'),'/ru/portfolio/301/?campaign=old');
    }
    for(const bad of ['/language/?locale=es','/language/?locale=pl&path=//evil.example/','/language/?locale=pl&path=/../admin/'])assert.equal((await fetch(bad)).status,400);
    const legacy=await fetch('/portfolio/?category=covers');assert.equal(legacy.status,308);assert.equal(legacy.headers.get('Location'),'/ru/portfolio/?category=covers');
    const routes=['/','/services/','/services/upholstery/','/services/restoration/','/services/covers/','/services/details/','/materials/','/workshop/','/portfolio/','/contacts/','/portfolio/301/'];
    for(const locale of locales) {
      const titles=new Set();
      for(const suffix of routes) {
        const route='/'+locale+suffix,response=await fetch(route,{cf:{country:locale==='pl'?'RU':'PL'}}),html=await response.text();
        assert.equal(response.status,200,route+' '+html.slice(0,2000));assert.equal((html.match(/<h1[ >]/g)||[]).length,1,route);assert.equal((html.match(/class="brand-logo"/g)||[]).length,2,route+" logo in header and footer");assert.ok(!html.includes("KLIM <small"));assert.match(html,new RegExp('<html lang="'+locale+'"'));
        assert.ok(html.includes('rel="canonical" href="'+origin+route+'"'),route+' canonical');
        for(const alternate of locales)assert.ok(html.includes('hreflang="'+hreflang[alternate]+'" href="'+origin+'/'+alternate+suffix+'"'),route+' alternate '+alternate);
        const title=html.match(/<title>(.*?)<\/title>/s)?.[1];assert.ok(title);assert.ok(!titles.has(title),'unique title');titles.add(title);assert.ok(!html.includes('Загружаю содержимое'));
        assert.ok(!/href="\/(?:services|portfolio|materials|workshop|contacts)\//.test(html),'navigation keeps language');
        assert.match(html, /property="og:image" content="https:\/\/www\.klim-lux\.com\//, 'shares use a real site image');
        assert.match(html, /name="twitter:card" content="summary_large_image"/);
        const schema=JSON.parse(html.match(/<script[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/)?.[1]??'{}');
        assert.ok(schema['@graph']?.find(item=>item['@type']==='WebPage')?.primaryImageOfPage?.url, 'page image is described');
        const service=schema['@graph']?.find(item=>item['@type']==='Service');
        if(suffix.startsWith('/services/')&&suffix!=='/services/'){
          assert.equal(service?.url,origin+route);assert.equal(service.provider['@id'],origin+'/#organization');assert.equal(service.offers,undefined,'no invented prices');
          const related=html.match(/<section[^>]*data-related-services[^>]*>([\s\S]*?)<\/section>/)?.[1];
          assert.ok(related,route+' related service navigation renders on the server');
          assert.ok(related.includes('id="related-services-heading"'),route+' accessible related heading');
          const links=[...related.matchAll(/<a\b[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/g)];
          assert.equal(links.length,2,route+' two relevant alternatives');
          assert.equal(new Set(links.map(link=>link[1])).size,2,route+' no duplicate alternatives');
          for(const link of links){
            assert.ok(new RegExp('^/'+locale+'/services/(?:upholstery|restoration|covers|details)/$').test(link[1]),route+' canonical language-preserving service URL');
            assert.notEqual(link[1],route,route+' no self link');
            assert.ok(link[2].replace(/<[^>]+>/g,'').trim().length>3,route+' descriptive anchor');
          }
          assert.ok(!/onclick=|nofollow/i.test(related),route+' ordinary crawlable links');
        }
        else assert.equal(service,undefined,'non-service routes have no service schema');
      }
      for(const suffix of ['/does-not-exist/','/services/missing/','/portfolio/999999/'])assert.equal((await fetch('/'+locale+suffix)).status,404);
    }
    for(const route of ['/does-not-exist/','/es/','/services/missing/'])assert.equal((await fetch(route)).status,404,route);
    const home=await (await fetch('/ru/')).text();assert.ok(home.length<40000,'homepage stays bounded');assert.equal((home.match(/class="work-card"/g)||[]).length,6);
    for(const locale of locales){
      const response=await fetch('/'+locale+'/'),html=await response.text();
      assert.ok(html.includes('data-measurement-id="G-TEST123456"'),locale+' analytics uses the configured public ID');
      assert.equal((html.match(/id="analytics-consent"/g)||[]).length,1);
      assert.match(html,/<section[^>]*id="analytics-consent"[^>]*hidden/,'consent UI is shown by the client only');
      assert.ok(html.includes('data-analytics-settings'),'choice can be reopened in the footer');
      assert.ok(!/<script[^>]*src="https:\/\/www\.googletagmanager\.com/.test(html),'SSR never loads Google before consent');
      assert.ok(response.headers.get('Content-Security-Policy').includes('https://*.google-analytics.com'));
    }
    for(const path of ['/admin/','/api/health/','/ru/missing/']){
      const response=await fetch(path),html=await response.text();
      assert.ok(!html.includes('id="analytics-consent"'),path+' has no analytics UI');
      if(!path.includes('?'))assert.ok(!response.headers.get('Content-Security-Policy').includes('google'),path+' keeps the strict CSP');
    }
    const filteredAnalytics=await (await fetch('/ru/portfolio/?q=private%40example.com')).text();
    assert.ok(filteredAnalytics.includes('id="analytics-consent"'),'indexability is independent of consented visitor statistics');
    assert.ok(filteredAnalytics.includes('noindex, follow'));
    const preview=await mf.dispatchFetch('https://klim-lux.xelogen9999.chatgpt.site/ru/');
    assert.equal(preview.status,200);assert.ok(!preview.headers.get('Content-Security-Policy').includes('google'));
    assert.ok(!(await preview.text()).includes('id="analytics-consent"'),'native host does not pollute public analytics');
    const catalogue=await (await fetch('/ru/portfolio/')).text();assert.equal((catalogue.match(/class="work-card"/g)||[]).length,18);
    const page2=await (await fetch('/ru/portfolio/?page=2')).text();assert.match(page2,/19–36 из 299/);assert.ok(!page2.includes('content="noindex'));assert.ok(page2.includes('rel="canonical" href="'+origin+'/ru/portfolio/?page=2"'));assert.ok(page2.includes('data-analytics-settings'));
    assert.equal((await fetch('/ru/portfolio/?page=01')).status,301);
    const mechanisms=await (await fetch('/ru/portfolio/?category=mechanisms')).text();assert.equal((mechanisms.match(/class="work-card"/g)||[]).length,4);
    const empty=await (await fetch('/ru/portfolio/?q=zzzznotfound')).text();assert.match(empty,/По этому запросу работ не найдено/);
    const polishSearch=await (await fetch('/pl/portfolio/?q=naro%C5%BCnik')).text();assert.match(polishSearch,/Narożnik/);assert.match(polishSearch,/noindex/);
    const polishContact=await (await fetch('/pl/contacts/')).text();assert.match(polishContact,/Wysyłanie przez stronę jest chwilowo niedostępne/);assert.match(polishContact,/Podaj imię/);
    const sitemap=await (await fetch('/sitemap.xml')).text();assert.equal((sitemap.match(/<url>/g)||[]).length,1002);assert.ok(!sitemap.includes('/admin/'));assert.equal((sitemap.match(/<image:image>/g)||[]).length,897);assert.ok(sitemap.includes('<loc>'+origin+'/pl/</loc>'));assert.ok(!sitemap.includes('https://klim-lux.xelogen9999.chatgpt.site'));assert.equal((sitemap.match(/<xhtml:link /g)||[]).length,4008);
    const articlePath='/ru/materials/obman-pri-peretyazhke-mebeli/';
    const authorResponse=await fetch(articlePath);assert.equal(authorResponse.status,200);
    const authorHtml=await authorResponse.text();assert.equal((authorHtml.match(/<h1(?:\s[^>]*)?>/g)||[]).length,1);
    assert.ok(authorHtml.includes('Как избежать обмана при перетяжке мебели'));assert.ok(authorHtml.includes('Олег Климко'));
    assert.ok(authorHtml.includes('2014-10-24'));assert.ok(authorHtml.includes('первоначальным дизайном'));
    assert.equal((authorHtml.match(/<link[^>]*hreflang=/g)||[]).length,4,'three real translated editions and the Polish default are advertised');
    assert.ok(authorHtml.includes('rel="canonical" href="'+origin+articlePath+'"'));
    assert.ok(authorHtml.includes('property="og:type" content="article"'));
    const articleGraph=[...authorHtml.matchAll(/<script[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/g)].flatMap(m=>JSON.parse(m[1])['@graph']||[]);
    const articleData=articleGraph.find(item=>item['@type']==='Article');assert.ok(articleData);assert.equal(articleData.inLanguage,'ru');assert.equal(articleData.author.name,'Олег Климко');assert.equal(articleData.datePublished,'2014-10-24');
    assert.ok(sitemap.includes('<loc>'+origin+articlePath+'</loc><lastmod>2026-10-15</lastmod>'));
    for(const locale of ['pl','en'])assert.equal((await fetch('/'+locale+'/materials/obman-pri-peretyazhke-mebeli/')).status,404);
    const languageFallback=await fetch('/language/?locale=pl&path='+encodeURIComponent('/materials/'));assert.equal(languageFallback.headers.get('Location'),'/pl/materials/');
    const articleRoutes={ru:articlePath,pl:'/pl/materials/jak-uniknac-oszustwa-przy-tapicerowaniu-mebli/',en:'/en/materials/avoid-reupholstery-scams/'};
    for(const [locale,path]of Object.entries(articleRoutes)){
      const response=await fetch(path);assert.equal(response.status,200);const html=await response.text();assert.ok(html.includes('hreflang="en" href="'+origin+articleRoutes.en+'"'));
      assert.ok((await (await fetch('/'+locale+'/materials/')).text()).includes('href="'+path+'"'));
    }
    const robots=await (await fetch('/robots.txt')).text();assert.match(robots,/Disallow: \/admin\//);assert.match(robots,/Disallow: \/api\//);assert.ok(robots.includes('Sitemap: '+origin+'/sitemap.xml'));
    const verificationFiles=(await readdir('public')).filter(name=>/^[a-f0-9]{32}\.txt$/.test(name));
    assert.equal(verificationFiles.length,1);
    const ownership=await fetch('/'+verificationFiles[0]);assert.equal(ownership.status,200);assert.equal((await ownership.text()).trim(),verificationFiles[0].slice(0,-4));
    const logo=await fetch('/brand/klim-logo.jpg');assert.equal(logo.status,200);assert.equal(logo.headers.get('Content-Type'),'image/jpeg');
    for(const path of ['/brand/klim-logo.svg','/favicon.svg','/favicon.ico']){const response=await fetch(path);assert.equal(response.status,308);assert.equal(response.headers.get('Location'),path.includes('klim-logo.svg')?'/brand/klim-logo.jpg':'/brand/klim-logo-192.png');}
    for(const path of ['/brand/klim-logo-384.webp','/brand/klim-logo-768.webp','/brand/klim-logo-180.png','/brand/klim-logo-192.png','/brand/klim-logo-512.png'])assert.equal((await fetch(path)).status,200,path);
    assert.equal((await fetch('/favicon.ico')).status,308);
    const graph=JSON.parse(home.match(/<script[^>]*type="application\/ld\+json"[^>]*>(.*?)<\/script>/s)[1]);
    assert.equal(graph['@graph'].find(item=>item['@type']==='Organization').logo.url,origin+'/brand/klim-logo.jpg');
    const health=await fetch('/api/health/');assert.equal(health.status,200);const healthBody=await health.json();assert.deepEqual(healthBody.checks,{content:true,files:true});assert.ok(!JSON.stringify(healthBody).includes('xelogen'));assert.equal(health.headers.get('Cache-Control'),'private, no-store');const anonymous=await fetch('/admin/');assert.equal(anonymous.status,401);const loginHtml=await anonymous.text();assert.ok(loginHtml.includes('/signin-with-chatgpt?return_to=%2Fadmin%2F'));assert.ok(!loginHtml.includes('id="editor-app"'));assert.equal(anonymous.headers.get('Cache-Control'),'private, no-store');
    const forbidden={'oai-authenticated-user-id':'visitor','oai-authenticated-user-email':'someone@example.com'};
    assert.equal((await fetch('/admin/',{headers:forbidden})).status,403);
    assert.equal((await fetch('/api/content/')).status,401);assert.equal((await fetch('/api/history/',{headers:forbidden})).status,403);
    assert.equal((await fetch('/api/upload/',{method:'POST',headers:{Origin:origin}})).status,401);
    const editorPage=await fetch('/admin/',{headers:owner});assert.equal(editorPage.status,200);assert.ok((await editorPage.text()).includes('id="editor-app"'));
    const original=await (await fetch('/api/content/',{headers:owner})).json();assert.equal(original.revision,0);assert.equal(original.content.works.length,299);
    for(const locale of ['pl','en'])assert.equal(Object.keys(original.content.translations[locale].works).length,299);
    assert.ok(JSON.stringify(original).length<900000,'multilingual payload fits API limit');
    const recent=JSON.parse(await readFile('src/data/recent-works.json','utf8')),recentIds=recent.map(work=>work.id);
    assert.deepEqual(original.content.works.slice(0,8).map(work=>work.id),recentIds);
    for(const locale of locales){
      const html=await (await fetch('/'+locale+'/portfolio/')).text();
      const cards=[...html.matchAll(/<article[^>]*class="work-card"[^>]*>\s*<a href="\/[^/]+\/portfolio\/(\d+)\//g)].map(match=>match[1]);
      assert.deepEqual(cards.slice(0,8),recentIds,locale+' gallery follows attachment order');
      for(const work of recent){const response=await fetch('/'+locale+'/portfolio/'+work.id+'/'),page=await response.text();assert.equal(response.status,200);assert.ok(page.includes(locale==='ru'?work.ru.title:original.content.translations[locale].works[work.id].title),locale+' descriptive caption '+work.id);assert.equal((page.match(/class="brand-logo"/g)||[]).length,2);}
    }
    const homeCards=[...home.matchAll(/<article[^>]*class="work-card"[^>]*>\s*<a href="\/ru\/portfolio\/(\d+)\//g)].map(match=>match[1]);assert.deepEqual(homeCards,recentIds.slice(0,6));
    for(const work of recent){assert.equal((await fetch(work.image)).status,200);assert.equal((await fetch('/images/responsive/'+work.id+'-360.webp')).status,200);assert.equal((await fetch('/images/responsive/'+work.id+'-720.webp')).status,200);}
    const legacyContent=structuredClone(original.content);delete legacyContent.translations;delete legacyContent.library;
    legacyContent.works=legacyContent.works.filter(work=>!recentIds.includes(work.id));
    legacyContent.works.find(work=>work.id==='300').title='Собственное описание владельца';legacyContent.works.find(work=>work.id==='300').order=0;legacyContent.works.find(work=>work.id==='300').visible=false;
    legacyContent.services.forEach(service=>delete service.preparation);
    legacyContent.services[0].body='Собственный текст владельца';
    await db.prepare('INSERT INTO site_content (id,revision,payload,updated_at,updated_by) VALUES (?, ?, ?, ?, ?)').bind('main',0,JSON.stringify(legacyContent),new Date().toISOString(),'legacy-test').run();
    const migrated=await (await fetch('/api/content/',{headers:owner})).json();assert.equal(migrated.content.translations.pl.works['301'].title,'Kanapa na zamówienie');assert.equal(migrated.content.home.title,legacyContent.home.title);
    assert.deepEqual(migrated.content.library,original.content.library,'old D1 rows gain the initial library without replacing saved fields');
    assert.equal(migrated.content.services[0].body,'Собственный текст владельца','adding guidance preserves owner text');
    assert.equal(migrated.content.works.length,299,'old D1 row gains all eight photographs');assert.deepEqual(migrated.content.works.slice(0,8).map(work=>work.id),recentIds);
    assert.equal(migrated.content.works[8].id,'300','old relative order survives');assert.equal(migrated.content.works[8].title,'Собственное описание владельца');assert.equal(migrated.content.works[8].visible,false,'owner visibility survives');
    await db.prepare('UPDATE site_content SET payload = ? WHERE id = ?').bind(JSON.stringify(migrated.content),'main').run();
    assert.deepEqual((await (await fetch('/api/content/',{headers:owner})).json()).content,migrated.content,'reading a complete row is idempotent');
    assert.ok(migrated.content.services[0].preparation.includes('Сфотографируйте'));
    const previousFields=structuredClone(original.content);
    for(const locale of ['pl','en'])previousFields.translations[locale].services.forEach(service=>delete service.preparation);
    previousFields.translations.pl.services[0].body='Tekst właściciela';
    previousFields.translations.pl.services[2].preparation='';
    await db.prepare('UPDATE site_content SET payload = ? WHERE id = ?').bind(JSON.stringify(previousFields),'main').run();
    const extended=await (await fetch('/api/content/',{headers:owner})).json();
    assert.equal(extended.content.translations.pl.services[0].body,'Tekst właściciela');
    assert.ok(extended.content.translations.pl.services[0].preparation.includes('Zrób zdjęcie'));
    assert.equal(extended.content.translations.pl.services[2].preparation,'','owner may intentionally hide the guidance');
    await db.prepare('DELETE FROM site_content WHERE id = ?').bind('main').run();
    const invalidTranslation=structuredClone(original);invalidTranslation.content.translations.pl.home.title='';assert.equal((await write(invalidTranslation)).status,422);
    if(process.env.KLIM_QA_DIR){const folder=process.env.KLIM_QA_DIR;await mkdir(folder,{recursive:true});await writeFile(join(folder,'admin.html'),await (await fetch('/admin/',{headers:owner})).text());for(const locale of locales)await writeFile(join(folder,locale+'-contacts.html'),await (await fetch('/'+locale+'/contacts/')).text());await writeFile(join(folder,'home.html'),home);await writeFile(join(folder,'content.json'),JSON.stringify(original));}
    assert.equal((await write(original,{Origin:'https://bad.example'})).status,403);
    assert.equal((await write(original,{Origin:''})).status,403);
    const invalid=structuredClone(original);invalid.content.business.email='not-email';assert.equal((await write(invalid)).status,422);
    const broken=structuredClone(original);broken.content.works[0].image='/images/originals/missing.jpg';assert.equal((await write(broken)).status,422);
    const truncated=structuredClone(original);truncated.content.works.pop();assert.equal((await write(truncated)).status,422);
    const unsafe=structuredClone(original);unsafe.content.works[0].source='javascript:alert(1)';assert.equal((await write(unsafe)).status,422);
    const oversized=await fetch('/api/content/',{method:'PUT',headers:{...owner,Origin:origin,'Content-Type':'application/json'},body:' '.repeat(900001)});assert.equal(oversized.status,413);
    const edited=structuredClone(original);edited.content.home.title='Мастерская <script>alert(1)</script>';edited.content.home.heroId=edited.content.works[1].id;edited.content.works.find(work=>work.id==='301').visible=false;edited.content.works.find(work=>work.id==='302').order=1000;edited.content.works.find(work=>work.id==='309').order=0;edited.content.translations.pl.home.title='Polska pracownia — test';edited.content.translations.en.home.title='English workshop — test';edited.content.translations.pl.works['300'].title='Narożnik — zmieniony opis';
    edited.content.translations.pl.services[0].preparation='Opis przygotowania <script>alert(1)</script>';
    edited.content.translations.pl.services[0].title='Tapicerowanie — tekst właściciela';
    edited.content.translations.pl.services[0].lead='Indywidualny opis usługi właściciela.';
    const saved=await write(edited);assert.equal(saved.status,200,await saved.clone().text());let snapshot=await saved.json();assert.equal(snapshot.revision,1);
    const verifyBackup=async current=>{
      const manifest=await db.prepare('SELECT * FROM automation_backup WHERE id = ?').bind('main').first();
      const {results:chunks}=await db.prepare('SELECT ordinal,data FROM automation_backup_chunks ORDER BY ordinal').all();
      assert.equal(manifest.revision,current.revision);assert.equal(chunks.length,manifest.chunk_count);
      chunks.forEach((row,i)=>{assert.equal(row.ordinal,i);assert.ok(row.data.length<=256,'bounded native reader cells');});
      const gzip=Buffer.from(chunks.map(row=>row.data).join(''),'base64');assert.equal(gzip.length,manifest.gzip_bytes);
      const plain=gunzipSync(gzip);assert.equal(plain.length,manifest.json_bytes);assert.equal(createHash('sha256').update(plain).digest('hex'),manifest.sha256);
      const backup=JSON.parse(plain);assert.deepEqual(backup.content,current.content);assert.equal(backup.format,'klim-lux-content-v1');
      const hash=await db.prepare('SELECT backup_sha256 FROM site_content WHERE id = ?').bind('main').first();assert.equal(hash.backup_sha256,manifest.sha256);
    };
    await verifyBackup(snapshot);
    for(let attempt=0;notifications.length===0&&attempt<50;attempt++)await new Promise(resolve=>setTimeout(resolve,20));
    assert.equal(notifications.length,1,'one search notice follows one successful content change');
    assert.equal(notifications[0].host,'www.klim-lux.com');
    for(const locale of locales)assert.ok(notifications[0].urlList.includes(origin+'/'+locale+'/portfolio/301/'),'hidden URLs are notified');
    for(const slug of ['restoration','covers']){
      const path='/pl/services/'+slug+'/';
      assert.ok(notifications[0].urlList.includes(origin+path),'changed related service copy is notified');
      const html=await (await fetch(path)).text();
      const related=html.match(/<section[^>]*data-related-services[^>]*>([\s\S]*?)<\/section>/)?.[1]??'';
      assert.ok(related.includes(edited.content.translations.pl.services[0].title),'related anchor uses saved owner title');
      assert.ok(related.includes(edited.content.translations.pl.services[0].lead),'related context uses saved owner lead');
    }
    for(const locale of ['pl','en'])assert.ok((await (await fetch('/'+locale+'/')).text()).includes(edited.content.translations[locale].home.title),'localized CMS edit '+locale);
    assert.ok((await (await fetch('/pl/portfolio/300/')).text()).includes('Narożnik — zmieniony opis'));
    const updatedService=await (await fetch('/pl/services/upholstery/')).text();
    assert.ok(updatedService.includes('Opis przygotowania &lt;script&gt;alert(1)&lt;/script&gt;'));
    assert.ok(!updatedService.includes('<script>alert(1)</script>'));
    assert.ok((await (await fetch('/ru/services/upholstery/')).text()).includes(original.content.services[0].preparation),'guidance edits stay in their language');
    for(const locale of locales)assert.equal((await fetch('/'+locale+'/portfolio/301/')).status,404,'shared visibility');
    assert.equal(((await (await fetch('/sitemap.xml')).text()).match(/<url>/g)||[]).length,999);
    const publicHome=await (await fetch('/ru/')).text();assert.match(publicHome,/&lt;script&gt;alert\(1\)&lt;\/script&gt;/);assert.ok(!publicHome.includes('<script>alert(1)</script>'));
    assert.equal((await fetch('/ru/portfolio/301/')).status,404);
    const beforeStaleNoticeCount=notifications.length;const beforeStaleBackup=await db.prepare('SELECT * FROM automation_backup').first();
    assert.equal((await write(edited)).status,409,'stale write is rejected');
    assert.equal(notifications.length,beforeStaleNoticeCount,'rejected edits do not notify search engines');assert.deepEqual(await db.prepare('SELECT * FROM automation_backup').first(),beforeStaleBackup,'stale writes cannot overwrite backup');
    const other=structuredClone(snapshot);other.content.home.note='Другая версия';const simultaneous=await Promise.all([write(snapshot),write(other)]);assert.deepEqual(simultaneous.map(r=>r.status).sort(),[200,409]);
    snapshot=await (await fetch('/api/content/',{headers:owner})).json();assert.equal(snapshot.revision,2);await verifyBackup(snapshot);
    const firstHistory=await (await fetch('/api/history/?revision=1',{headers:owner})).json();assert.equal(firstHistory.content.home.title,edited.content.home.title);assert.equal(firstHistory.content.translations.pl.home.title,edited.content.translations.pl.home.title);
    const malformedUpload=await fetch('/api/upload/',{method:'POST',headers:{...owner,Origin:origin,'Content-Type':'multipart/form-data; boundary=missing-photo-boundary'},body:'broken multipart body'});
    assert.equal(malformedUpload.status,400,'malformed photo upload is a client error, not a storage outage');
    assert.equal(typeof(await malformedUpload.json()).error,'string');
    const inputImage=await readFile('public/images/responsive/301-720.webp');
    const form=new FormData();form.append('image',new Blob([inputImage],{type:'image/webp'}),'photo.webp');form.append('thumbnail',new Blob([inputImage],{type:'image/webp'}),'thumb.webp');form.append('width','720');form.append('height','405');
    const uploadRequest=new Request(origin+'/api/upload/',{method:'POST',headers:{...owner,Origin:origin},body:form});
    const upload=await fetch('/api/upload/',{method:'POST',headers:Object.fromEntries(uploadRequest.headers),body:await uploadRequest.arrayBuffer()});assert.equal(upload.status,200,await upload.clone().text());const media=await upload.json();assert.match(media.id,/^[a-f0-9-]{36}$/);
    const imageResponse=await fetch(media.image);assert.equal(imageResponse.status,200);assert.equal(imageResponse.headers.get('Content-Type'),'image/webp');assert.equal((await imageResponse.arrayBuffer()).byteLength,inputImage.length);
    assert.equal((await fetch(media.image,{headers:{'If-None-Match':imageResponse.headers.get('ETag')}})).status,304);
    snapshot.content.works.push({...media,title:'Новая фотография',description:'Описание новой фотографии',date:'',category:'custom',source:'',visible:true,featured:false,order:0});
    const uploadSaved=await write(snapshot);assert.equal(uploadSaved.status,200);snapshot=await uploadSaved.json();assert.equal((await fetch('/ru/portfolio/'+media.id+'/')).status,200);
    await mf.dispose();mf=new Miniflare(options());
    const persisted=await (await fetch('/api/content/',{headers:owner})).json();assert.equal(persisted.revision,3);assert.equal(persisted.content.translations.pl.works['300'].title,'Narożnik — zmieniony opis');assert.ok(persisted.content.translations.en.works[media.id].title.startsWith('Work no. '));assert.equal(persisted.content.works.length,300);assert.equal(persisted.content.works.find(work=>work.id==='302').order,1000,'owner can reorder new photographs');assert.equal(persisted.content.works.find(work=>work.id==='309').order,0);assert.equal((await fetch(media.image)).status,200,'R2 survives restart');
    persisted.content=original.content;const restored=await write(persisted);assert.equal(restored.status,200);snapshot=await restored.json();assert.equal(snapshot.revision,4);assert.equal((await fetch('/ru/portfolio/301/')).status,200);
    const list=await (await fetch('/api/history/',{headers:owner})).json();assert.deepEqual(list.map(r=>r.revision),[4,3,2,1]);
    // The reference library works on every locale, and filters do not create indexable duplicates.
    assert.equal(snapshot.content.library.length,7);
    for(const locale of locales){
      const html=await (await fetch('/'+locale+'/library/')).text();assert.equal((html.match(/class="book-card"/g)||[]).length,7);assert.ok(html.includes('href="'+origin+'/'+locale+'/library/"'));
      for(const book of snapshot.content.library){const response=await fetch('/'+locale+'/library/'+book.id+'/');assert.equal(response.status,200);const html=await response.text();assert.ok(html.includes(book.descriptions[locale]));assert.ok(html.includes(book.sourceUrl));assert.equal((html.match(/class="brand-logo"/g)||[]).length,2);}
    }
    const plBooks=await (await fetch('/pl/library/?language=pl')).text();assert.equal((plBooks.match(/class="book-card"/g)||[]).length,4);assert.match(plBooks,/noindex/);
    const ruBooks=await (await fetch('/ru/library/?language=ru')).text();assert.equal((ruBooks.match(/class="book-card"/g)||[]).length,3);
    const noBooks=await (await fetch('/ru/library/?q=not-found-forever')).text();assert.ok(noBooks.includes('Материалы не найдены'));
    assert.equal((await fetch('/pl/library/missing/')).status,404);
    const unsupportedUpload=await fetch('/api/library-upload/');
    assert.equal(unsupportedUpload.status,405);
    assert.equal(unsupportedUpload.headers.get('allow'),'POST');
    assert.equal((await fetch('/api/upload/')).status,405);
    const missingApi=await fetch('/api/not-an-endpoint/');assert.equal(missingApi.status,404);assert.match(missingApi.headers.get('content-type'),/application\/json/);
    assert.equal((await fetch('/media/not-a-route/')).status,404);
    assert.equal((await fetch('/library/')).headers.get('Location'),'/ru/library/');
    const firstWork=await (await fetch('/ru/portfolio/302/')).text();assert.match(firstWork,/class="photo-arrow arrow-previous"[^>]*href="\/ru\/portfolio\/2\/"/);assert.match(firstWork,/class="photo-arrow arrow-next"[^>]*href="\/ru\/portfolio\/303\/"/);assert.ok(firstWork.includes('/ru/portfolio/303/#viewer'));assert.ok(firstWork.includes('id="photo-viewer"'));assert.match(firstWork,/data-full-src=/);assert.match(firstWork,/srcset="[^"]*302-360.webp/);
    // PDF uploads are owner-only and private until a visible, licensed entry is saved.
    const pdfBytes=Buffer.from('%PDF-1.4\n1 0 obj\n<< /Type /Catalog >>\nendobj\ntrailer\n<< /Root 1 0 R >>\n%%EOF\n');
    const uploadPdf=async({headers=owner,payload=pdfBytes,type='application/pdf',rights='original',note='Мой авторский материал, разрешаю публикацию.',confirmed='yes',originHeader=origin}={})=>{
      const form=new FormData();form.append('file',new Blob([payload],{type}),'Книга.pdf');form.append('rights',rights);form.append('rightsNote',note);form.append('confirmed',confirmed);
      const request=new Request(origin+'/api/library-upload/',{method:'POST',headers:{...headers,Origin:originHeader},body:form});
      return fetch('/api/library-upload/',{method:'POST',headers:Object.fromEntries(request.headers),body:await request.arrayBuffer()});
    };
    assert.equal((await uploadPdf({headers:{}})).status,401);assert.equal((await uploadPdf({headers:forbidden})).status,403);assert.equal((await uploadPdf({originHeader:'https://bad.example'})).status,403);
    assert.equal((await uploadPdf({payload:Buffer.from('<html>not a PDF</html>')})).status,415);assert.equal((await uploadPdf({rights:'source-only'})).status,422);assert.equal((await uploadPdf({confirmed:''})).status,422);
    assert.equal((await uploadPdf({payload:Buffer.alloc(20*1024*1024+1)})).status,413);
    const uploadBook=await uploadPdf();assert.equal(uploadBook.status,201,await uploadBook.clone().text());const file=await uploadBook.json();
    const filePath='/library-files/'+file.id+'/';assert.equal((await fetch(filePath)).status,404);assert.equal((await fetch(filePath,{headers:forbidden})).status,404);assert.equal((await fetch(filePath,{headers:owner})).status,200);
    const book={...snapshot.content.library[0],id:'translation-test',title:'Подготовка элементов мягкой мебели — перевод',author:'Klim & Co',language:'ru',fileId:file.id,sourceUrl:'',externalDownloadUrl:'',rights:'original',rightsNote:'Авторский тестовый материал для проверки хранилища.',translationOf:snapshot.content.library[0].id,translator:'Klim & Co',descriptions:{pl:'Autorski materiał próbny pracowni Klim & Co.',ru:'Авторский пробный материал мастерской Klim & Co.',be:'Аўтарскі пробны матэрыял майстэрні Klim & Co.',uk:'Авторський пробний матеріал майстерні Klim & Co.'},visible:true};
    const fileNotFound=structuredClone(snapshot);fileNotFound.content.library.push({...book,fileId:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'});assert.equal((await write(fileNotFound)).status,422);
    const noRights=structuredClone(snapshot);noRights.content.library.push({...book,rights:'source-only'});assert.equal((await write(noRights)).status,422);
    const invalidBookUrl=structuredClone(snapshot);invalidBookUrl.content.library[0].sourceUrl='javascript:alert(1)';assert.equal((await write(invalidBookUrl)).status,422);
    const cycle=structuredClone(snapshot);cycle.content.library[0].translationOf=cycle.content.library[0].id;assert.equal((await write(cycle)).status,422);
    snapshot.content.library.push(book);const savedBook=await write(snapshot);assert.equal(savedBook.status,200,await savedBook.clone().text());snapshot=await savedBook.json();
    const download=await fetch(filePath);assert.equal(download.status,200);assert.equal(download.headers.get('Content-Type'),'application/pdf');assert.match(download.headers.get('Content-Disposition'),/^attachment;/);assert.match(download.headers.get('X-Robots-Tag'),/noindex/);assert.equal(download.headers.get('Cache-Control'),'no-store');assert.deepEqual(Buffer.from(await download.arrayBuffer()),pdfBytes);
    assert.ok((await (await fetch('/pl/library/'+book.translationOf+'/')).text()).includes('/pl/library/translation-test/'));
    assert.ok((await (await fetch('/ru/library/translation-test/')).text()).includes(filePath));
    await mf.dispose();mf=new Miniflare(options());assert.equal((await fetch(filePath)).status,200,'library PDF survives worker restart');snapshot=await (await fetch('/api/content/',{headers:owner})).json();
    snapshot.content.library.find(item=>item.id===book.id).visible=false;const hiddenBook=await write(snapshot);assert.equal(hiddenBook.status,200);snapshot=await hiddenBook.json();assert.equal((await fetch(filePath)).status,404);assert.equal((await fetch('/ru/library/translation-test/')).status,404);assert.equal((await fetch(filePath,{headers:owner})).status,200,'hiding a book keeps its PDF for later use');
    const emptyLibrary=structuredClone(snapshot);emptyLibrary.content.library=[];const cleared=await write(emptyLibrary);assert.equal(cleared.status,200);snapshot=await cleared.json();assert.deepEqual(snapshot.content.library,[],'a deliberately empty library stays empty');assert.ok((await (await fetch('/ru/library/')).text()).includes('Материалы не найдены'));
    const failingDb=await mf.getD1Database('DB');await failingDb.prepare('DROP TABLE site_content').run();
    assert.equal((await fetch('/ru/')).status,503);assert.equal((await fetch('/api/content/',{headers:owner})).status,503);const brokenHealth=await fetch('/api/health/');assert.equal(brokenHealth.status,503);assert.equal((await brokenHealth.json()).checks.content,false);
    assert.equal((await fetch('/robots.txt')).status,200,'robots remains readable during a CMS outage');
    assert.equal((await fetch('/'+verificationFiles[0])).status,200,'ownership verification remains readable during a CMS outage');
  } finally { await mf.dispose(); await rm(state,{recursive:true,force:true}); }
});
