/**
 * 隐私政策页：说明本站使用的本地存储、访问统计、评论服务与联系方式。
 * 内容面向普通访客，不替代针对特定司法辖区的法律意见。
 */

import { Link } from 'react-router-dom';
import { siteConfig } from '@config/site.config';
import { absoluteSiteUrl } from '@/utils/siteUrl';
import { Seo, buildSiteSchemas } from '../components/Seo';

const PRIVACY_DESCRIPTION =
  '跑路的duck 隐私政策：说明本站使用的 Cookie/本地存储、访问统计、Giscus 评论服务、第三方链接与联系渠道。';

const policySections = [
  {
    title: '本站会保存什么',
    paragraphs: [
      '本站是一个静态博客。除了评论所需的 GitHub 登录信息外，本站不要求访客注册账号，也不主动收集姓名、手机号或身份证件等信息。',
      '为记住你的选择与阅读状态，浏览器本地可能保存：Cookie 同意/关闭状态、阅读历史与阅读进度、最近搜索记录、界面偏好（如专注阅读状态）。这些数据保存在你的浏览器中，清理站点数据即可删除。',
    ],
  },
  {
    title: '访问统计',
    paragraphs: [
      '本站可能使用 Microsoft Clarity 了解页面访问行为与设备类型，并使用 Vercount 统计页面访问量与独立访客数，用于改进内容和体验。Vercount 会写入一个有效期为一年的去重 Cookie（vercount_uv_ 前缀，只记录「这台浏览器访问过本站」），统计服务也可能读取匿名标识；它们不会获得你在本站评论中主动填写的正文内容。',
      '统计请求会随页面加载与站内路由切换自动发起，关闭 Cookie 提示只表示本次会话不再展示提示，不会停用统计。如果你不希望被统计，请使用浏览器的隐私/拦截设置（如屏蔽 clarity.ms 与 events.vercount.one 的请求），或谨慎使用本站。',
    ],
  },
  {
    title: '评论与 GitHub',
    paragraphs: [
      '文章评论、留言板和说说使用 Giscus，评论数据实际存储在 GitHub Discussions。发表评论需要登录 GitHub，GitHub 的账号信息与隐私政策由 GitHub 独立处理；本站不接触你的 GitHub 密码。',
      '评论会经过自动化反垃圾与关键词审核（Akismet、关键词过滤），命中规则的内容可能被折叠或删除。',
    ],
  },
  {
    title: '第三方链接',
    paragraphs: [
      '本站包含友链、项目仓库、订阅页等外部链接。离开本站后，目标网站的隐私政策与数据处理方式由该网站负责，请自行阅读其说明。',
    ],
  },
  {
    title: '数据保留与你的选择',
    paragraphs: [
      '浏览器本地数据保留至你主动清理或浏览器回收为止；访问统计与评论数据按对应第三方服务的策略保留。你可以随时清除本站的浏览器存储、退出 GitHub 登录，或通过邮件联系站长处理与本站相关的请求。',
    ],
  },
] as const;

export const Privacy = () => {
  const privacyStructuredData = [
    ...buildSiteSchemas(PRIVACY_DESCRIPTION),
    {
      '@context': 'https://schema.org',
      '@type': 'WebPage',
      name: `隐私政策 | ${siteConfig.title}`,
      description: PRIVACY_DESCRIPTION,
      url: absoluteSiteUrl('/privacy', siteConfig.url),
      inLanguage: 'zh-CN',
      isPartOf: {
        '@type': 'WebSite',
        name: siteConfig.title,
        url: absoluteSiteUrl('/', siteConfig.url),
      },
    },
  ];

  return (
    <div className="mx-auto max-w-3xl pb-12 pt-6 md:pb-20 md:pt-10">
      <Seo title="隐私政策" description={PRIVACY_DESCRIPTION} url="/privacy" structuredData={privacyStructuredData} />

      <header className="rounded-overlay bg-surface p-6 md:p-8">
        <h1 className="font-sans text-4xl font-bold tracking-tight text-content md:text-5xl">隐私政策</h1>
        <p className="mt-4 max-w-xl text-sm leading-7 text-content-muted md:text-base">
          这份说明解释本站如何处理你的浏览器数据、访问统计与评论信息。
        </p>
        <p className="mt-3 text-xs text-content-muted">生效日期：2026-11-12</p>
      </header>

      <article className="mt-4 space-y-4">
        {policySections.map((section) => (
          <section key={section.title} className="rounded-overlay bg-surface p-6 md:p-8">
            <h2 className="font-sans text-xl font-bold text-content md:text-2xl">{section.title}</h2>
            <div className="mt-3 space-y-3 text-sm leading-7 text-content-muted md:text-[15px] md:leading-8">
              {section.paragraphs.map((paragraph) => (
                <p key={paragraph}>{paragraph}</p>
              ))}
            </div>
          </section>
        ))}

        <section className="rounded-overlay bg-surface p-6 md:p-8">
          <h2 className="font-sans text-xl font-bold text-content md:text-2xl">联系</h2>
          <p className="mt-3 text-sm leading-7 text-content-muted md:text-[15px] md:leading-8">
            如对隐私政策或本站数据处理有疑问，可以发邮件到{' '}
            <a
              href={siteConfig.social.email}
              className="font-medium text-content underline decoration-line underline-offset-4 transition-colors hover:decoration-content"
            >
              {siteConfig.social.rawEmail}
            </a>
            ，或通过{' '}
            <Link
              to="/guestbook"
              className="font-medium text-content underline decoration-line underline-offset-4 transition-colors hover:decoration-content"
            >
              留言板
            </Link>{' '}
            联系。
          </p>
        </section>
      </article>
    </div>
  );
};
