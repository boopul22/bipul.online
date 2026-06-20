// @ts-check
import { defineConfig } from 'astro/config';

import tailwindcss from '@tailwindcss/vite';
import cloudflare from '@astrojs/cloudflare';

// https://astro.build/config
// Pages are prerendered (static) by default; only routes that export
// `prerender = false` (e.g. /api/traffic) run on-demand on Cloudflare.
export default defineConfig({
  output: 'static',
  adapter: cloudflare({
    // Lets `astro dev` read Cloudflare env (.dev.vars / wrangler) so the
    // live GA endpoint works locally too.
    platformProxy: { enabled: true },
  }),
  vite: {
    plugins: [tailwindcss()]
  }
});