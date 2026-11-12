/**
 * 首页联系方式卡小部件：GitHub / 邮箱 / QQ 一键复制 / RSS / 更新订阅 / 项目仓库。
 *
 * 语义与改动前一致：外链一律 `target="_blank"` + `rel="noopener noreferrer"`，可访问名称里
 * 标注「外部站点，新标签页打开」；邮箱用 `siteConfig.social.email`；RSS 指向站内
 * `/feed.xml`（不加 target）；「更新订阅」取 `ISSUE_SUBSCRIPTION_URL` 常量，不硬编码。
 * QQ 复制走 `copyTextToClipboard` + try/catch，成功/失败都经 `role="status"` 播报，
 * 2 秒后由 `useResetTimer` 复位，卸载后不再 setState。
 */

import { useEffect, useRef, useState } from 'react';
import { Bell, Check, Copy, Github, Mail, Rss } from 'lucide-react';
import { siteConfig } from '@config/site.config';
import { ISSUE_SUBSCRIPTION_URL } from '@/components/IssueSubscriptionCard';
import { useResetTimer } from '@/hooks/useResetTimer';
import { copyTextToClipboard } from '@/utils/clipboard';
import { assetUrl } from '@/utils/siteUrl';
import { Widget } from './Widget';

const COPY_FEEDBACK_MS = 2000;

type CopyFeedback = 'idle' | 'copied' | 'error';

const contactItemClassName =
  'group inline-flex min-h-11 min-w-0 items-center gap-2 rounded-control px-2 text-[12px] text-content-muted transition-colors hover:bg-surface-muted hover:text-content focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-content sm:text-[13px]';

const contactIconClassName = 'shrink-0 opacity-70';

export const ContactWidget = () => {
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
    <Widget id="home-contact" title="联系方式" index={5} className="lg:col-span-3 xl:col-span-5">
      <nav
        aria-label="联系方式"
        className="home-contact-grid grid grid-cols-2 gap-1 sm:grid-cols-3 lg:grid-cols-2 xl:grid-cols-3"
      >
        <a href={siteConfig.social.github} target="_blank" rel="noopener noreferrer" className={contactItemClassName}>
          <Github size={15} aria-hidden="true" className={contactIconClassName} />
          <span className="truncate underline-offset-4 group-hover:underline">GitHub</span>
          <span className="sr-only">（外部站点，新标签页打开）</span>
        </a>

        {/* 邮箱是最长的一条：小屏独占一行，避免被省略成「pldduck@outlook…」。 */}
        <a href={siteConfig.social.email} className={`${contactItemClassName} col-span-2 sm:col-span-1`}>
          <Mail size={15} aria-hidden="true" className={contactIconClassName} />
          <span className="truncate underline-offset-4 group-hover:underline">{siteConfig.social.rawEmail}</span>
        </a>

        {qqNumber && (
          <button
            type="button"
            onClick={handleCopyQQ}
            aria-label={`复制 QQ 号 ${qqNumber}`}
            className={contactItemClassName}
          >
            {qqFeedback === 'copied' ? (
              <Check size={15} aria-hidden="true" className="shrink-0 text-success" />
            ) : (
              <Copy size={15} aria-hidden="true" className={contactIconClassName} />
            )}
            <span className="truncate">QQ {qqNumber}</span>
          </button>
        )}

        <a href={assetUrl('/feed.xml')} className={contactItemClassName}>
          <Rss size={15} aria-hidden="true" className={contactIconClassName} />
          <span className="truncate underline-offset-4 group-hover:underline">RSS 订阅</span>
        </a>

        <a href={ISSUE_SUBSCRIPTION_URL} target="_blank" rel="noopener noreferrer" className={contactItemClassName}>
          <Bell size={15} aria-hidden="true" className={contactIconClassName} />
          <span className="truncate underline-offset-4 group-hover:underline">更新订阅</span>
          <span className="sr-only">（外部站点，新标签页打开）</span>
        </a>

        <a
          href={siteConfig.friendsPage.repoUrl}
          target="_blank"
          rel="noopener noreferrer"
          className={contactItemClassName}
        >
          <Github size={15} aria-hidden="true" className={contactIconClassName} />
          <span className="truncate underline-offset-4 group-hover:underline">项目仓库</span>
          <span className="sr-only">（外部站点，新标签页打开）</span>
        </a>
      </nav>

      {/* 复制结果只在这里播报：成功/失败都如实反馈，反馈期间不挪动上方入口。 */}
      <p
        role="status"
        aria-live="polite"
        className={`mt-auto min-h-5 pt-2 text-[11px] ${qqFeedback === 'error' ? 'text-danger' : 'text-content-muted'}`}
      >
        {copyStatusMessage}
      </p>
    </Widget>
  );
};
