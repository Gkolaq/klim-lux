import type {Content} from '../data/content';
import type {Database,Statement} from './bindings';

export interface EncodedBackup { sha256:string; jsonBytes:number; gzipBytes:number; chunks:string[]; }
export async function encodeBackup(content:Content,revision:number,exportedAt:string):Promise<EncodedBackup>{
  const plain=new TextEncoder().encode(JSON.stringify({format:'klim-lux-content-v1',revision,exportedAt,content}));
  const sha256=[...new Uint8Array(await crypto.subtle.digest('SHA-256',plain))].map(n=>n.toString(16).padStart(2,'0')).join('');
  const gzip=new Uint8Array(await new Response(new Blob([plain]).stream().pipeThrough(new CompressionStream('gzip'))).arrayBuffer());
  let binary='';for(let i=0;i<gzip.length;i+=8192)binary+=String.fromCharCode(...gzip.subarray(i,i+8192));
  const base64=btoa(binary),chunks:string[]=[];for(let i=0;i<base64.length;i+=256)chunks.push(base64.slice(i,i+256));
  return {sha256,jsonBytes:plain.length,gzipBytes:gzip.length,chunks};
}
export function backupStatements(db:Database,backup:EncodedBackup,revision:number,now:string):Statement[]{
  const gate='EXISTS (SELECT 1 FROM site_content WHERE id = ? AND revision = ? AND backup_sha256 = ?)';
  const args=['main',revision,backup.sha256];
  const statements=[
    db.prepare('DELETE FROM automation_backup_chunks WHERE '+gate).bind(...args),
    db.prepare('INSERT INTO automation_backup (id,revision,sha256,encoding,json_bytes,gzip_bytes,chunk_count,created_at) SELECT ?,?,?,?,?,?,?,? WHERE '+gate+' ON CONFLICT(id) DO UPDATE SET revision=excluded.revision,sha256=excluded.sha256,encoding=excluded.encoding,json_bytes=excluded.json_bytes,gzip_bytes=excluded.gzip_bytes,chunk_count=excluded.chunk_count,created_at=excluded.created_at').bind('main',revision,backup.sha256,'gzip+base64',backup.jsonBytes,backup.gzipBytes,backup.chunks.length,now,...args),
  ];
  for(let start=0;start<backup.chunks.length;start+=64){
    const part=backup.chunks.slice(start,start+64);
    statements.push(db.prepare('INSERT INTO automation_backup_chunks (ordinal,data) SELECT CAST(key AS INTEGER)+?,value FROM json_each(?) WHERE '+gate).bind(start,JSON.stringify(part),...args));
  }
  return statements;
}
