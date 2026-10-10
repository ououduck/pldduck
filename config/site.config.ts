/**
 * 站点配置。
 *
 * 数据源为同目录下的 site.config.json —— 可在 PagesCMS「站点配置」中直接编辑，
 * 保存即推送仓库生效，无需改动代码。本文件仅负责加载 JSON 并提供类型约束：
 * JSON 缺字段/类型不符会在 `npm run typecheck` 时直接报错（fail-fast）。
 *
 * 构建脚本侧（sitemap / RSS / SSG / SEO 审计）通过 scripts/site-config-loader.mjs
 * 读取同一份 JSON，保证客户端与构建期配置一致。
 */
import siteConfigJson from './site.config.json';

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
  /** QQ 号（纯数字文本，首页社交区提供一键复制；不配置则不展示该行）。 */
  qq?: string;
}

/** 首页「站点入口」磁贴：站内路径以 / 开头，外链写完整 URL。 */
export interface PortalEntry {
  title: string;
  description: string;
  url: string;
  /** 图标名，见 src/pages/Home.tsx 的 PORTAL_ICONS；未识别时回退到 Sparkles。 */
  icon: string;
  /** 磁贴右下角的一句话备注，可省略。 */
  note?: string;
}

/** 首页「站点入口」的次级链接（一行小胶囊，不占磁贴位）。 */
export interface PortalLink {
  title: string;
  url: string;
  icon: string;
}

export interface PortalProject {
  title: string;
  description: string;
  url: string;
  tag?: string;
}

/** 首页引导区内容（原 Dworld 主页的清单，合并后由本站首页承载）。 */
export interface SitePortal {
  /** 自我介绍的一句话（Hero 副文案）。 */
  tagline?: string;
  /** 状态徽标文案，如「在线更新中」。 */
  status?: string;
  tags?: string[];
  /** 助记词：解释域名怎么记（pldduck = 跑路的 duck）。 */
  memory?: {
    label: string;
    prompt: string;
    detail: string;
  };
  entries?: PortalEntry[];
  links?: PortalLink[];
  projects?: PortalProject[];
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

export interface SiteFriendsPage {
  repoUrl: string;
  repoFriendsUrl: string;
  repoFriendsDir: string;
  /** 友链申请/修改外部表单地址（Tally）。 */
  applyUrl: string;
}

export interface SiteFeedback {
  /** 站点反馈表单地址（Tally），右侧中下部贴边的反馈侧签点击直达。 */
  url: string;
}

export interface SiteContent {
  /** 文章源文件所在仓库（用于"在 GitHub 上编辑此文"跳转）。默认回退 friendsPage.repoUrl。 */
  repoUrl?: string;
  /** 文章源文件所在分支，默认 main。 */
  defaultBranch?: string;
}

export interface SiteBeian {
  text: string;
  url: string;
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
  social: SiteSocial;
  author: SiteAuthor;
  toc?: SiteToc;
  /** 是否启用 Giscus（文章评论区 + 留言板统一开关）。 */
  giscusEnabled?: boolean;
  comments: SiteComments;
  guestbook: SiteGuestbook;
  friendsPage: SiteFriendsPage;
  /** 站点反馈表单入口（右侧中下部贴边的反馈侧签）。 */
  feedback: SiteFeedback;
  /** 文章内容仓库（"在 GitHub 上编辑此文"/查看源文件入口使用）。 */
  content?: SiteContent;
  beian: SiteBeian;
  /** 首页引导区（站点入口/开源项目/自我介绍）内容。 */
  portal?: SitePortal;
}

export const siteConfig: SiteConfig = siteConfigJson;
