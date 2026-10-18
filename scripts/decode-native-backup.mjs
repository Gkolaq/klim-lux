// Input: {manifest: exact automation_backup row, rows: complete automation_backup_chunks rows}.
import {gunzipSync} from 'node:zlib';
import {createHash} from 'node:crypto';
import {writeFile} from 'node:fs/promises';
const output=process.argv[2];if(!output||!output.startsWith('/'))throw new Error('Provide an absolute output path');
let input='';for await(const part of process.stdin){input+=part;if(input.length>2_000_000)throw new Error('Snapshot input too large');}
const {manifest:m,rows}=JSON.parse(input);
if(m?.id!=='main'||m.encoding!=='gzip+base64'||!Number.isInteger(m.revision)||!Number.isInteger(m.chunk_count)||!Array.isArray(rows)||rows.length!==m.chunk_count)throw new Error('Incomplete backup manifest');
const sorted=[...rows].sort((a,b)=>a.ordinal-b.ordinal);
for(let i=0;i<sorted.length;i++)if(sorted[i].ordinal!==i||typeof sorted[i].data!=='string'||sorted[i].data.length>256||!/^[A-Za-z0-9+/]+={0,2}$/.test(sorted[i].data))throw new Error('Missing, duplicate or truncated backup chunk');
const gzip=Buffer.from(sorted.map(c=>c.data).join(''),'base64');
if(gzip.length!==m.gzip_bytes)throw new Error('Compressed backup size mismatch');
const plain=gunzipSync(gzip,{maxOutputLength:1_200_000}),sha256=createHash('sha256').update(plain).digest('hex');
if(plain.length!==m.json_bytes||sha256!==m.sha256)throw new Error('Backup checksum mismatch');
const data=JSON.parse(plain);
if(data.format!=='klim-lux-content-v1'||data.revision!==m.revision||data.exportedAt!==m.created_at||!Array.isArray(data.content?.works)||!Array.isArray(data.content?.library))throw new Error('Backup content does not match manifest');
await writeFile(output,plain);
console.log(JSON.stringify({output,verified:true,revision:m.revision,sha256,bytes:plain.length,works:data.content.works.length,library:data.content.library.length}));
