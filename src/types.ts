/**
 * 全站共享数据类型：文章（Post/PostMetadata/PostAuthor）与友链（Friend）。
 * 数据源为构建期生成的 JSON（generated/*），客户端数据层（services/*）按本文件契约读写。
 * 说说改由 giscus 承载（config/comments.config.json.shuoshuo.discussionId），无独立类型。
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
  category: string;
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
  /** 已失联标记：由友链失联巡检（.github/workflows/friend-availability-audit.yml）每日双向同步，
   *  Pages CMS 里的手工勾选会被下一轮巡检覆写；未配置（缺失/false）默认视为正常，
   *  true 时在友链页归入「已失联的博客」板块。前端只读。 */
  unavailable?: boolean;
}
