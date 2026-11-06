import { defineConfig } from 'astro/config';

export default defineConfig({
  site: 'https://iglesia238.com',
  compressHTML: true,
  build: {
    assets: '_astro',
  },
});
