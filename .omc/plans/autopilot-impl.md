# Implementation Plan

## Execution Order (dependency-aware)

### Lane A: Infrastructure (sequential)
1. `npm install @astrojs/sitemap @astrojs/rss` — add integrations
2. Update `astro.config.mjs` — add sitemap integration
3. Create `src/pages/rss.xml.ts` — RSS feed endpoint
4. Create `public/robots.txt` — static file

### Lane B: SEO & Meta (depends on Lane A step 2)
5. Update `BaseLayout.astro` — add OG/Twitter meta tags, canonical URL
6. Add `skip-to-main` link + `aria-current="page"` on nav

### Lane C: New Pages (independent)
7. Create `src/pages/tags/index.astro` — all tags overview
8. Create `src/pages/tags/[tag].astro` — posts by tag
9. Create `src/pages/404.astro` — custom 404
10. Rewrite `src/pages/projects.astro` — dynamic from PROJECTS

### Lane D: Content Enhancements (independent)
11. Add reading time utility to `src/utils/reading-time.ts`
12. Update `PostCard.astro` — show reading time
13. Update `blog/[...slug].astro` — show reading time + updatedDate
14. Update `PostCard.astro` + `blog/[...slug].astro` — make tags clickable links
15. Fix `search.astro` — move scripts inside layout properly
16. Add empty states to `blog/[project].astro` and `index.astro`

## Parallel Execution Strategy

- Lane A (1-4) → then Lane B (5-6) 
- Lane C (7-10) runs in parallel with Lane A
- Lane D (11-16) runs in parallel with everything

## Files to create
- `src/pages/rss.xml.ts`
- `src/pages/tags/index.astro`
- `src/pages/tags/[tag].astro`
- `src/pages/404.astro`
- `src/utils/reading-time.ts`
- `public/robots.txt`

## Files to modify
- `astro.config.mjs`
- `package.json` (via npm install)
- `src/layouts/BaseLayout.astro`
- `src/components/PostCard.astro`
- `src/pages/blog/[...slug].astro`
- `src/pages/blog/[project].astro`
- `src/pages/index.astro`
- `src/pages/projects.astro`
- `src/pages/search.astro`
- `src/consts.ts` (add SITE_NAV entry for tags)
