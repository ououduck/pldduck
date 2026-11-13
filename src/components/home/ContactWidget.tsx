/**
 * 首页联系方式卡小部件：GitHub / 邮箱 / QQ 二维码 / RSS / 更新订阅 / 项目仓库。
 *
 * 语义：外链一律 `target="_blank"` + `rel="noopener noreferrer"`，可访问名称里标注「外部站点，
 * 新标签页打开」；邮箱用 `siteConfig.social.email`，可见文字只显示 @ 前的名字（完整地址放进
 * aria-label / title，不再靠省略号截断）；RSS 指向站内 `/feed.xml`（不加 target）；「更新订阅」
 * 取 `ISSUE_SUBSCRIPTION_URL` 常量，不硬编码。
 *
 * QQ 不再复制号码：入口只在 `social.qq` 与 `social.qqQrCode` 同时存在时渲染。鼠标悬停时在按钮
 * 正上方弹出小悬浮层（手机点击切换开合），不接管焦点、不锁滚动、不带全屏遮罩。悬浮层经 portal
 * 固定定位到按钮上方 —— 卡片入场动画的 transform 会让 fixed 子元素退回卡片坐标系，并被
 * `overflow-hidden` 裁掉；位置随滚动/缩放重新计算，空间不足时自动翻到按钮下方。
 */

import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type FC,
  type PointerEvent as ReactPointerEvent,
} from 'react';
import { createPortal } from 'react-dom';
import { Bell, Github, Mail, Rss } from 'lucide-react';
import { siteConfig } from '@config/site.config';
import { ISSUE_SUBSCRIPTION_URL } from '@/components/IssueSubscriptionCard';
import { assetUrl } from '@/utils/siteUrl';
import { Widget } from './Widget';

const contactItemClassName =
  'group inline-flex min-h-11 min-w-0 items-center gap-2 rounded-control px-2 text-[12px] text-content-muted transition-colors hover:bg-surface-muted hover:text-content focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-content sm:text-[13px]';

const contactIconClassName = 'shrink-0 opacity-70';

const contactLabelClassName = 'whitespace-nowrap underline-offset-4 group-hover:underline';

/** QQ 品牌图标（Simple Icons 的 QQ 单路径，24×24，currentColor 与其它 lucide 图标同色）。 */
const QqIcon: FC<{ className?: string }> = ({ className }) => (
  <svg viewBox="0 0 24 24" width={15} height={15} fill="currentColor" aria-hidden="true" className={className}>
    <path d="M21.395 15.035a40 40 0 0 0-.803-2.264l-1.079-2.695c.001-.032.014-.562.014-.836C19.526 4.632 17.351 0 12 0S4.474 4.632 4.474 9.241c0 .274.013.804.014.836l-1.08 2.695a39 39 0 0 0-.802 2.264c-1.021 3.283-.69 4.643-.438 4.673.54.065 2.103-2.472 2.103-2.472 0 1.469.756 3.387 2.394 4.771-.612.188-1.363.479-1.845.835-.434.32-.379.646-.301.778.343.578 5.883.369 7.482.189 1.6.18 7.14.389 7.483-.189.078-.132.132-.458-.301-.778-.483-.356-1.233-.646-1.846-.836 1.637-1.384 2.393-3.302 2.393-4.771 0 0 1.563 2.537 2.103 2.472.251-.03.581-1.39-.438-4.673" />
  </svg>
);

const QQ_POPOVER_WIDTH = 200;
const QQ_POPOVER_GAP = 10;
/** 悬浮层的大致高度（标题 + 160px 二维码 + 说明），只用于判断上下是否放得下。 */
const QQ_POPOVER_HEIGHT = 240;
const HOVER_CLOSE_DELAY_MS = 150;

interface PopoverPosition {
  left: number;
  top?: number;
  bottom?: number;
  placement: 'top' | 'bottom';
}

