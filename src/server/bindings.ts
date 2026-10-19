export interface Statement {
  bind(...values: unknown[]): Statement;
  first<T = Record<string, unknown>>(): Promise<T | null>;
  all<T = Record<string, unknown>>(): Promise<{ results: T[] }>;
  run(): Promise<{ meta: { changes: number } }>;
}
export interface Database { prepare(sql: string): Statement; batch<T = { meta: { changes: number } }>(statements: Statement[]): Promise<T[]>; }
export interface BucketObject { body: ReadableStream; httpEtag: string; httpMetadata?: { contentType?: string }; }
export interface Bucket {
  put(key: string, value: ArrayBuffer, options: { httpMetadata: { contentType: string } }): Promise<unknown>;
  get(key: string): Promise<BucketObject | null>;
  delete(keys: string[]): Promise<void>;
}
export interface Bindings {
  DB: Database; BUCKET: Bucket; EDITOR_EMAILS?: string; GA4_MEASUREMENT_ID?: string;
  RESEND_API_KEY?: string; RESEND_FROM?: string; CONTACT_EMAIL_ENABLED?: string;
}
