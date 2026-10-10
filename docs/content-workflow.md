# 内容工作流

内容通过 [PagesCMS](https://pagescms.org/) 管理——基于 Git 的无后端 CMS，直接读写本仓库的
Markdown 与 JSON 文件。编辑后需手动触发部署才会上线（见 [deployment.md](deployment.md)）。

## 新建文章

在 PagesCMS「文章」集合中点击新建，填写 frontmatter：

```yaml
---
id: my-first-post # 对应 /post/:id，全站唯一，不可含空白/斜杠
title: 我的第一篇文章
excerpt: 文章摘要，用于列表展示和 SEO（必填）
date: 2026-03-14
updatedAt: 2026-03-20 # 可选
category: 技术 # 必须在 content.config.json 白名单内
tags: [React, Vite]
coverImage: https://cdn.example.com/cover.png # 可选，图床链接
author: 跑路的duck # 可选，支持对象形式
featured: false # 首页精选展示
featured-top: 1 # 精选置顶排序（仅 featured: true 时生效）
series: false # 是否属于文章系列（series-name / series-order 配套）
draft: false # 草稿不会发布
---
```

封面与正文图片均通过图床（PicGo）托管，直接以图床外链形式写入 Markdown。

**文章 ID 是对外契约**：评论线程按 `/post/<id>` 匹配（`mapping=pathname`），改动 ID 等于换一条
评论区；旧站收录的链接也会一起失效。

## Markdown 增强

- 代码块 `title="文件.ts"` 显示文件名（下载时以此命名）；`diff` 代码块中 `+ / - / @@` 行自动整行高亮；
  长代码块默认折叠为 30 行，工具栏提供「自动换行」，点击行号复制该行。
- 正文图片在深色模式下自动柔和降亮（悬停恢复），`"no-dark"` 可单图豁免。
- 支持 GFM 表格、KaTeX 公式、Mermaid 图表，均按需懒加载。

## 友链申请

友链页展开「申请友链」→ 先添加本站友链 → 登录 GitHub → 填写资料 → 提交 Issue →
Actions 自动校验反链后写入 `friends/`。友链数据为 `friends/*.json`，可在 PagesCMS「友链」集合
直接编辑；勾选「已失联」会为站点写入 `"unavailable": true` 并归入页面的「已失联的博客」板块
（未勾选时默认视为正常访问），恢复上线后取消勾选即可回到主列表。

## 说说

`/shuoshuo` 是类似朋友圈的短动态页，内容存放在 `shuoshuo/*.md`（无需标题），可选 `images`
frontmatter 字段（图片链接数组）以九宫格展示配图。每条说说生成独立静态页 `/shuoshuo/<id>`，
完整 SSR 正文与 SEO 标签，收录进 `sitemap-shuoshuo.xml` 与 `llms.txt`；旧的 `?id=` 定位链接仍兼容。

```yaml
---
id: my-first-shuoshuo # 全站唯一
date: 2026-08-14
images:
  - https://cdn.example.com/photo-1.png
---
今天也是元气满满的一天
```

## 留言板

`/guestbook` 通过 Giscus `mapping=number` 固定指向本仓库的留言板 Discussion
（`config/comments.config.json` 的 `guestbook.discussionId`；该模式下只认讨论编号，标题随意）。
与文章评论共用 Akismet 反垃圾，并叠加自建关键词过滤（`config/comment-keywords.json`，
可在 PagesCMS「评论关键词」中编辑）。

## 文章更新订阅

文章页/关于页可订阅 GitHub Issue（`src/components/IssueSubscriptionCard.tsx`），新文章发布时
`.github/workflows/notify-post-update.yml` 自动在指定 Issue 发布更新通知。

## Giscus 评论

评论区直连官方 <https://giscus.app>（`config/comments.config.json` 的 `comments.origin`）。
大陆网络下 giscus.app 被 DNS 污染/阻断，评论区可能加载失败；可将 `comments.origin` 指向自托管
giscus 实例或可达镜像的完整 URL（前端按「配置来源 → 官方 giscus.app」顺序回退加载）。注意：
GitHub OAuth 登录回调固定指向 `giscus.app`，大陆网络下无法完成登录（读评论、看讨论不受影响）。

文章评论默认 `mapping=pathname` 且 `strict=false`：线程按 `/post/<id>` 匹配，首次访问时自动建讨论。
留言板用 `mapping=number` 精确锁定单条讨论，绝不自动创建。

### 换仓库/换站点的一次性配置

`comments.repo`、`comments.repoId`、`comments.categoryId`、`guestbook.discussionId` 四个值都要跟着换：

1. 在目标仓库 Settings 勾选 **Discussions**，并安装授权 **Giscus GitHub App**（只放行该仓库）；
2. 在 Discussions 页面新建分类（如「文章评论」与「留言板」）——**分类只能在网页端创建**，
   REST 与 GraphQL 都没有开放的建分类接口，脚本建不出来；
3. 回 <https://giscus.app> 选中新仓库与分类，把生成的 `repoId` / `categoryId` 填进
   `config/comments.config.json`；留言板另需在该分类下发一条讨论，取其编号填 `guestbook.discussionId`。
