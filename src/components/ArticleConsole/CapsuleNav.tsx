/**
 * 桌面端文章目录入口（≥1024px）：
 * - 收缩态：右侧单枚小圆按钮（目录图标 + 进度环），安静、不遮挡正文；
 * - hover 轻展开预览（250ms 意图延迟），点击/键盘 focus 固定展开，钉住后不自动收起；
 * - 展开态 = 目录树（共享 TocTree）+ 真实阅读进度 + 阅读操作区；
 * - 状态记忆：pinned/展开状态跨文章导航继承（模块级），专注阅读进出快照恢复；
 * - 定位：fixed 垂直居中，right 偏移按文章容器右缘动态计算（resize 跟随）。
 *
 * 视觉：面板用 surface 大色块 + 间距分隔，不再使用高耸的数字胶囊轨/多重描边。
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Copy, Eye, Link2, List, Pin, PinOff, Share2, X } from 'lucide-react';
import type { RefObject } from 'react';
import type { MarkdownHeading } from '@/utils/headings';
import { buildHeadingTree, buildParentMap, getAncestorIds, getRootBranchId } from '@/utils/toc';
import { useTocExpansion } from './useTocExpansion';
import { replaceUrlHash, scrollToHeadingElement } from '@/utils/headingScroll';
import { useActiveHeading } from './useActiveHeading';
import { useReadingProgress } from './useReadingProgress';
import { TocTree } from './TocTree';
import { getCapsuleState, setCapsuleState } from './capsuleState';
import { useReducedMotion } from '@/hooks/useReducedMotion';
import { hasOpenOverlay } from '@/hooks/useModalOverlay';

const HOVER_INTENT_MS = 250;
const COPY_FEEDBACK_MS = 2000;
/** 圆按钮尺寸（与 Tailwind h-11 对齐）：定位公式据此预留右侧留白。 */
const CAPSULE_BUTTON_SIZE = 44;
/** 进度环半径/周长（SVG viewBox 44×44，描边 2px）。 */
const PROGRESS_RING_RADIUS = 20;
const PROGRESS_RING_CIRCUMFERENCE = 2 * Math.PI * PROGRESS_RING_RADIUS;
/** 面板操作行：surface 面板上的 ghost 行（无边框，hover 用弱底）。 */
const PANEL_ACTION_CLASS =
  'flex min-h-10 items-center gap-2.5 rounded-control px-2.5 text-[13px] text-content-muted transition-colors hover:bg-surface-muted hover:text-content disabled:cursor-not-allowed disabled:opacity-40';
const PANEL_ICON_BUTTON_CLASS =
  'inline-flex h-9 w-9 items-center justify-center rounded-icon text-content-muted transition-colors hover:bg-surface-muted hover:text-content';

type CopyFeedback = { kind: 'article' | 'heading'; ok: boolean } | null;

interface CapsuleNavProps {
  headings: MarkdownHeading[];
  /** 正文容器（进度测量 + 定位基准）。 */
  targetRef: RefObject<HTMLElement | null>;
  /** 正文结尾哨兵。 */
  endRef: RefObject<HTMLElement | null>;
  onShare: () => void;
  onCopyArticleLink: () => Promise<boolean>;
  onCopyHeadingLink: (id: string) => Promise<boolean>;
  onToggleReadingMode: () => void;
}

