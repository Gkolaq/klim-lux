// Baseline only. A non-empty production database must use its current snapshot instead.
import {createRequire} from 'node:module';
import {writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {createHash} from 'node:crypto';
const output=process.argv[2];if(!output||!output.startsWith('/'))throw new Error('Provide an absolute output path');
const require=createRequire(import.meta.url),wranglerRequire=createRequire(require.resolve('wrangler/package.json'));
const {build}=wranglerRequire('esbuild');
const result=await build({stdin:{contents:"export {DEFAULT_CONTENT as default} from './src/data/content.ts'",resolveDir:process.cwd(),sourcefile:'baseline-export.ts'},bundle:true,platform:'node',format:'esm',write:false,logLevel:'silent'});
const {default:content}=await import('data:text/javascript;base64,'+Buffer.from(result.outputFiles[0].contents).toString('base64'));
const text=JSON.stringify({format:'klim-lux-content-v1',revision:0,exportedAt:new Date().toISOString(),content},null,2)+'\n';
await writeFile(resolve(output),text);
console.log(JSON.stringify({output:resolve(output),source:'source_default_revision_0',bytes:Buffer.byteLength(text),sha256:createHash('sha256').update(text).digest('hex'),works:content.works.length,library:content.library.length}));
