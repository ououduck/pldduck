/**
 * 首页联系方式卡小部件：GitHub / 邮箱 / QQ 二维码 / RSS / 更新订阅 / 项目仓库。
 *
 * 语义：外链一律 `target="_blank"` + `rel="noopener noreferrer"`，可访问名称里标注「外部站点，
 * 新标签页打开」；邮箱用 `siteConfig.social.email`，可见文字只显示 @ 前的名字（完整地址放进
 * aria-label / title，不再靠省略号截断）；RSS 指向站内 `/feed.xml`（不加 target）；「更新订阅」
 * 取 `ISSUE_SUBSCRIPTION_URL` 常量，不硬编码。
 *
 * QQ 不再复制号码：入口只在 `social.qq` 与 `social.qqQrCode` 同时存在时渲染，鼠标悬停或点击
 * （触屏）打开二维码弹窗。弹窗经 portal 挂到 body —— 卡片入场动画的 transform 会让 fixed
 * 子元素退回卡片坐标系并被 `overflow-hidden` 裁掉；焦点陷阱 / 滚动锁 / Escape / 焦点还原
 * 复用 `useModalOverlay`。二维码加载失败如实提示，不伪装成功。
 */

import { useId, useRef, useState, type FC } from 'react';
import { createPortal } from 'react-dom';
import { Bell, Github, Mail, Rss, X } from 'lucide-react';
import { siteConfig } from '@config/site.config';
import { ISSUE_SUBSCRIPTION_URL } from '@/components/IssueSubscriptionCard';
import { useModalOverlay } from '@/hooks/useModalOverlay';
import { assetUrl } from '@/utils/siteUrl';
import { Widget } from './Widget';

const contactItemClassName =
  'group inline-flex min-h-11 min-w-0 items-center gap-2 rounded-control px-2 text-[12px] text-content-muted transition-colors hover:bg-surface-muted hover:text-content focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-content sm:text-[13px]';

const contactIconClassName = 'shrink-0 opacity-70';

const contactLabelClassName = 'whitespace-nowrap underline-offset-4 group-hover:underline';

/**
 * 关闭弹窗后的「悬停重开」抑制窗口。
 *
 * 遮罩被移除时，指针下的元素发生变化，浏览器会立刻给 QQ 入口补发一次 `mouseenter`；
 * 不拦住就会「刚关掉又弹开」（Esc 永远关不上）。补发通常在同一帧内完成，几百毫秒足够。
 * 点击不受此限（主动意图由 onClick 直接打开）。
 */
const HOVER_REOPEN_BLOCK_MS = 400;

/** QQ 品牌图标（Simple Icons 的 QQ 单路径，24×24，currentColor 与其它 lucide 图标同色）。 */
const QqIcon: FC<{ className?: string }> = ({ className }) => (
  <svg viewBox="0 0 24 24" width={15} height={15} fill="currentColor" aria-hidden="true" className={className}>
    <path d="M21.395 15.035a40 40 0 0 0-.803-2.264l-1.079-2.695c.001-.032.014-.562.014-.836C19.526 4.632 17.351 0 12 0S4.474 4.632 4.474 9.241c0 .274.013.804.014.836l-1.08 2.695a39 39 0 0 0-.802 2.264c-1.021 3.283-.69 4.643-.438 4.673.54.065 2.103-2.472 2.103-2.472 0 1.469.756 3.387 2.394 4.771-.612.188-1.363.479-1.845.835-.434.32-.379.646-.301.778.343.578 5.883.369 7.482.189 1.6.18 7.14.389 7.483-.189.078-.132.132-.458-.301-.778-.483-.356-1.233-.646-1.846-.836 1.637-1.384 2.393-3.302 2.393-4.771 0 0 1.563 2.537 2.103 2.472.251-.03.581-1.39-.438-4.673" />
  </svg>
);

