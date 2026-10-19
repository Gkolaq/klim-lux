import { readFile, writeFile, mkdir, cp } from 'node:fs/promises';

// Astro's standard Worker export stays intact; Sites expects this filename.
await writeFile('dist/server/index.js', "export { default } from './entry.mjs';\n");
const config=JSON.parse(await readFile('dist/server/wrangler.json','utf8'));
config.main='index.js';
if(config.kv_namespaces?.length || config.images) throw new Error('Unexpected runtime binding: only DB, BUCKET and ASSETS are supported by this project.');
await writeFile('dist/server/wrangler.json',JSON.stringify(config,null,2)+'\n');
await mkdir('dist/.openai',{recursive:true});
await cp('.openai/hosting.json','dist/.openai/hosting.json');
await cp('drizzle','dist/.openai/drizzle',{recursive:true});
