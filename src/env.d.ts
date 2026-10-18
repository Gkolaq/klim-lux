/// <reference types="astro/client" />

declare module 'cloudflare:workers' {
  export const env: import('./server/bindings').Bindings;
}
declare namespace App {
  interface Locals {
    snapshot: import('./server/content-store').Snapshot;
    storageError?: boolean;
    locale: import('./i18n/locales').Locale;
    content: import('./data/content').Content;
  }
}
