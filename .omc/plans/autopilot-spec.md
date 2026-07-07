# Autopilot Spec: 博客优化

## 目标

将博客从"能用的骨架"升级为"功能完整、体验专业的个人技术博客"。

## 现状分析

- Astro 5 静态站，12 篇文章，5 个项目分类
- 视觉设计已有个性（IBM Plex 字体、Clawd 吉祥物、暖色调）
- 缺少博客标配功能：RSS、Sitemap、社交分享标签、标签页、阅读时间、404 页面

## 功能需求

### P0 — 必须有（博客标配）

1. **RSS/Atom Feed** — `/rss.xml`，让读者可以订阅
2. **Sitemap** — `/sitemap-index.xml`，SEO 基础
3. **OG + Twitter 社交标签** — 分享链接时有标题/描述/图片预览
4. **robots.txt** — 搜索引擎爬虫指引
5. **404 页面** — 自定义错误页

### P1 — 应该有（体验提升）

6. **标签归档页** — `/tags/` 列出所有标签，`/tags/[tag]/` 展示该标签下的文章
7. **阅读时间** — 在文章卡片和详情页显示预计阅读时长
8. **显示 updatedDate** — 文章有更新时间则显示
9. **Fix search.astro** — 将 Pagefind 脚本移入 BaseLayout 正确位置

### P2 — 锦上添花（统一性）

10. **统一 projects 页面** — 从 PROJECTS 常量动态生成，链接到 `/blog/[project]/`
11. **空状态处理** — 项目无文章时显示友好提示
12. **可访问性** — `aria-current="page"`、skip-to-main link、reduced-motion 完善

## 约束

- 不改变现有视觉风格（保持 IBM Plex + 暖色调 + Clawd）
- 不引入 JS 框架（纯 Astro 组件）
- 构建后仍为纯静态站，可部署到 GitHub Pages
- 所有新页面使用中文

## 验收标准

- `npm run build` 零错误
- 产出的 `dist/` 包含 rss.xml、sitemap-index.xml、robots.txt
- 所有 12 篇文章在 `/blog` 可见
- 标签可点击，链接到对应归档页
- 分享到社交平台时有 OG 预览
- 404 页面与站点风格统一