/** 鼠标/触控笔才算「悬停」；触屏的 pointerenter 交给 click 处理，避免一触即开又立刻被 click 关掉。 */
const isHoverPointer = (pointerType: string) => !pointerType || pointerType === 'mouse';

const getPopoverPosition = (button: HTMLButtonElement): PopoverPosition => {
  const rect = button.getBoundingClientRect();
  const viewportWidth = window.innerWidth;
  const viewportHeight = window.innerHeight;
  const halfWidth = QQ_POPOVER_WIDTH / 2;
  const left = Math.min(
    Math.max(rect.left + rect.width / 2, halfWidth + 8),
    Math.max(halfWidth + 8, viewportWidth - halfWidth - 8),
  );

  // 按钮上方放得下就向上弹（默认），否则翻到下方，避免被视口顶部裁掉。
  if (rect.top >= QQ_POPOVER_HEIGHT + QQ_POPOVER_GAP + 8) {
    return { left, bottom: viewportHeight - rect.top + QQ_POPOVER_GAP, placement: 'top' };
  }

  return {
    left,
    top: Math.min(rect.bottom + QQ_POPOVER_GAP, Math.max(8, viewportHeight - QQ_POPOVER_HEIGHT - 8)),
    placement: 'bottom',
  };
};

export const ContactWidget = () => {
  const { github, email, rawEmail, qq: qqNumber, qqQrCode } = siteConfig.social;
  // 邮箱按钮只显示 @ 前的名字，完整地址仍用于 mailto 与可访问名称。
  const emailName = rawEmail.split('@')[0] || rawEmail;
  const qrImageUrl = qqQrCode ? assetUrl(qqQrCode) : '';

  const [isQrOpen, setIsQrOpen] = useState(false);
  const [qrFailed, setQrFailed] = useState(false);
  const [popoverPosition, setPopoverPosition] = useState<PopoverPosition | null>(null);
  const qqButtonRef = useRef<HTMLButtonElement | null>(null);
  const qqPopoverRef = useRef<HTMLDivElement | null>(null);
  const hoverCloseTimerRef = useRef<number | null>(null);
  const qqPopoverId = useId();

  const clearHoverCloseTimer = useCallback(() => {
    if (hoverCloseTimerRef.current !== null) {
      window.clearTimeout(hoverCloseTimerRef.current);
      hoverCloseTimerRef.current = null;
    }
  }, []);

  const closeQrPopover = useCallback(() => {
    clearHoverCloseTimer();
    setIsQrOpen(false);
    setPopoverPosition(null);
  }, [clearHoverCloseTimer]);

  const openQrPopover = useCallback(() => {
    const button = qqButtonRef.current;
    if (!button) {
      return;
    }
    clearHoverCloseTimer();
    // 重新打开时清掉上一次的加载失败态，失败反馈只属于当前这次打开。
    setQrFailed(false);
    setPopoverPosition(getPopoverPosition(button));
    setIsQrOpen(true);
  }, [clearHoverCloseTimer]);

  const scheduleHoverClose = useCallback(() => {
    clearHoverCloseTimer();
    hoverCloseTimerRef.current = window.setTimeout(() => {
      hoverCloseTimerRef.current = null;
      closeQrPopover();
    }, HOVER_CLOSE_DELAY_MS);
  }, [clearHoverCloseTimer, closeQrPopover]);

  const updatePopoverPosition = useCallback(() => {
    if (!qqButtonRef.current) {
      return;
    }
    setPopoverPosition(getPopoverPosition(qqButtonRef.current));
  }, []);

  const handleQqPointerEnter = (event: ReactPointerEvent<HTMLButtonElement>) => {
    if (!isHoverPointer(event.pointerType)) {
      return;
    }
    openQrPopover();
  };

  const handleQqPointerLeave = (event: ReactPointerEvent<HTMLButtonElement>) => {
    if (!isHoverPointer(event.pointerType)) {
      return;
    }
    scheduleHoverClose();
  };

  // 触屏点击切换开合；桌面端点击已由悬停展开，再点一次即关闭。
  const handleQqClick = () => {
    if (isQrOpen) {
      closeQrPopover();
    } else {
      openQrPopover();
    }
  };

  const handlePopoverPointerEnter = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (isHoverPointer(event.pointerType)) {
      clearHoverCloseTimer();
    }
  };

  const handlePopoverPointerLeave = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (isHoverPointer(event.pointerType)) {
      scheduleHoverClose();
    }
  };

  // 打开期间：Escape / 点击悬浮层外部关闭；滚动与缩放时重新锚定到按钮。
  useEffect(() => {
    if (!isQrOpen) {
      return;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') {
        return;
      }
      event.preventDefault();
      closeQrPopover();
    };

    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target;
      if (!(target instanceof Node)) {
        return;
      }
      if (qqPopoverRef.current?.contains(target) || qqButtonRef.current?.contains(target)) {
        return;
      }
      closeQrPopover();
    };

    window.addEventListener('keydown', handleKeyDown);
    document.addEventListener('pointerdown', handlePointerDown);
    window.addEventListener('resize', updatePopoverPosition);
    window.addEventListener('scroll', updatePopoverPosition, true);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      document.removeEventListener('pointerdown', handlePointerDown);
      window.removeEventListener('resize', updatePopoverPosition);
      window.removeEventListener('scroll', updatePopoverPosition, true);
    };
  }, [closeQrPopover, isQrOpen, updatePopoverPosition]);

  useEffect(() => () => clearHoverCloseTimer(), [clearHoverCloseTimer]);

  return (
    <Widget id="home-contact" title="联系方式" index={2} className="lg:col-span-3 xl:col-span-4">
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
            ref={qqButtonRef}
            type="button"
            onPointerEnter={handleQqPointerEnter}
            onPointerLeave={handleQqPointerLeave}
            onClick={handleQqClick}
            aria-label={`查看 QQ 二维码（QQ 号 ${qqNumber}）`}
            aria-haspopup="dialog"
            aria-expanded={isQrOpen}
            aria-controls={isQrOpen ? qqPopoverId : undefined}
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
        popoverPosition &&
        typeof document !== 'undefined' &&
        createPortal(
          <div
            ref={qqPopoverRef}
            id={qqPopoverId}
            role="dialog"
            aria-label={`QQ 号 ${qqNumber} 的二维码`}
            style={{
              left: popoverPosition.left,
              top: popoverPosition.top,
              bottom: popoverPosition.bottom,
              width: QQ_POPOVER_WIDTH,
            }}
            onPointerEnter={handlePopoverPointerEnter}
            onPointerLeave={handlePopoverPointerLeave}
            className="fixed z-nested -translate-x-1/2 rounded-overlay border border-line bg-surface p-3 text-content shadow-2xl"
          >
            <p className="text-center text-[11px] text-content-muted">QQ 号 {qqNumber}</p>

            <div className="mt-2 flex justify-center">
              {qrFailed ? (
                <p
                  role="status"
                  className="flex h-40 w-40 items-center justify-center rounded-control bg-surface-muted px-3 text-center text-[11px] leading-5 text-content-muted"
                >
                  二维码加载失败，请稍后重试。
                </p>
              ) : (
                <img
                  src={qrImageUrl}
                  alt={`QQ 号 ${qqNumber} 的二维码`}
                  width={160}
                  height={160}
                  onError={() => setQrFailed(true)}
                  className="h-40 w-40 rounded-control bg-white object-contain p-1.5"
                />
              )}
            </div>

            <p className="mt-2 text-center text-[11px] text-content-muted">手机 QQ 扫一扫</p>

            <span
              aria-hidden="true"
              className={`absolute left-1/2 h-2.5 w-2.5 -translate-x-1/2 rotate-45 border-line bg-surface ${
                popoverPosition.placement === 'top' ? '-bottom-[5px] border-b border-r' : '-top-[5px] border-l border-t'
              }`}
            />
          </div>,
          document.body,
        )}
    </Widget>
  );
};
