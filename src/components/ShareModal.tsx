/**
 * 分享弹层（当前仅文章页使用）。
 *
 * 视觉口径（2026-11 重做）：与站内卡片语言统一 —— 面板 `rounded-overlay bg-surface`，
 * 内容区改成分组卡片而不是跨页发丝线；主操作只保留一个强调按钮（复制链接），
 * 其余平台入口收进一行等宽图标块，微信二维码收进可展开的次级面板。
 *
 * 分享状态与意图链接逻辑在 useShareActions hook 中，本组件只负责呈现。
 */

import React, { useEffect, useId, useRef, useState } from 'react';
import { X, Copy, Check, Link as LinkIcon, QrCode, Share2, MessageSquareShare } from 'lucide-react';
import { SlideModal } from './SlideModal';
import { useShareActions } from '@/hooks/useShareActions';

interface ShareModalProps {
  isOpen: boolean;
  onClose: () => void;
  /** 文章标题。 */
  title: string;
  /** 文章摘要。 */
  excerpt: string;
  /** 可分享的绝对链接（canonical）。 */
  url: string;
  /** 打开弹窗前父层已自动复制链接时传入结果：true/false，未自动复制时不传。 */
  autoCopied?: boolean | null;
  /** 卡片区标签文案（默认「当前文章」）。 */
  contentLabel?: string;
}

const XIcon: React.FC<{ size?: number }> = ({ size = 16 }) => (
  <svg viewBox="0 0 24 24" width={size} height={size} fill="currentColor" aria-hidden="true">
    <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
  </svg>
);

const TelegramIcon: React.FC<{ size?: number }> = ({ size = 16 }) => (
  <svg viewBox="0 0 24 24" width={size} height={size} fill="currentColor" aria-hidden="true">
    <path d="M21.938 3.863 18.87 20.096c-.23 1.14-.935 1.42-1.895.885l-5.23-3.852-2.524 2.43c-.28.28-.515.515-1.055.515l.377-5.322 9.683-8.752c.422-.376-.094-.585-.655-.209L5.37 13.5l-5.16-1.612c-1.123-.352-1.14-1.123.234-1.662L20.484 2.29c.935-.352 1.753.209 1.454 1.573z" />
  </svg>
);

/** 平台入口的统一样式：等宽方形图标块，与卡片内其它按钮同一套边框/悬停语义。 */
const channelClass =
  'inline-flex h-11 min-w-11 flex-col items-center justify-center gap-0.5 rounded-control border border-line bg-surface-muted px-2.5 text-[11px] font-medium text-content-muted transition-colors hover:border-accent hover:text-content focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent';

