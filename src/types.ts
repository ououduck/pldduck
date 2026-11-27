/**
 * 全站共享数据类型：文章（Post/PostMetadata/PostAuthor）、友链（Friend）与
 * 说说/留言板条目（DiscussionEntry）。
 * 数据源为构建期生成的 JSON（generated/*），客户端数据层（services/*）按本文件契约读写。
 * 说说与留言板自 2026-11 起「一条内容 = 一个 Discussion」（generated/discussions.json），
 * 评论仍由 giscus 按 discussion 编号承载。
 */
export interface PostAuthor {
  name: string;
  avatar?: string;
  role?: string;
  bio?: string;
  url?: string;
}

interface ImageDimensions {
  width: number;
  height: number;
}

export interface PostMetadata {
  id: string;
  title: string;
  excerpt: string;
  date: string;
  updatedAt?: string;
  authors?: PostAuthor[];
  tags: string[];
  filePath: string;
  searchText?: string;
  coverImage?: string;
  coverWidth?: number;
  coverHeight?: number;
  imageDimensions?: Record<string, ImageDimensions>;
  readTime: string;
  wordCount?: number;
  /** Giscus 评论数：构建期快照（generated/posts.json 注入），无数据时为 undefined（页面不展示）。 */
  commentCount?: number;
  featured?: boolean;
  'featured-top'?: number;
  series?: boolean;
  seriesName?: string;
  seriesOrder?: number;
}

export interface Post extends PostMetadata {
  content: string;
}

export interface Friend {
  name: string;
  description: string;
  avatar: string;
  url: string;
  /** 友链页面地址（对方站点上挂着本站链接的那个页面，如 https://xxx.com/links）。
   *  由站长在 Pages CMS 里维护；每周反链巡检优先检测它，为空时回落 `url`（站点首页）。
   *  前端只透传、不渲染（见 ai-rules/friends.md 规则 17）。 */
  backlinkUrl?: string;
  /** 已失联标记：由友链失联巡检（.github/workflows/friend-availability-audit.yml）每日双向同步，
   *  Pages CMS 里的手工勾选会被下一轮巡检覆写；未配置（缺失/false）默认视为正常，
   *  true 时在友链页归入「已失联的博客」板块。前端只读。 */
  unavailable?: boolean;
}

/**
 * 一条说说 / 一份留言（= GitHub Discussions 里的一条 Discussion）。
 *
 * 为什么一条内容一个 Discussion：GitHub 的邮件通知是 **Discussion 级**的 ——
 * 谁在某条 discussion 里留过言就会被自动 watch，之后该 discussion 下每条评论都会
 * 给他发邮件，且没有 per-reply 订阅可配（giscus 也没有）。单帖单 Discussion 之后，
 * 访客只会收到自己参与过的那一条的通知（2026-11 用户反馈修复）。
 */
export interface DiscussionEntry {
  /** Discussion 编号（详情路由与 giscus 的 mapping=number 都用它）。 */
  number: number;
  title: string;
  /** Markdown 原文（详情页渲染）。 */
  body: string;
  /** 构建期算好的单行摘要（列表页用，避免前端再解析 Markdown）。 */
  excerpt: string;
  /** 正文里的图片地址（只含 http(s) 与站内绝对路径，列表页图片墙用）。 */
  images: string[];
  createdAt: string;
  updatedAt: string;
  author: {
    login: string;
    avatarUrl: string;
    url: string;
  };
  commentCount: number;
  reactionCount: number;
  /** GitHub 上的原始地址（「在 GitHub 查看」入口）。 */
  url: string;
}

/** generated/discussions.json 的形状：两个区域的列表，各自按创建时间倒序。 */
export interface DiscussionLists {
  shuoshuo: DiscussionEntry[];
  guestbook: DiscussionEntry[];
}
