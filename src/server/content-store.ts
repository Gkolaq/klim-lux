import type { Database } from './bindings';
import { normalizeContent, type Content } from '../data/content';
import { HttpError } from './auth';
import {encodeBackup,backupStatements} from './backup';
import {withPageModifiedDates} from '../seo/pages';

export interface Snapshot { revision: number; content: Content; updatedAt: string | null; }
export async function readContent(db: Database, fallback: Content): Promise<Snapshot> {
  if (!db) throw new Error('DB binding is missing');
  const row = await db.prepare('SELECT revision, payload, updated_at FROM site_content WHERE id = ?').bind('main').first<{revision:number;payload:string;updated_at:string}>();
  return row ? { revision: row.revision, content: normalizeContent(JSON.parse(row.payload)), updatedAt: row.updated_at } : { revision:0, content:structuredClone(fallback), updatedAt:null };
}
// Read a lightweight revision on each public request; reuse only an exact revision.
// Editor/API reads keep their independent mutable snapshots.
const publicSnapshots=new WeakMap<Database,Snapshot>();
export async function readPublicContent(db:Database,fallback:Content):Promise<Snapshot> {
  if(!db)throw new Error('DB binding is missing');
  const marker=await db.prepare('SELECT revision, updated_at FROM site_content WHERE id = ?').bind('main').first<{revision:number;updated_at:string}>();
  const cached=publicSnapshots.get(db);
  if(cached&&cached.revision===(marker?.revision??0)&&cached.updatedAt===(marker?.updated_at??null))return cached;
  const snapshot=marker?await readContent(db,fallback):{revision:0,content:structuredClone(fallback),updatedAt:null};
  publicSnapshots.set(db,snapshot);
  return snapshot;
}
export async function saveContent(db: Database, content: Content, revision: number, user: string, previous?: Content): Promise<Snapshot> {
  const now = new Date().toISOString();
  if(previous)content=withPageModifiedDates(previous,content,now);
  const payload = JSON.stringify(content);
  const backup=await encodeBackup(content,revision+1,now);
  const write = revision === 0
    ? db.prepare('INSERT OR IGNORE INTO site_content (id, revision, payload, updated_at, updated_by,backup_sha256) VALUES (?, ?, ?, ?, ?, ?)').bind('main',1,payload,now,user,backup.sha256)
    : db.prepare('UPDATE site_content SET revision = revision + 1, payload = ?, updated_at = ?, updated_by = ?,backup_sha256 = ? WHERE id = ? AND revision = ?').bind(payload,now,user,backup.sha256,'main',revision);
  // Only the winning write may create a history entry. All statements run atomically in D1.
  const audit = db.prepare('INSERT OR IGNORE INTO content_history (revision, payload, created_at, created_by) SELECT revision, payload, updated_at, updated_by FROM site_content WHERE id = ? AND revision = ? AND payload = ? AND updated_at = ?').bind('main',revision+1,payload,now);
  const prune = db.prepare('DELETE FROM content_history WHERE revision < (SELECT COALESCE(MAX(revision),0) - 49 FROM content_history)');
  const result = await db.batch([write,audit,prune,...backupStatements(db,backup,revision+1,now)]);
  if (result[0].meta.changes === 0) throw new HttpError(409, 'Сайт уже изменён в другой вкладке. Скачайте свои изменения, затем загрузите актуальную версию.');
  return { revision:revision+1, content, updatedAt:now };
}
