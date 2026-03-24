import { defineConfig } from 'astro/config';

export default defineConfig({
  site: 'https://taoxiesz.github.io',
  output: 'static',
  markdown: {
    shikiConfig: {
      theme: 'github-light'
    }
  }
});
