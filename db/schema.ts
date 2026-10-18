import { sqliteTable, text, integer, index } from 'drizzle-orm/sqlite-core';

export const libraryUploads=sqliteTable('library_uploads',{
  id:text('id').primaryKey(),fileKey:text('file_key').notNull(),fileName:text('file_name').notNull(),mime:text('mime').notNull(),bytes:integer('bytes').notNull(),sha256:text('sha256').notNull(),createdAt:text('created_at').notNull(),createdBy:text('created_by').notNull(),
},table=>[index('library_created_at_idx').on(table.createdAt)]);

export const content = sqliteTable('site_content', {
  id: text('id').primaryKey(),
  revision: integer('revision').notNull(),
  payload: text('payload').notNull(),
  updatedAt: text('updated_at').notNull(),
  updatedBy: text('updated_by').notNull(),
  backupSha256: text('backup_sha256'),
});
// Small cells let the owner's native database reader export a complete snapshot.
export const automationBackup=sqliteTable('automation_backup',{
  id:text('id').primaryKey(),revision:integer('revision').notNull(),sha256:text('sha256').notNull(),
  encoding:text('encoding').notNull(),jsonBytes:integer('json_bytes').notNull(),gzipBytes:integer('gzip_bytes').notNull(),
  chunkCount:integer('chunk_count').notNull(),createdAt:text('created_at').notNull(),
});
export const automationBackupChunks=sqliteTable('automation_backup_chunks',{
  ordinal:integer('ordinal').primaryKey(),data:text('data').notNull(),
});
export const history = sqliteTable('content_history', {
  revision: integer('revision').primaryKey(),
  payload: text('payload').notNull(),
  createdAt: text('created_at').notNull(),
  createdBy: text('created_by').notNull(),
});
export const uploads = sqliteTable('media_uploads', {
  id: text('id').primaryKey(),
  imageKey: text('image_key').notNull(),
  thumbnailKey: text('thumbnail_key').notNull(),
  mime: text('mime').notNull(),
  width: integer('width').notNull(),
  height: integer('height').notNull(),
  bytes: integer('bytes').notNull(),
  createdAt: text('created_at').notNull(),
  createdBy: text('created_by').notNull(),
}, table => [index('media_created_at_idx').on(table.createdAt)]);
