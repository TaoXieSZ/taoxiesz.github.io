import { defineConfig } from 'astro/config';

export default defineConfig({
  site: 'https://taoxiesz.github.io',
  output: 'static',
  markdown: {
    shikiConfig: {
      themes: {
        light: 'github-light',
        dark: 'github-dark'
      }
    }
  }
});