export const ContactWidget = () => {
  const { github, email, rawEmail, qq: qqNumber, qqQrCode } = siteConfig.social;
  // 邮箱按钮只显示 @ 前的名字，完整地址仍用于 mailto 与可访问名称。
  const emailName = rawEmail.split('@')[0] || rawEmail;
  const qrImageUrl = qqQrCode ? assetUrl(qqQrCode) : '';

  const [isQrOpen, setIsQrOpen] = useState(false);
  const [qrFailed, setQrFailed] = useState(false);
  const qrDialogRef = useRef<HTMLDivElement | null>(null);
  const qrCloseButtonRef = useRef<HTMLButtonElement | null>(null);
  const qrDialogId = useId();
  const qrTitleId = useId();
  const qrHintId = useId();
  const hoverReopenBlockedUntilRef = useRef(0);

  const closeQrDialog = () => {
    hoverReopenBlockedUntilRef.current = Date.now() + HOVER_REOPEN_BLOCK_MS;
    setIsQrOpen(false);
  };

  const openQrDialog = () => {
    // 重新打开时清掉上一次的加载失败态，失败反馈只属于当前这次打开。
    setQrFailed(false);
    setIsQrOpen(true);
  };

  const handleQqMouseEnter = () => {
    if (Date.now() < hoverReopenBlockedUntilRef.current) {
      return;
    }
    openQrDialog();
  };

  const handleQqClick = () => {
    // 点击是主动意图：抑制窗口内也允许重新打开。
    openQrDialog();
  };

  useModalOverlay({
    isOpen: isQrOpen,
    onClose: closeQrDialog,
    initialFocusRef: qrCloseButtonRef,
    containerRef: qrDialogRef,
  });

  return (
    <Widget id="home-contact" title="联系方式" index={5} className="lg:col-span-3 xl:col-span-5">
      <nav
        aria-label="联系方式"
        className="home-contact-grid grid grid-cols-2 gap-1 sm:grid-cols-3 lg:grid-cols-2 xl:grid-cols-3"
      >
        <a href={github} target="_blank" rel="noopener noreferrer" className={contactItemClassName}>
          <Github size={15} aria-hidden="true" className={contactIconClassName} />
          <span className={contactLabelClassName}>GitHub</span>
          <span className="sr-only">（外部站点，新标签页打开）</span>
        </a>

        <a href={email} title={rawEmail} aria-label={`发送邮件到 ${rawEmail}`} className={contactItemClassName}>
          <Mail size={15} aria-hidden="true" className={contactIconClassName} />
          <span className={contactLabelClassName}>{emailName}</span>
        </a>

        {qqNumber && qrImageUrl && (
          <button
            type="button"
            onMouseEnter={handleQqMouseEnter}
            onClick={handleQqClick}
            aria-label={`查看 QQ 二维码（QQ 号 ${qqNumber}）`}
            aria-haspopup="dialog"
            aria-expanded={isQrOpen}
            aria-controls={isQrOpen ? qrDialogId : undefined}
            className={contactItemClassName}
          >
            <QqIcon className={contactIconClassName} />
            <span className={contactLabelClassName}>QQ</span>
          </button>
        )}

        <a href={assetUrl('/feed.xml')} className={contactItemClassName}>
          <Rss size={15} aria-hidden="true" className={contactIconClassName} />
          <span className={contactLabelClassName}>RSS 订阅</span>
        </a>

        <a href={ISSUE_SUBSCRIPTION_URL} target="_blank" rel="noopener noreferrer" className={contactItemClassName}>
          <Bell size={15} aria-hidden="true" className={contactIconClassName} />
          <span className={contactLabelClassName}>更新订阅</span>
          <span className="sr-only">（外部站点，新标签页打开）</span>
        </a>

        <a
          href={siteConfig.friendsPage.repoUrl}
          target="_blank"
          rel="noopener noreferrer"
          className={contactItemClassName}
        >
          <Github size={15} aria-hidden="true" className={contactIconClassName} />
          <span className={contactLabelClassName}>项目仓库</span>
          <span className="sr-only">（外部站点，新标签页打开）</span>
        </a>
      </nav>

      {isQrOpen &&
        qqNumber &&
        qrImageUrl &&
        typeof document !== 'undefined' &&
        createPortal(
          <div
            className="fixed inset-0 z-modal flex items-center justify-center bg-black/65 p-4"
            onClick={(event) => {
              if (event.target === event.currentTarget) {
                closeQrDialog();
              }
            }}
          >
            <div
              ref={qrDialogRef}
              id={qrDialogId}
              role="dialog"
              aria-modal="true"
              aria-labelledby={qrTitleId}
              aria-describedby={qrHintId}
              className="w-full max-w-[18rem] rounded-overlay border border-line bg-surface p-5 text-content shadow-2xl"
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h3 id={qrTitleId} className="text-sm font-semibold text-content">
                    QQ 二维码
                  </h3>
                  <p className="mt-1 text-[11px] text-content-muted">QQ 号 {qqNumber}</p>
                </div>
                <button
                  ref={qrCloseButtonRef}
                  type="button"
                  onClick={closeQrDialog}
                  aria-label="关闭 QQ 二维码"
                  className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-icon text-content-muted transition-colors hover:bg-surface-muted hover:text-content focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-content"
                >
                  <X size={16} aria-hidden="true" />
                </button>
              </div>

              <div className="mt-4 flex justify-center">
                {qrFailed ? (
                  <p
                    role="status"
                    className="flex min-h-52 w-52 items-center justify-center rounded-control bg-surface-muted px-4 text-center text-[11px] leading-5 text-content-muted"
                  >
                    二维码加载失败，请稍后重试。
                  </p>
                ) : (
                  <img
                    src={qrImageUrl}
                    alt={`QQ 号 ${qqNumber} 的二维码`}
                    width={208}
                    height={208}
                    onError={() => setQrFailed(true)}
                    className="h-52 w-52 rounded-control bg-white object-contain p-2"
                  />
                )}
              </div>

              <p id={qrHintId} className="mt-3 text-center text-[11px] leading-5 text-content-muted">
                用手机 QQ 扫一扫，添加好友
              </p>
            </div>
          </div>,
          document.body,
        )}
    </Widget>
  );
};
