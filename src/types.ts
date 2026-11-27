/**
 * 全站共享数据类型：文章（Post/PostMetadata/PostAuthor）、友链（Friend）与
 * 说说（ShuoShuo）。
 * 数据源为构建期生成的 JSON（generated/*），客户端数据层（services/*）按本文件契约读写。
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
 * 说说（短动态）：类似朋友圈的一句话内容，正文为 Markdown，images 为可选九宫格图片。
 * 数据源是 shuoshuo/*.md（Pages CMS「说说」集合），构建期解析为 generated/shuoshuo.json。
 */
export interface ShuoShuo {
  /** URL 标识，同时是 /shuoshuo/<id> 的路径段（仅字母、数字、下划线、短横线）。 */
  id: string;
  /** 发布日期（YYYY-MM-DD）。 */
  date: string;
  /** 九宫格图片地址（http(s) 或站内绝对路径），可为空。 */
  images?: string[];
  /** Markdown 正文。 */
  content: string;
  /** 源文件路径（如 /shuoshuo/hello-shuoshuo.md），供「在 GitHub 上编辑」类入口使用。 */
  filePath: string;
}