export const CapsuleNav: React.FC<CapsuleNavProps> = ({
  headings,
  targetRef,
  endRef,
  onShare,
  onCopyArticleLink,
  onCopyHeadingLink,
  onToggleReadingMode,
}) => {
  const shouldReduceMotion = useReducedMotion();
  const headingTree = useMemo(() => buildHeadingTree(headings), [headings]);
  const parentMap = useMemo(() => buildParentMap(headingTree), [headingTree]);
  const activeHeadingId = useActiveHeading(headings);
  const { percentage } = useReadingProgress(targetRef, endRef);

  // 模块级状态记忆的 React 镜像：跨文章导航继承、专注阅读快照恢复。
  const [pinned, setPinned] = useState(() => getCapsuleState().pinned);
  const [userExpanded, setUserExpanded] = useState(() => getCapsuleState().userExpanded);
  const [hoverPreview, setHoverPreview] = useState(false);
  const [focusWithin, setFocusWithin] = useState(false);
  const [copyFeedback, setCopyFeedback] = useState<CopyFeedback>(null);
  const hoverTimerRef = useRef<number | null>(null);
  /**
   * 主动收起后的 hover 抑制：点击目录按钮/面板关闭按钮收起时，图标会在指针
   * 下方替换（X ↔ List），React 会因此再触发一次容器 onMouseEnter，
   * 250ms 后又把面板顶开（表现为「第二次点击关不掉」）。收起后抑制 hover 预览，
   * 直到指针真正离开容器（onMouseLeave）再恢复。
   */
  const hoverSuppressedRef = useRef(false);
  const copyTimerRef = useRef<number | null>(null);
  const railRef = useRef<HTMLElement | null>(null);
  const railToggleRef = useRef<HTMLButtonElement | null>(null);
  // 跳转收起后的程序化焦点恢复不触发 focusWithin 自动展开（一次性抑制）：
  // 否则「收起 + 焦点回轨」会被容器 onFocusCapture 立刻顶开，收起失效。
  const suppressFocusExpandRef = useRef(false);
  const suppressTimerRef = useRef<number | null>(null);
  const panelRef = useRef<HTMLElement | null>(null);
  const activeItemRef = useRef<HTMLLIElement | null>(null);

  const isExpanded = pinned || userExpanded || hoverPreview || focusWithin;

  // 展开态联动目录树的分支折叠（与 TOC 相同策略：仅展开当前分支）。
  const activeAncestorIds = useMemo(() => getAncestorIds(activeHeadingId, parentMap), [activeHeadingId, parentMap]);
  const activeBranchIds = useMemo(
    () => new Set(activeHeadingId ? [activeHeadingId, ...activeAncestorIds] : activeAncestorIds),
    [activeAncestorIds, activeHeadingId],
  );
  const activeRootBranchId = useMemo(() => getRootBranchId(activeHeadingId, parentMap), [activeHeadingId, parentMap]);

  // 展开状态：与移动 Sheet 共享 useTocExpansion（用户手动展开/折叠优先于
  // 自动收拢，active 变化只保证 active 分支可见）。
  const { expandedMap, toggleNode, expandBranchForNavigation } = useTocExpansion({
    headingTree,
    activeHeadingId,
    activeRootBranchId,
    activeAncestorIds,
    collapseInactiveRootBranches: true,
    autoExpandActiveNode: true,
  });

  // 定位：right 偏移 = 文章右缘到视口右缘的可用空间 - 轨宽 - 间隙，钳制在
  // [1rem, 6rem]；窄屏自动贴近边缘，宽屏保持在留白带内（不贴死浏览器边缘）。
  useEffect(() => {
    const updateOffset = () => {
      const element = targetRef.current;
      if (!element) {
        return;
      }
      const rect = element.getBoundingClientRect();
      const available = window.innerWidth - rect.right;
      const offset = Math.max(16, Math.min(available - CAPSULE_BUTTON_SIZE - 12, 96));
      document.documentElement.style.setProperty('--capsule-right', `${offset}px`);
    };

    updateOffset();
    window.addEventListener('resize', updateOffset);
    return () => window.removeEventListener('resize', updateOffset);
  }, [targetRef, headings]);

  // hover 意图延迟：防止路过的鼠标误展开。
  const scheduleHoverPreview = useCallback(() => {
    if (hoverSuppressedRef.current || pinned || userExpanded) {
      return;
    }
    if (hoverTimerRef.current !== null) {
      return;
    }
    hoverTimerRef.current = window.setTimeout(
      () => {
        hoverTimerRef.current = null;
        setHoverPreview(true);
      },
      shouldReduceMotion ? 0 : HOVER_INTENT_MS,
    );
  }, [pinned, shouldReduceMotion, userExpanded]);

  const cancelHoverPreview = useCallback(() => {
    if (hoverTimerRef.current !== null) {
      window.clearTimeout(hoverTimerRef.current);
      hoverTimerRef.current = null;
    }
    setHoverPreview(false);
  }, []);

  // 收起胶囊（未固定时）：指针/焦点状态与模块级记忆同步复位。
  const collapseCapsule = useCallback(() => {
    hoverSuppressedRef.current = true;
    cancelHoverPreview();
    setFocusWithin(false);
    setUserExpanded(false);
    setCapsuleState({ userExpanded: false });
  }, [cancelHoverPreview]);

  /**
   * 完全收起：一次清掉 pin / 用户展开 / focusWithin / hoverPreview 四种展开来源。
   * 目录按钮与面板关闭按钮共用 —— 否则「点击按钮后 focusWithin 仍为 true」会让
   * 第二次点击看似无效（面板关不掉）。
   */
  const collapseConsole = useCallback(() => {
    // 图标替换会在指针下触发一次容器 mouseenter：先抑制 hover，直到指针离开。
    hoverSuppressedRef.current = true;
    cancelHoverPreview();
    setFocusWithin(false);
    setPinned(false);
    setUserExpanded(false);
    setCapsuleState({ pinned: false, userExpanded: false });
  }, [cancelHoverPreview]);

  /** 目录入口按钮：已展开（固定或用户点开）时整体收起，否则展开。 */
  const toggleConsole = useCallback(() => {
    if (pinned || userExpanded) {
      collapseConsole();
      return;
    }
    cancelHoverPreview();
    setUserExpanded(true);
    setCapsuleState({ userExpanded: true });
  }, [cancelHoverPreview, collapseConsole, pinned, userExpanded]);

  const togglePinned = useCallback(() => {
    setPinned((current) => {
      const next = !current;
      setCapsuleState({ pinned: next, userExpanded: next ? true : getCapsuleState().userExpanded });
      return next;
    });
    setUserExpanded(true);
  }, []);

  // 展开时（未钉住）：Esc 收起、外点收起。有其他弹层打开时让位（不处理 Esc）。
  useEffect(() => {
    if (!isExpanded || pinned) {
      return;
    }
    const collapse = () => {
      setUserExpanded(false);
      setCapsuleState({ userExpanded: false });
      setFocusWithin(false);
      setHoverPreview(false);
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !hasOpenOverlay()) {
        collapse();
      }
    };
    const handleMouseDown = (event: MouseEvent) => {
      const target = event.target as Node;
      if (!panelRef.current?.contains(target) && !railRef.current?.contains(target)) {
        collapse();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    document.addEventListener('mousedown', handleMouseDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      document.removeEventListener('mousedown', handleMouseDown);
    };
  }, [isExpanded, pinned]);

  // 卸载清理挂起计时器。
  useEffect(() => {
    return () => {
      if (hoverTimerRef.current !== null) {
        window.clearTimeout(hoverTimerRef.current);
      }
      if (copyTimerRef.current !== null) {
        window.clearTimeout(copyTimerRef.current);
      }
      if (suppressTimerRef.current !== null) {
        window.clearTimeout(suppressTimerRef.current);
      }
    };
  }, []);

  const showCopyFeedback = useCallback((kind: 'article' | 'heading', ok: boolean) => {
    setCopyFeedback({ kind, ok });
    if (copyTimerRef.current !== null) {
      window.clearTimeout(copyTimerRef.current);
    }
    copyTimerRef.current = window.setTimeout(() => setCopyFeedback(null), COPY_FEEDBACK_MS);
  }, []);

  const handleCopyArticleLink = useCallback(async () => {
    showCopyFeedback('article', await onCopyArticleLink());
  }, [onCopyArticleLink, showCopyFeedback]);

  const handleCopyHeadingLink = useCallback(async () => {
    if (!activeHeadingId) {
      return;
    }
    showCopyFeedback('heading', await onCopyHeadingLink(activeHeadingId));
  }, [activeHeadingId, onCopyHeadingLink, showCopyFeedback]);

  const handleNavigate = useCallback(
    (id: string) => {
      const ancestorIds = getAncestorIds(id, parentMap);
      const rootId = getRootBranchId(id, parentMap);
      expandBranchForNavigation(rootId, ancestorIds);

      scrollToHeadingElement(id, shouldReduceMotion ? 'auto' : 'smooth');
      replaceUrlHash(id);

      // 未固定：跳转即收起（与移动端 Sheet 点击后关闭一致），并把焦点归还到
      // 迷你轨的展开按钮（面板视觉隐藏后焦点会丢失，不能掉到 body）。
      if (!pinned) {
        collapseCapsule();
        if (railToggleRef.current) {
          suppressFocusExpandRef.current = true;
          railToggleRef.current.focus();
          if (suppressTimerRef.current !== null) {
            window.clearTimeout(suppressTimerRef.current);
          }
          suppressTimerRef.current = window.setTimeout(() => {
            suppressFocusExpandRef.current = false;
            suppressTimerRef.current = null;
          }, 0);
        }
      }
    },
    [collapseCapsule, expandBranchForNavigation, parentMap, pinned, shouldReduceMotion],
  );

  // 滚动到当前激活目录项在展开面板中可见。
  useEffect(() => {
    const panel = panelRef.current;
    const activeElement = activeItemRef.current;
    if (!isExpanded || !panel || !activeElement) {
      return;
    }
    activeElement.scrollIntoView({ block: 'nearest', behavior: shouldReduceMotion ? 'auto' : 'smooth' });
  }, [activeHeadingId, expandedMap, isExpanded, shouldReduceMotion]);

  const capsule = createPortal(
    <div
      className="capsule-container"
      data-expanded={isExpanded ? 'true' : undefined}
      // hover/focus 意图统一挂在容器上：面板为绝对定位（展开不推动迷你轨），
      // 容器级 mouseenter/mouseleave 以 DOM 归属判定，指针在轨/面板间移动
      // （含 wrapper 内置的 0.5rem 过渡桥）不会触发收起，杜绝抽搐循环。
      onMouseEnter={scheduleHoverPreview}
      onMouseLeave={() => {
        // 指针真正离开后恢复 hover 预览能力（主动收起期间的抑制到此解除）。
        hoverSuppressedRef.current = false;
        cancelHoverPreview();
      }}
      onFocusCapture={() => {
        if (suppressFocusExpandRef.current) {
          return;
        }
        setFocusWithin(true);
      }}
      onBlurCapture={(event) => {
        if (!(event.currentTarget as HTMLElement).contains(event.relatedTarget as Node | null)) {
          setFocusWithin(false);
        }
      }}
    >
      {/* 目录入口：单枚小圆按钮（图标 + 进度环），安静地贴在正文右侧留白带 */}
      <nav ref={railRef} aria-label="文章目录入口" className="relative">
        <button
          ref={railToggleRef}
          type="button"
          onClick={toggleConsole}
          className="relative flex h-11 w-11 items-center justify-center rounded-full bg-surface text-content-muted shadow-lg transition-colors hover:bg-surface-muted hover:text-content"
          aria-label={isExpanded ? '收起文章导航' : '展开文章导航'}
          aria-expanded={isExpanded}
          title={`${isExpanded ? '收起目录' : '展开目录'} · 阅读进度 ${percentage}%`}
        >
          {/* 进度环：只做视觉刻度，语义进度由下方 sr-only 文本承担 */}
          <svg
            aria-hidden="true"
            viewBox="0 0 44 44"
            className="pointer-events-none absolute inset-0 h-full w-full -rotate-90"
          >
            <circle
              cx="22"
              cy="22"
              r={PROGRESS_RING_RADIUS}
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              className="opacity-20"
            />
            <circle
              cx="22"
              cy="22"
              r={PROGRESS_RING_RADIUS}
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeDasharray={PROGRESS_RING_CIRCUMFERENCE}
              strokeDashoffset={PROGRESS_RING_CIRCUMFERENCE * (1 - Math.min(100, Math.max(0, percentage)) / 100)}
            />
          </svg>
          {/* 图标双层常驻：展开态只切换透明度，不替换指针下的 DOM 节点。
              否则 focus→展开 会在 mousedown 与 mouseup 之间换掉图标，
              浏览器无法派发 click —— 第一次点击只走 focus 展开、第二次点击
              反而执行「展开」分支，表现为按钮关不掉。 */}
          <span className="pointer-events-none relative block h-4 w-4">
            <List
              size={16}
              aria-hidden="true"
              className={`absolute inset-0 transition-opacity duration-150 ${isExpanded ? 'opacity-0' : 'opacity-100'}`}
            />
            <X
              size={16}
              aria-hidden="true"
              className={`absolute inset-0 transition-opacity duration-150 ${isExpanded ? 'opacity-100' : 'opacity-0'}`}
            />
          </span>
        </button>
        <span className="sr-only">阅读进度 {percentage}%</span>
      </nav>

      {/* 展开面板：绝对定位于目录按钮左侧（不挤动按钮，消除 hover 位移抽搐）；
          wrapper 自带 0.5rem 右侧内边距作为指针过渡桥；可见性由容器
          data-expanded + CSS opacity/visibility 过渡驱动（visibility:hidden
          时移出可访问性树）。 */}
      <aside ref={panelRef} className="capsule-panel" role="group" aria-label="文章阅读导航面板">
        <div className="flex max-h-[min(80vh,42rem)] w-[min(20rem,42vw)] flex-col overflow-hidden rounded-overlay bg-surface shadow-2xl">
          <div className="flex items-center gap-1 px-3 pb-1 pt-2.5">
            <span className="flex-1 text-[13px] font-semibold">文章目录</span>
            <button
              type="button"
              onClick={togglePinned}
              className={`${PANEL_ICON_BUTTON_CLASS} ${pinned ? 'bg-surface-muted text-content' : ''}`}
              aria-label={pinned ? '取消固定导航面板' : '固定导航面板'}
              aria-pressed={pinned}
              title={pinned ? '取消固定' : '固定（阅读期间保持展开）'}
            >
              {pinned ? <PinOff size={14} aria-hidden="true" /> : <Pin size={14} aria-hidden="true" />}
            </button>
            <button
              type="button"
              onClick={collapseConsole}
              className={PANEL_ICON_BUTTON_CLASS}
              aria-label="收起导航面板"
            >
              <X size={14} aria-hidden="true" />
            </button>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-2 pb-2">
            {headingTree.length > 0 && (
              <TocTree
                nodes={headingTree}
                expandedMap={expandedMap}
                activeHeadingId={activeHeadingId}
                activeBranchIds={activeBranchIds}
                activeItemRef={activeItemRef}
                shouldForceExpand={false}
                onNavigate={handleNavigate}
                onToggle={toggleNode}
              />
            )}
          </div>

          <div className="flex items-center gap-2 bg-surface-muted px-3 py-2 text-[11px] text-content-muted">
            <span>阅读进度</span>
            <span className="h-1 flex-1 overflow-hidden rounded-full bg-background" aria-hidden="true">
              <span className="block h-full rounded-full bg-content" style={{ width: `${percentage}%` }} />
            </span>
            <span className="tabular-nums">{percentage}%</span>
          </div>

          <div className="flex flex-col gap-0.5 p-1.5">
            <button type="button" onClick={onShare} className={PANEL_ACTION_CLASS} aria-label="分享文章">
              <Share2 size={15} aria-hidden="true" />
              <span>分享</span>
            </button>
            <button
              type="button"
              onClick={() => void handleCopyArticleLink()}
              className={PANEL_ACTION_CLASS}
              aria-label="复制文章链接"
            >
              <Link2 size={15} aria-hidden="true" />
              <span>复制文章链接</span>
            </button>
            <button
              type="button"
              onClick={() => void handleCopyHeadingLink()}
              className={PANEL_ACTION_CLASS}
              aria-label="复制当前标题链接"
              disabled={!activeHeadingId}
            >
              <Copy size={15} aria-hidden="true" />
              <span>复制标题链接</span>
            </button>
            <button
              type="button"
              onClick={onToggleReadingMode}
              className={PANEL_ACTION_CLASS}
              aria-label="进入专注阅读"
            >
              <Eye size={15} aria-hidden="true" />
              <span>阅读模式</span>
            </button>
          </div>

          <p className="min-h-[1.25rem] px-3 pb-2 text-[11px] text-content-muted" role="status" aria-live="polite">
            {copyFeedback
              ? copyFeedback.ok
                ? copyFeedback.kind === 'article'
                  ? '文章链接已复制'
                  : '标题链接已复制'
                : '复制失败，请重试'
              : ''}
          </p>
        </div>
      </aside>
    </div>,
    document.body,
  );

  return capsule;
};
