/**
 * 首页：小部件（Bento）布局的个人主页。
 *
 * 桌面按 6/12 列网格铺满宽度：名片卡（头像 / 名字 / bio / 全站搜索）、访问统计、
 * 推荐阅读、写作档案、联系方式、标签与服务状态各占一张卡片；手机端单列纵向滚动，
 * 一屏一卡地往下看。配色与卡片组件沿用既有 Token（`bg-surface` / `rounded-overlay` /
 * `surface-muted` / `line`），全站深色唯一，不引入新的主题变量。
 *
 * 文案与数字全部来自构建期数据（`siteConfig` / `generated/posts.json`），
 * 渲染期不 fetch、不读时钟、不读随机值：SSG 与水合首帧严格一致。
 * 「访问统计」的三项计数由 `Layout` 的路由级 Vercount 上报回填（见 vercount.ts）。
 */

import { siteConfig } from '@config/site.config';
import { Seo, buildSiteSchemas } from '@/components/Seo';
import { ProfileWidget } from '@/components/home/ProfileWidget';
import { StatsWidget } from '@/components/home/StatsWidget';
import { FeaturedPostsWidget } from '@/components/home/FeaturedPostsWidget';
import { WritingWidget } from '@/components/home/WritingWidget';
import { ContactWidget } from '@/components/home/ContactWidget';
import { TagsWidget } from '@/components/home/TagsWidget';
import { StatusWidget } from '@/components/home/StatusWidget';
import { absoluteSiteUrl } from '@/utils/siteUrl';

// 首页即站主主页（原 /about 的 ProfilePage schema 随页面合并）：url 指向站点根，
// 与 Seo 默认输出的 WebSite schema 同域，isPartOf 显式回指该站点。
const profilePageSchema = {
  '@context': 'https://schema.org',
  '@type': 'ProfilePage',
  name: siteConfig.author.name,
  description: siteConfig.description,
  url: absoluteSiteUrl('/', siteConfig.url),
  inLanguage: 'zh-CN',
  isPartOf: {
    '@type': 'WebSite',
    name: siteConfig.title,
    url: absoluteSiteUrl('/', siteConfig.url),
  },
  mainEntity: {
    '@type': 'Person',
    name: siteConfig.author.name,
    jobTitle: siteConfig.author.role,
    description: siteConfig.author.bio,
    url: absoluteSiteUrl('/', siteConfig.url),
    image: siteConfig.author.avatar,
    sameAs: [siteConfig.social.github],
  },
};

export const Home = () => (
  <>
    <Seo
      title={siteConfig.title}
      description={siteConfig.description}
      // 显式传 structuredData 会替换掉 Seo 的默认站点 schema，因此站点级两条要自己带上；
      // 描述沿用 Seo 对首页的覆盖规则（seoHomeDescription 优先），保证产物逐字不变。
      structuredData={[...buildSiteSchemas(siteConfig.seoHomeDescription || siteConfig.description), profilePageSchema]}
    />

    <div className="home-page mx-auto w-full max-w-[110rem] py-1 sm:py-2">
      <div className="home-widgets">
        <ProfileWidget />
        <StatsWidget />
        <FeaturedPostsWidget />
        <WritingWidget />
        <ContactWidget />
        <TagsWidget />
        <StatusWidget />
      </div>
    </div>
  </>
);