export const ShareModal: React.FC<ShareModalProps> = ({
  isOpen,
  onClose,
  title,
  excerpt,
  url,
  autoCopied,
  contentLabel = '当前文章',
}) => {
  const [showQrCode, setShowQrCode] = useState(false);
  const [qrSvg, setQrSvg] = useState<string | null>(null);
  const [qrFailed, setQrFailed] = useState(false);
  // 父层自动复制结果的本地快照：仅在打开且用户未手动复制时初始化。
  const [initialAutoCopied, setInitialAutoCopied] = useState<boolean | null>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const titleId = useId();
  const descriptionId = useId();
  const { copiedType, copyError, copyFullText, copyLink, canNativeShare, nativeShare, shareIntents, resetOnClose } =
    useShareActions({ title, excerpt, url });

  // 用户手动触发过复制后，父层迟到的 autoCopied 结果不再覆盖界面状态。
  const userCopiedRef = useRef(false);

  useEffect(() => {
    if (!isOpen) {
      resetOnClose();
      userCopiedRef.current = false;
      setInitialAutoCopied(null);
      setShowQrCode(false);
      setQrSvg(null);
      setQrFailed(false);
      return;
    }
    if (userCopiedRef.current) return;
    if (autoCopied === true || autoCopied === false) {
      setInitialAutoCopied(autoCopied);
    }
  }, [autoCopied, isOpen, resetOnClose]);

  // 二维码按需懒加载（uqr 不进首屏 chunk）：展开微信面板时才 import。
  useEffect(() => {
    if (!showQrCode || qrSvg || qrFailed) {
      return;
    }
    let cancelled = false;
    void import('uqr')
      .then(({ renderSVG }) => {
        if (!cancelled) {
          setQrSvg(renderSVG(url));
        }
      })
      .catch(() => {
        if (!cancelled) {
          setQrFailed(true);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [showQrCode, qrSvg, qrFailed, url]);

  const markUserCopied = () => {
    userCopiedRef.current = true;
  };

  const handleCopyFull = async () => {
    markUserCopied();
    await copyFullText(`标题：${title}\n简介：${excerpt}\n链接：${url}`);
  };

  const handleCopyLink = async () => {
    markUserCopied();
    await copyLink();
  };

  const statusText =
    copyError ??
    (copiedType
      ? '已复制到剪贴板'
      : initialAutoCopied === true
        ? '链接已自动复制'
        : initialAutoCopied === false
          ? '自动复制失败，请手动复制'
          : '复制链接后可粘贴到任意平台');

  return (
    <SlideModal
      isOpen={isOpen}
      onClose={onClose}
      initialFocusRef={closeButtonRef}
      ariaLabelledby={titleId}
      ariaDescribedby={descriptionId}
    >
      <div className="flex items-center justify-between px-5 pb-1 pt-4 md:px-6">
        <h3 id={titleId} className="text-sm font-semibold text-content">
          分享
        </h3>
        <button
          ref={closeButtonRef}
          type="button"
          onClick={onClose}
          className="inline-flex h-9 w-9 items-center justify-center rounded-icon text-content-muted transition-colors hover:bg-surface-muted hover:text-content focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
          aria-label="关闭分享弹窗"
        >
          <X size={16} aria-hidden="true" />
        </button>
      </div>

      <div className="px-5 pb-5 pt-2 md:px-6 md:pb-6">
        {/* 内容卡片：标题 + 摘要 + 链接，与全站卡片同一套圆角与底色 */}
        <div className="rounded-overlay bg-surface-muted p-4">
          <div className="mb-2 flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-[0.12em] text-content-tertiary">
            <LinkIcon size={12} aria-hidden="true" />
            <span>{contentLabel}</span>
          </div>
          <h4 className="line-clamp-2 text-[15px] font-semibold leading-6 text-content">{title}</h4>
          <p id={descriptionId} className="mt-1 line-clamp-2 text-[13px] leading-6 text-content-muted">
            {excerpt}
          </p>
          <p className="mt-2 break-all font-mono text-[11px] leading-5 text-content-tertiary">{url}</p>
        </div>

        {/* 主操作：复制链接（唯一强调按钮） */}
        <div className="mt-3 flex flex-col gap-2 sm:flex-row">
          <button
            type="button"
            onClick={handleCopyLink}
            className="editorial-button-primary flex-1 rounded-control active:scale-[0.98]"
            aria-label="复制链接"
          >
            {copiedType === 'link' ? (
              <span className="copy-pop">
                <Check size={16} aria-hidden="true" />
              </span>
            ) : (
              <Copy size={16} aria-hidden="true" />
            )}
            {copiedType === 'link' ? '已复制' : '复制链接'}
          </button>
          <button
            type="button"
            onClick={handleCopyFull}
            className="editorial-button flex-1 rounded-control active:scale-[0.98]"
            aria-label="复制标题、简介和链接"
          >
            {copiedType === 'all' ? (
              <span className="copy-pop">
                <Check size={16} aria-hidden="true" />
              </span>
            ) : (
              <LinkIcon size={16} aria-hidden="true" />
            )}
            {copiedType === 'all' ? '已复制全部' : '复制全部'}
          </button>
        </div>

        {/* 平台入口：等宽图标块，一行排开 */}
        <div className="mt-3 flex flex-wrap items-center gap-2" role="group" aria-label="分享到其他平台">
          {canNativeShare && (
            <button type="button" onClick={() => void nativeShare()} className={channelClass} aria-label="使用系统分享">
              <Share2 size={14} aria-hidden="true" />
              系统
            </button>
          )}
          <a
            href={shareIntents.find((intent) => intent.id === 'x')?.href}
            target="_blank"
            rel="noopener noreferrer"
            className={channelClass}
            aria-label="分享到 X（推特）"
          >
            <XIcon size={14} />X
          </a>
          <a
            href={shareIntents.find((intent) => intent.id === 'telegram')?.href}
            target="_blank"
            rel="noopener noreferrer"
            className={channelClass}
            aria-label="分享到 Telegram"
          >
            <TelegramIcon size={14} />
            Telegram
          </a>
          <a
            href={shareIntents.find((intent) => intent.id === 'qzone')?.href}
            target="_blank"
            rel="noopener noreferrer"
            className={channelClass}
            aria-label="分享到 QQ 空间"
          >
            <MessageSquareShare size={14} aria-hidden="true" />
            QQ
          </a>
          <button
            type="button"
            onClick={() => setShowQrCode((value) => !value)}
            aria-expanded={showQrCode}
            aria-controls="share-wechat-qr"
            className={channelClass}
            aria-label="微信扫码分享"
          >
            <QrCode size={14} aria-hidden="true" />
            微信
          </button>
        </div>

        {showQrCode && (
          <div
            id="share-wechat-qr"
            className="mt-3 flex flex-col items-center gap-2 rounded-overlay bg-surface-muted p-4"
          >
            {qrSvg ? (
              <img
                src={`data:image/svg+xml;utf8,${encodeURIComponent(qrSvg)}`}
                alt="当前链接的微信分享二维码"
                width={168}
                height={168}
                className="h-[10.5rem] w-[10.5rem] rounded-media bg-white p-1.5"
              />
            ) : qrFailed ? (
              <p className="text-xs text-content-muted">二维码生成失败，可直接复制链接后在微信中打开。</p>
            ) : (
              <div aria-hidden="true" className="h-[10.5rem] w-[10.5rem] animate-pulse rounded-media bg-surface" />
            )}
            <p className="text-center text-[11px] leading-5 text-content-tertiary">
              微信内长按识别或截图扫码；也可以复制链接后到微信粘贴发送。
            </p>
          </div>
        )}

        <p className="mt-3 text-center text-[11px] leading-5 text-content-tertiary" aria-live="polite">
          {statusText}
        </p>
      </div>
    </SlideModal>
  );
};
