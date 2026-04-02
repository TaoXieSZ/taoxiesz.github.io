# 谢韬的工作台博客

URL: https://taoxiesz.github.io/

这是一个基于 **Astro + GitHub Pages** 的个人博客骨架，目标很明确：

- 轻
- 稳
- 可长期维护
- 发布链路可验证

## 技术栈

- Astro
- Markdown 内容目录
- GitHub Actions
- GitHub Pages

## 本地开发

```bash
cd blog
npm install
npm run dev
```

## 构建

```bash
cd blog
npm run build
```

## 目录结构

```text
blog/
├── src/
│   ├── components/
│   ├── content/blog/
│   ├── layouts/
│   └── pages/
├── public/
└── .github/workflows/deploy.yml
```

## 上线前要改的两处

### 1. 站点地址
修改 `astro.config.mjs`：

```js
site: 'https://你的用户名.github.io'
```

### 2. 常量配置
修改 `src/consts.ts`：

- 站点标题
- 描述
- `SITE_URL`

## 内容写作

文章放在：

- `src/content/blog/*.md`

每篇文章需要 frontmatter，例如：

```md
---
title: 文章标题
description: 一句话摘要
pubDate: 2026-03-23
author: 谢韬
tags:
  - astro
  - blog
---

正文内容。
```

## 部署说明

这个仓库附带了 GitHub Pages Actions 工作流：

- push 到 `main`
- 自动安装依赖
- 自动构建 `blog/dist`
- 自动部署到 Pages

## 建议的仓库命名

如果这是你的个人站点仓库，建议直接命名成：

- `你的 GitHub 用户名.github.io`

这样默认就是标准个人主页地址。
