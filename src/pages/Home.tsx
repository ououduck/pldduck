/**
 * 首页：极简个人主页 + 全站搜索 + 联系方式。
 *
 * 站主身份、搜索与联系/订阅入口集中在首页；侧边栏只保留内容导航与工具。
 * 文案全部来自构建期内联的 `siteConfig`，搜索首帧为空字符串，渲染期不访问
 * 时钟、随机值或客户端 API，SSG 与水合首帧严格一致。
 */

import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { Bell, Check, Copy, Github, Mail, Rss, Search } from 'lucide-react';
import { siteConfig } from '@config/site.config';
import { Seo, buildSiteSchemas } from '@/components/Seo';
import { ISSUE_SUBSCRIPTION_URL } from '@/components/IssueSubscriptionCard';
import { useResetTimer } from '@/hooks/useResetTimer';
import { copyTextToClipboard } from '@/utils/clipboard';
import { absoluteSiteUrl, assetUrl } from '@/utils/siteUrl';

const COPY_FEEDBACK_MS = 2000;

type CopyFeedback = 'idle' | 'copied' | 'error';

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

// 联系方式是轻量文字链接，不是三个大按钮：统一的次要文字色 + 悬停弱底/下划线。
// 移动端由 index.css 的 `home-contact-grid` 改为 2 列紧凑网格，字号同步收紧。
const contactItemClassName =
  'inline-flex min-h-11 items-center gap-2 rounded-control px-2.5 text-[12px] text-content-muted transition-colors hover:bg-surface-muted hover:text-content focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-content sm:text-[13px] md:text-sm';

const contactIconClassName = 'shrink-0 opacity-70';

