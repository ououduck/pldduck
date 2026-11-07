/**
 * 首页：极简个人主页。
 *
 * 只呈现站主身份本身——头像、名字、个人介绍与联系方式；门户入口、搜索、
 * 开源项目、订阅卡等内容已全部移除。文案全部来自构建期内联的 `siteConfig`，
 * 渲染期不访问时钟、随机值或客户端 API，SSG 与水合首帧严格一致。
 */

import { useEffect, useRef, useState } from 'react';
import { Check, Copy, Github, Mail } from 'lucide-react';
import { siteConfig } from '@config/site.config';
import { Seo, buildSiteSchemas } from '@/components/Seo';
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

// 联系方式是轻量文字链接，不是三个大按钮：统一的低对比基色 + 悬停加深即可。
const contactItemClassName =
  'inline-flex min-h-11 items-center gap-2 text-zinc-600 transition-colors hover:text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zinc-900 dark:text-zinc-400 dark:hover:text-white dark:focus-visible:outline-zinc-100';

const contactIconClassName = 'shrink-0 text-zinc-400 dark:text-zinc-500';

export const Home = () => {
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

      <div className="flex min-h-[78vh] flex-col justify-center py-14 md:min-h-[76vh] md:py-20">
        <div className="mx-auto w-full max-w-xl text-center">
          <img
            src={assetUrl(siteConfig.author.avatar)}
            alt={siteConfig.author.name}
            width={96}
            height={96}
            decoding="async"
            className="mx-auto h-24 w-24 rounded-full border border-zinc-200 object-cover dark:border-zinc-800"
          />

          <h1 className="mt-8 font-serif text-4xl font-bold tracking-tight text-ink [overflow-wrap:anywhere] dark:text-white sm:text-5xl">
            {siteConfig.author.name}
          </h1>

          <p className="mx-auto mt-6 max-w-lg text-[15px] leading-8 text-zinc-600 dark:text-zinc-400 sm:text-base sm:leading-9">
            {siteConfig.author.bio}
          </p>

          <nav
            aria-label="联系方式"
            className="mt-9 flex flex-col items-center gap-0.5 text-sm sm:flex-row sm:flex-wrap sm:items-center sm:justify-center sm:gap-x-6 sm:gap-y-1"
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
                  <Check size={16} aria-hidden="true" className="shrink-0 text-emerald-600 dark:text-emerald-400" />
                ) : (
                  <Copy size={16} aria-hidden="true" className={contactIconClassName} />
                )}
                <span>QQ {qqNumber}</span>
              </button>
            )}
          </nav>

          {/* 复制结果只在这里播报：成功/失败都如实反馈，反馈期间不挪动上方联系方式。 */}
          <p
            role="status"
            aria-live="polite"
            className={`mt-3 min-h-5 text-xs ${
              qqFeedback === 'error' ? 'text-red-700 dark:text-red-400' : 'text-zinc-500 dark:text-zinc-400'
            }`}
          >
            {copyStatusMessage}
          </p>
        </div>
      </div>
    </>
  );
};
