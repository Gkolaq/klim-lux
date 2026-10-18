import { defineConfig } from 'astro/config';
import cloudflare from '@astrojs/cloudflare';
import { SITE_URL } from './src/config/site';

export default defineConfig({
  site: SITE_URL,
  output: 'server',
  adapter: cloudflare({ imageService: 'passthrough', inspectorPort: false }),
  session: false,
  trailingSlash: 'always',
  // Preserve spaces between inline elements when upgrading to Astro 7.
  compressHTML: true,
});
