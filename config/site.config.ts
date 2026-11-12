/**
 * 站点配置。
 *
 * 数据源是同目录下的两份 JSON —— 拆分只为 PagesCMS 编辑体验（站点基础信息 / 评论与留言板），
 * 对外仍是**单一合并对象**：`siteConfig.comments` / `siteConfig.guestbook` 的访问方式
 * 与拆分前完全一致，消费方无需感知文件边界。保存即推送仓库生效，无需改动代码。
 * 本文件仅负责加载 JSON 并提供类型约束：JSON 缺字段/类型不符会在
 * `npm run typecheck` 时直接报错（fail-fast）。
 *
 * 构建脚本侧（sitemap / RSS / SSG / SEO 审计）通过 scripts/site-config-loader.mjs
 * 读取同一批 JSON 并做同样的合并，保证客户端与构建期配置一致。
 */
import siteConfigJson from './site.config.json';
import commentsConfigJson from './comments.config.json';

export interface SiteAuthor {
  name: string;
  avatar: string;
  role: string;
  bio: string;
}

export interface SiteSocial {
  github: string;
  email: string;
  rawEmail: string;
  /** QQ 号（纯数字文本，首页「联系方式」的 QQ 二维码悬浮层里展示；不配置则不展示该行）。 */
  qq?: string;
  /**
   * QQ 二维码图片地址（站内路径或完整 URL）。首页 QQ 入口在鼠标悬停或手机点击时，于按钮上方
   * 弹出二维码小悬浮层；与 `qq` 必须同时存在才渲染，留空则整个 QQ 入口不展示。
   */
  qqQrCode?: string;
}

export interface SiteToc {
  collapseInactiveRootBranches?: boolean;
}

export interface SiteComments {
  repo: string;
  repoId: string;
  category: string;
  categoryId: string;
  /**
   * giscus 脚本/iframe/API 来源（有序回退链的「首选来源」）。
   * 默认直连官方 https://giscus.app（已移除站点同源代理边缘函数）。
   * 大陆网络下 giscus.app 被 DNS 污染/阻断，评论区可能无法加载；
   * 如需大陆可用的评论，可改为自托管 giscus 实例或可达镜像的完整 URL。
   * 注意：GitHub OAuth 登录回调固定指向 giscus.app，大陆网络下无法完成登录。
   */
  origin?: string;
  /**
   * 严格匹配（data-strict）：true 时按「正文 SHA-1 哈希」搜索 Discussion（新讨论由
   * giscus 自动附带哈希标记）；false 时按「标题」搜索并允许评论时自动创建讨论。
   * 注意：历史已存在的 Discussion 正文没有哈希标记时，严格匹配会搜不到（评论不显示），
   * 因此本仓库关闭严格匹配（现有讨论按标题 pathname 直接命中）。
   */
  strict?: boolean;
}

export interface SiteGuestbook {
  discussionId: number;
}

export interface SiteShuoShuo {
  /** 承载「说说」的 GitHub Discussion 编号（公告分类下，每条评论 = 一条说说）。 */
  discussionId: number;
}

export interface SiteFriendsPage {
  repoUrl: string;
  repoFriendsUrl: string;
  /** 友链申请入口：GitHub Issue 表单（template=friend-link-application.yml）。 */
  applyUrl: string;
}

export interface SiteContent {
  /** 文章源文件所在仓库（用于"在 GitHub 上编辑此文"跳转）。默认回退 friendsPage.repoUrl。 */
  repoUrl?: string;
  /** 文章源文件所在分支，默认 main。 */
  defaultBranch?: string;
}

export interface SiteConfig {
  title: string;
  subtitle: string;
  /** 站点头条：首页 <title> 与 og:title 使用（含关键词，利于首页排名）。 */
  seoHomeTitle?: string;
  /** 首页 SEO 描述：仅用于 meta description / og:description / twitter:description 与站点级 schema，
      不改变页面可见文案（首页 Hero 与页脚可见文案仍使用 description）。 */
  seoHomeDescription?: string;
  description: string;
  logo: string;
  logoSmall: string;
  /** 社交分享卡片（1200×630，1.91:1），构建期生成于 public/og-card.png。 */
  seoImage: string;
  footerText: string;
  url: string;
  /**
   * 服务状态页地址（Better Stack 自定义状态页）：侧栏底部「服务状态」入口的跳转目标。
   * 只接受 https 绝对地址，非法时前端回退到按站点域名约定的默认值；
   * 构建期可用 VITE_BETTERSTACK_STATUS_PAGE_URL 覆盖本项。
   * 这是公开配置项，**禁止**在此写入任何 API Token（Token 只存在于 Worker Secret）。
   */
  statusPageUrl?: string;
  social: SiteSocial;
  author: SiteAuthor;
  toc?: SiteToc;
  /** 是否启用 Giscus（文章评论区 + 留言板统一开关）。 */
  giscusEnabled?: boolean;
  comments: SiteComments;
  guestbook: SiteGuestbook;
  /** 说说数据源：giscus 内嵌锁定的公告 Discussion（来自 config/comments.config.json 的 shuoshuo 段）。 */
  shuoshuo: SiteShuoShuo;
  friendsPage: SiteFriendsPage;
  /** 文章内容仓库（"在 GitHub 上编辑此文"/查看源文件入口使用）。 */
  content?: SiteContent;
}

/** 两份 JSON 合并后的站点配置：与拆分前逐键同形。 */
export const siteConfig: SiteConfig = {
  ...siteConfigJson,
  ...commentsConfigJson,
};