export const Home = () => {
  const navigate = useNavigate();
  const [searchQuery, setSearchQuery] = useState('');
  const [qqFeedback, setQqFeedback] = useState<CopyFeedback>('idle');
  const { schedule: scheduleFeedbackReset } = useResetTimer();
  // 复制是异步的：组件若在 promise 落地前卸载，不得再 setState。
  const isMountedRef = useRef(true);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  const qqNumber = siteConfig.social.qq;

  const handleCopyQQ = async () => {
    if (!qqNumber) {
      return;
    }
    // 剪贴板写入在旧浏览器上可能抛错：异常同样按失败反馈，不产生未处理的 rejection。
    let copied = false;
    try {
      copied = await copyTextToClipboard(qqNumber);
    } catch {
      copied = false;
    }
    if (!isMountedRef.current) {
      return;
    }
    setQqFeedback(copied ? 'copied' : 'error');
    scheduleFeedbackReset(() => {
      if (isMountedRef.current) {
        setQqFeedback('idle');
      }
    }, COPY_FEEDBACK_MS);
  };

  const copyStatusMessage =
    qqFeedback === 'copied' ? 'QQ 号已复制到剪贴板' : qqFeedback === 'error' ? '复制失败，请手动复制 QQ 号' : '';

  const handleSearchSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const query = searchQuery.trim();
    navigate(query ? `/search?q=${encodeURIComponent(query)}` : '/search');
  };

  return (
    <>
      <Seo
        title={siteConfig.title}
        description={siteConfig.description}
        // 显式传 structuredData 会替换掉 Seo 的默认站点 schema，因此站点级两条要自己带上；
        // 描述沿用 Seo 对首页的覆盖规则（seoHomeDescription 优先），保证产物逐字不变。
        structuredData={[
          ...buildSiteSchemas(siteConfig.seoHomeDescription || siteConfig.description),
          profilePageSchema,
        ]}
      />

      <div className="home-page mx-auto w-full max-w-3xl py-10 md:py-16">
        <section className="home-hero relative overflow-hidden rounded-overlay bg-surface px-5 py-6 sm:px-10 sm:py-14 md:px-12 md:py-16">
          <div aria-hidden="true" className="home-hero-glow" />
          <div className="relative mx-auto w-full max-w-xl text-center">
            <img
              src={assetUrl(siteConfig.author.avatar)}
              alt={siteConfig.author.name}
              width={96}
              height={96}
              decoding="async"
              data-home-reveal="avatar"
              className="home-reveal home-reveal-avatar mx-auto h-16 w-16 rounded-full bg-surface-muted object-cover ring-1 ring-line sm:h-20 sm:w-20 md:h-24 md:w-24"
            />

            <h1
              data-home-reveal="title"
              className="home-reveal home-reveal-title mt-5 font-serif text-[1.75rem] font-bold tracking-tight text-content [overflow-wrap:anywhere] sm:mt-8 sm:text-4xl md:text-5xl"
            >
              {siteConfig.author.name}
            </h1>

            <p
              data-home-reveal="bio"
              className="home-reveal mx-auto mt-3 max-w-lg text-[13px] leading-6 text-content-muted sm:mt-4 sm:text-sm sm:leading-7 md:mt-6 md:text-base md:leading-9"
            >
              {siteConfig.author.bio}
            </p>

            <form
              role="search"
              onSubmit={handleSearchSubmit}
              data-home-reveal="search"
              className="home-reveal mx-auto mt-6 max-w-md sm:mt-7 md:mt-10"
            >
              <label htmlFor="home-search" className="sr-only">
                搜索全站
              </label>
              <div className="flex items-center gap-2 rounded-control bg-surface-muted px-3 transition-shadow duration-200 focus-within:ring-1 focus-within:ring-content-muted">
                <Search size={16} aria-hidden="true" className="shrink-0 text-content-muted" />
                <input
                  id="home-search"
                  type="search"
                  value={searchQuery}
                  onChange={(event) => setSearchQuery(event.target.value)}
                  placeholder="搜索文章、标签与分类…"
                  autoComplete="off"
                  className="min-h-11 min-w-0 flex-1 bg-transparent text-base text-content outline-none placeholder:text-content-muted sm:text-sm md:min-h-12"
                />
                <button
                  type="submit"
                  className="min-h-11 shrink-0 rounded-micro px-2 text-sm font-medium text-content-muted transition-colors hover:text-content"
                >
                  搜索
                </button>
              </div>
            </form>

            <nav
              aria-label="联系方式"
              data-home-reveal="contact"
              className="home-contact-grid home-reveal mt-5 flex flex-wrap items-center justify-center gap-1 text-sm sm:mt-6 md:mt-8"
            >
              <a
                href={siteConfig.social.github}
                target="_blank"
                rel="noopener noreferrer"
                className={`${contactItemClassName} group`}
              >
                <Github size={16} aria-hidden="true" className={contactIconClassName} />
                <span className="underline-offset-4 group-hover:underline">GitHub</span>
                <span className="sr-only">（外部站点，新标签页打开）</span>
              </a>

              <a href={siteConfig.social.email} className={`${contactItemClassName} group`}>
                <Mail size={16} aria-hidden="true" className={contactIconClassName} />
                <span className="underline-offset-4 group-hover:underline">{siteConfig.social.rawEmail}</span>
              </a>

              {qqNumber && (
                <button
                  type="button"
                  onClick={handleCopyQQ}
                  aria-label={`复制 QQ 号 ${qqNumber}`}
                  className={contactItemClassName}
                >
                  {qqFeedback === 'copied' ? (
                    <Check size={16} aria-hidden="true" className="shrink-0 text-success" />
                  ) : (
                    <Copy size={16} aria-hidden="true" className={contactIconClassName} />
                  )}
                  <span>QQ {qqNumber}</span>
                </button>
              )}

              <a href={assetUrl('/feed.xml')} className={`${contactItemClassName} group`}>
                <Rss size={16} aria-hidden="true" className={contactIconClassName} />
                <span className="underline-offset-4 group-hover:underline">RSS 订阅</span>
              </a>

              <a
                href={ISSUE_SUBSCRIPTION_URL}
                target="_blank"
                rel="noopener noreferrer"
                className={`${contactItemClassName} group`}
              >
                <Bell size={16} aria-hidden="true" className={contactIconClassName} />
                <span className="underline-offset-4 group-hover:underline">更新订阅</span>
                <span className="sr-only">（外部站点，新标签页打开）</span>
              </a>

              <a
                href={siteConfig.friendsPage.repoUrl}
                target="_blank"
                rel="noopener noreferrer"
                className={`${contactItemClassName} group`}
              >
                <Github size={16} aria-hidden="true" className={contactIconClassName} />
                <span className="underline-offset-4 group-hover:underline">项目仓库</span>
                <span className="sr-only">（外部站点，新标签页打开）</span>
              </a>
            </nav>

            {/* 复制结果只在这里播报：成功/失败都如实反馈，反馈期间不挪动上方联系方式。 */}
            <p
              role="status"
              aria-live="polite"
              className={`mt-2 min-h-5 text-[11px] md:mt-3 md:text-xs ${qqFeedback === 'error' ? 'text-danger' : 'text-content-muted'}`}
            >
              {copyStatusMessage}
            </p>
          </div>
        </section>
      </div>
    </>
  );
};
