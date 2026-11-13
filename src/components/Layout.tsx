/**
 * 全站布局壳：侧边导航（桌面图标条 + hover 展开浮层，移动端左滑抽屉、任意页右滑呼出）、
 * 细顶栏、背景纹理与路由内容容器；提供页面级快捷键与 Vercount 统计上报。
 * 页面底部不再有全站 Footer（版权只保留在侧栏底部），正文即页面内容的终点。
 */

import React, { lazy, Suspense, useCallback, useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { pingVercount } from '@/services/vercount';

import '@/styles/motion-fallbacks.css';
import { SiteSidebar, SiteSidebarBody } from './SiteSidebar';
import { SiteTopBar } from './SiteTopBar';
import { useReducedMotion as useSiteReducedMotion } from '@/hooks/useReducedMotion';
import { hasOpenOverlay, lockBodyScroll, unlockBodyScroll } from '@/hooks/useModalOverlay';
import { useReadingMode, ReadingModeProvider } from './ReadingModeContext';

const BackToTop = lazy(() => import('./BackToTop').then((m) => ({ default: m.BackToTop })));
const CommandPalette = lazy(() => import('./CommandPalette').then((m) => ({ default: m.CommandPalette })));

const isEditableTarget = (target: EventTarget | null) => {
  if (!(target instanceof HTMLElement)) {
    return false;
  }

  const tagName = target.tagName.toLowerCase();
  return target.isContentEditable || tagName === 'input' || tagName === 'textarea' || tagName === 'select';
};

type MobileNavPhase = 'closed' | 'opening' | 'open' | 'closing';

/**
 * 抽屉的呼出入口：`pointer` = 顶栏汉堡按钮（可能是鼠标/触摸点击，也可能是键盘
 * Enter/Space），`gesture` = 页面右滑（一定是触摸手势，不存在键盘意图）。
 * 二者的区别只影响「打开后焦点落在哪里」，见下方 focusPanel。
 */
type MobileNavOpenSource = 'pointer' | 'gesture';

const MOBILE_NAV_ANIMATION_DURATION_MS = 340;

const MOBILE_NAV_MENU_BUTTON_ID = 'mobile-nav-menu-button';

/** 抽屉只在 lg 以下出现（Tailwind lg=1024px 是分界），右滑呼出的视口守卫与之对齐。 */
const MOBILE_NAV_MAX_VIEWPORT_PX = 1024;

/** 右滑呼出所需位移/速度：位移不足但甩动够快也算有意（与抽屉关闭手势同一套判据）。 */
const SWIPE_OPEN_DISTANCE_PX = 72;
const SWIPE_OPEN_FLICK_DISTANCE_PX = 40;
const SWIPE_OPEN_FLICK_VELOCITY_PX_PER_MS = 0.12;

/** 横向位移需明显压过纵向位移才认作右滑，避免把纵向滚动误判成开菜单。 */
const SWIPE_OPEN_AXIS_RATIO = 1.6;

/**
 * 自己认领了横向手势的 touch-action 取值：`none` 表示元素要独占全部手势（图片查看器、
 * Mermaid 平移、封面画布），`pan-x`/`pan-left`/`pan-right` 表示浏览器该去横向滚动（代码块）。
 * `pan-y`/`manipulation`/`auto` 不含横向语义，仍可呼出抽屉。`pinch-zoom` 只关缩放，不算。
 */
const HORIZONTAL_TOUCH_ACTIONS = new Set(['none', 'pan-x', 'pan-left', 'pan-right']);

const claimsHorizontalTouchAction = (touchAction: string) =>
  touchAction.split(/\s+/).some((token) => HORIZONTAL_TOUCH_ACTIONS.has(token));

/**
 * 拖选文字与右滑共用同一根手指轨迹。记录按下时的选择状态，抬手时若期间产生了新的非空
 * 选择，判定意图是「选文字」而非「开菜单」。
 */
interface SelectionSnapshot {
  collapsed: boolean;
  text: string;
}

const snapshotSelection = (): SelectionSnapshot => {
  const selection = window.getSelection();
  return {
    collapsed: !selection || selection.isCollapsed,
    text: selection?.toString() ?? '',
  };
};

interface NavbarProps {
  onSearchNavigate: () => void;
}

/**
 * 顶栏 + 移动端左滑抽屉。抽屉的状态机（四态相位、双 rAF 起步、动画期守卫、
 * 焦点陷阱、滚动锁）沿用既有实现，仅把手势轴从上下翻转为左右。
 */
const Navbar = ({ onSearchNavigate }: NavbarProps) => {
  const [mobileNavPhase, setMobileNavPhase] = useState<MobileNavPhase>('closed');
  const [isMobileNavMounted, setIsMobileNavMounted] = useState(false);
  const location = useLocation();
  const navigate = useNavigate();
  // 统一读站点自己的 useReducedMotion（framer-motion 已从首屏依赖链移除）：
  // 该 hook 在 SSR/水合首帧返回 false，与旧实现一致，只在客户端纠正。
  const shouldReduceMotion = useSiteReducedMotion();
  const animationFrameRef = useRef<number | null>(null);
  const transitionTimerRef = useRef<number | null>(null);
  const afterCloseActionRef = useRef<(() => void) | null>(null);
  const previousActiveElementRef = useRef<HTMLElement | null>(null);
  const mobileNavPanelRef = useRef<HTMLElement | null>(null);
  const touchStartYRef = useRef<number>(0);
  const touchCurrentYRef = useRef<number>(0);
  const touchStartXRef = useRef<number>(0);
  const touchCurrentXRef = useRef<number>(0);
  const touchStartTimeRef = useRef<number>(0);
  const mobileNavScrollRef = useRef<HTMLElement | null>(null);
  const canStartSwipeRef = useRef(false);
  const isSwipingRef = useRef(false);
  const mobileNavOpenSourceRef = useRef<MobileNavOpenSource>('pointer');
  const mobileNavDuration = shouldReduceMotion ? 1 : MOBILE_NAV_ANIMATION_DURATION_MS;
  const isMobileNavOpen = mobileNavPhase === 'open' || mobileNavPhase === 'opening';
  const isMobileNavAnimating = mobileNavPhase === 'opening' || mobileNavPhase === 'closing';

  const clearAnimationFrame = useCallback(() => {
    if (animationFrameRef.current === null) {
      return;
    }

    window.cancelAnimationFrame(animationFrameRef.current);
    animationFrameRef.current = null;
  }, []);

  const clearTransitionTimer = useCallback(() => {
    if (transitionTimerRef.current === null) {
      return;
    }

    window.clearTimeout(transitionTimerRef.current);
    transitionTimerRef.current = null;
  }, []);

  const finalizeClose = useCallback(() => {
    clearAnimationFrame();
    clearTransitionTimer();
    setIsMobileNavMounted(false);
    setMobileNavPhase('closed');

    const afterCloseAction = afterCloseActionRef.current;
    afterCloseActionRef.current = null;

    if (!afterCloseAction) {
      // 等触发按钮离开禁用动画状态后再恢复焦点。
      window.requestAnimationFrame(() => {
        const focusTarget =
          previousActiveElementRef.current ?? document.getElementById(MOBILE_NAV_MENU_BUTTON_ID) ?? undefined;
        focusTarget?.focus();
        previousActiveElementRef.current = null;
      });
    }

    afterCloseAction?.();
  }, [clearAnimationFrame, clearTransitionTimer]);

  const requestCloseMobileNav = useCallback(
    (afterClose?: () => void) => {
      // 动画进行中（opening/closing）的重复关闭请求直接忽略：此时若把
      // afterCloseActionRef 覆盖为 null，会静默丢弃已挂起的导航/搜索动作
      // （用户点击导航项后菜单进入 340ms closing 动画，期间按 Escape 或点
      // 遮罩会再次走到这里，动作被清空，菜单关闭但页面不跳转）。
      if (mobileNavPhase === 'opening' || mobileNavPhase === 'closing') {
        return;
      }

      afterCloseActionRef.current = afterClose ?? null;

      if (!isMobileNavMounted && mobileNavPhase === 'closed') {
        const immediateAction = afterCloseActionRef.current;
        afterCloseActionRef.current = null;
        immediateAction?.();
        return;
      }

      clearAnimationFrame();
      clearTransitionTimer();

      if (mobileNavDuration <= 1) {
        finalizeClose();
        return;
      }

      setMobileNavPhase('closing');
      transitionTimerRef.current = window.setTimeout(() => {
        transitionTimerRef.current = null;
        finalizeClose();
      }, mobileNavDuration);
    },
    [clearAnimationFrame, clearTransitionTimer, finalizeClose, isMobileNavMounted, mobileNavDuration, mobileNavPhase],
  );

  const openMobileNav = useCallback(
    (source: MobileNavOpenSource) => {
      if (isMobileNavMounted || mobileNavPhase === 'opening' || mobileNavPhase === 'open') {
        return;
      }

      afterCloseActionRef.current = null;
      previousActiveElementRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      mobileNavOpenSourceRef.current = source;
      clearAnimationFrame();
      clearTransitionTimer();
      setIsMobileNavMounted(true);
      setMobileNavPhase('closed');

      const beginOpening = () => {
        animationFrameRef.current = null;

        if (mobileNavDuration <= 1) {
          setMobileNavPhase('open');
          return;
        }

        setMobileNavPhase('opening');
        transitionTimerRef.current = window.setTimeout(() => {
          transitionTimerRef.current = null;
          setMobileNavPhase('open');
        }, mobileNavDuration);
      };

      animationFrameRef.current = window.requestAnimationFrame(() => {
        animationFrameRef.current = window.requestAnimationFrame(beginOpening);
      });
    },
    [clearAnimationFrame, clearTransitionTimer, isMobileNavMounted, mobileNavDuration, mobileNavPhase],
  );

  const handleToggleMobileNav = useCallback(() => {
    if (isMobileNavAnimating) {
      return;
    }

    if (isMobileNavOpen) {
      requestCloseMobileNav();
      return;
    }

    openMobileNav('pointer');
  }, [isMobileNavAnimating, isMobileNavOpen, openMobileNav, requestCloseMobileNav]);

  const handleMobileNavItemSelect = useCallback(
    (path: string) => {
      if (isMobileNavAnimating) {
        return;
      }

      if (location.pathname === path) {
        requestCloseMobileNav();
        return;
      }

      requestCloseMobileNav(() => navigate(path));
    },
    [isMobileNavAnimating, location.pathname, navigate, requestCloseMobileNav],
  );

  // 任意页面右滑呼出抽屉（仅 lg 以下，抽屉本来就 lg:hidden）。刻意不做拖拽预览：
  // 四态状态机靠双 rAF 起步 + 固定时长卸载，逐帧改写 transform 会把它带进未验证
  // 的分支，因此只在手指抬起时判定一次，命中就走既有 openMobileNav —— 与点汉堡
  // 按钮完全同一条路径，动画时序约束（ai-rules/layout-nav.md #10）不受影响。
  useEffect(() => {
    if (isMobileNavMounted) {
      return;
    }

    let startX = 0;
    let startY = 0;
    let startTime = 0;
    let tracking = false;
    let multiTouch = false;
    let startSelection: SelectionSnapshot = { collapsed: true, text: '' };

    // 起点落在「自己认领了横向手势」的元素上时让位给它，否则用户想横滚代码 / 平移画布
    // 却被弹出菜单。两种认领方式都要查：overflow-x 滚动条只在真的溢出时生效，
    // touch-action 则连没溢出的代码块也一并覆盖。
    const claimsHorizontalGesture = (target: EventTarget | null) => {
      let node = target instanceof Element ? target : null;
      while (node && node !== document.body) {
        const style = window.getComputedStyle(node);
        if (claimsHorizontalTouchAction(style.touchAction)) {
          return true;
        }
        if ((style.overflowX === 'auto' || style.overflowX === 'scroll') && node.scrollWidth > node.clientWidth + 1) {
          return true;
        }
        node = node.parentElement;
      }
      return false;
    };

    const handleSwipeTouchStart = (event: TouchEvent) => {
      const touch = event.touches[0];
      const target = touch?.target;
      multiTouch = false;
      tracking = Boolean(
        touch &&
        // 双指是捏合缩放，第一根手指也会横移几百像素，不当作右滑。
        event.touches.length === 1 &&
        window.innerWidth < MOBILE_NAV_MAX_VIEWPORT_PX &&
        !hasOpenOverlay() &&
        !isEditableTarget(target) &&
        !claimsHorizontalGesture(target) &&
        !document.getElementById(MOBILE_NAV_MENU_BUTTON_ID)?.contains(target instanceof Node ? target : null),
      );

      if (!tracking || !touch) {
        return;
      }

      startX = touch.clientX;
      startY = touch.clientY;
      startTime = Date.now();
      startSelection = snapshotSelection();
    };

    const handleSwipeTouchMove = (event: TouchEvent) => {
      if (event.touches.length > 1) {
        multiTouch = true;
      }
    };

    const handleSwipeTouchEnd = (event: TouchEvent) => {
      if (!tracking) {
        return;
      }
      tracking = false;

      const touch = event.changedTouches[0];
      if (!touch || multiTouch) {
        return;
      }

      // 这次拖拽改变了选区内容 → 用户选的是文字，不是开菜单。选区没变（比如沿用上次
      // 的选中结果滑一下）不算，否则正文里永远呼不出抽屉。
      const endSelection = snapshotSelection();
      if (!endSelection.collapsed && endSelection.text !== startSelection.text) {
        return;
      }

      const deltaX = touch.clientX - startX;
      const deltaY = touch.clientY - startY;
      if (deltaX <= 0 || deltaX <= Math.abs(deltaY) * SWIPE_OPEN_AXIS_RATIO) {
        return;
      }

      const elapsed = Date.now() - startTime;
      const velocity = elapsed > 0 ? deltaX / elapsed : 0;
      const isLongSwipe = deltaX >= SWIPE_OPEN_DISTANCE_PX;
      const isFlick = deltaX >= SWIPE_OPEN_FLICK_DISTANCE_PX && velocity > SWIPE_OPEN_FLICK_VELOCITY_PX_PER_MS;

      if (isLongSwipe || isFlick) {
        // 手势呼出：焦点只落在对话框容器上（见下方 focusPanel），不抢品牌行。
        openMobileNav('gesture');
      }
    };

    const handleSwipeTouchCancel = () => {
      tracking = false;
    };

    window.addEventListener('touchstart', handleSwipeTouchStart, { passive: true });
    window.addEventListener('touchmove', handleSwipeTouchMove, { passive: true });
    window.addEventListener('touchend', handleSwipeTouchEnd, { passive: true });
    window.addEventListener('touchcancel', handleSwipeTouchCancel, { passive: true });

    return () => {
      window.removeEventListener('touchstart', handleSwipeTouchStart);
      window.removeEventListener('touchmove', handleSwipeTouchMove);
      window.removeEventListener('touchend', handleSwipeTouchEnd);
      window.removeEventListener('touchcancel', handleSwipeTouchCancel);
    };
  }, [isMobileNavMounted, openMobileNav]);

  // 滑动关闭手势处理
  // iOS 上 React 合成的 touchmove 监听是 passive 的，无法 preventDefault：
  // 手势进行中如果不阻止原生滚动，菜单内的滚动容器会同时橡皮筋回弹/滚动，
  // 与面板的 transform 位移叠加，造成“双拖”卡顿。因此在确认进入拖拽后，
  // 临时挂一个非 passive 的原生 touchmove 监听来吞掉事件，拖拽结束即移除。
  const nativeSwipeCaptureRef = useRef<{ element: HTMLElement; handler: (event: TouchEvent) => void } | null>(null);

  const engageNativeSwipeCapture = useCallback((panel: HTMLElement) => {
    if (nativeSwipeCaptureRef.current?.element === panel) {
      return;
    }
    const detachPrevious = nativeSwipeCaptureRef.current;
    if (detachPrevious) {
      detachPrevious.element.removeEventListener('touchmove', detachPrevious.handler);
      nativeSwipeCaptureRef.current = null;
    }
    const handler = (event: TouchEvent) => event.preventDefault();
    panel.addEventListener('touchmove', handler, { passive: false });
    nativeSwipeCaptureRef.current = { element: panel, handler };
  }, []);

  const detachNativeSwipeCapture = useCallback(() => {
    const current = nativeSwipeCaptureRef.current;
    if (current) {
      current.element.removeEventListener('touchmove', current.handler);
      nativeSwipeCaptureRef.current = null;
    }
  }, []);

  const resetMobileNavDragStyles = useCallback(() => {
    const panel = mobileNavPanelRef.current;
    const backdrop = panel?.parentElement?.querySelector('.mobile-nav-backdrop') as HTMLElement | null;

    if (panel) {
      panel.dataset.swiping = 'false';
      panel.style.transform = '';
    }

    if (backdrop) {
      backdrop.style.opacity = '';
    }
    detachNativeSwipeCapture();
  }, [detachNativeSwipeCapture]);

  const handleTouchStart = useCallback(
    (e: React.TouchEvent) => {
      if (mobileNavPhase !== 'open') {
        return;
      }

      const touch = e.touches[0];
      touchStartYRef.current = touch.clientY;
      touchCurrentYRef.current = touch.clientY;
      touchStartXRef.current = touch.clientX;
      touchCurrentXRef.current = touch.clientX;
      touchStartTimeRef.current = Date.now();
      mobileNavScrollRef.current = mobileNavPanelRef.current?.querySelector<HTMLElement>('.mobile-nav-scroll') ?? null;
      canStartSwipeRef.current = Boolean(mobileNavScrollRef.current && mobileNavScrollRef.current.scrollLeft <= 1);
      isSwipingRef.current = false;
    },
    [mobileNavPhase],
  );

  const handleTouchMove = useCallback(
    (e: React.TouchEvent) => {
      if (mobileNavPhase !== 'open') {
        return;
      }

      const touch = e.touches[0];
      const currentY = touch.clientY;
      const currentX = touch.clientX;
      const deltaY = currentY - touchStartYRef.current;
      const deltaX = currentX - touchStartXRef.current;
      touchCurrentYRef.current = currentY;
      touchCurrentXRef.current = currentX;

      // 仅当从菜单水平方向起点可左滑（面板内无横向滚动）、且以向左为主的
      // 手势才触发拖拽。
      const isAtScrollLeft = Boolean(mobileNavScrollRef.current && mobileNavScrollRef.current.scrollLeft <= 1);
      if (deltaX >= 0 || Math.abs(deltaX) <= Math.abs(deltaY) || !canStartSwipeRef.current || !isAtScrollLeft) {
        return;
      }

      isSwipingRef.current = true;
      const panel = mobileNavPanelRef.current;
      if (panel) {
        // 阻止原生滚动继续，避免面板位移与内部滚动叠加抖动。
        engageNativeSwipeCapture(panel);
        panel.dataset.swiping = 'true';
        panel.style.transform = `translate3d(${deltaX}px, 0, 0)`;
        // 按位移比例调暗背景遮罩
        const backdrop = panel.parentElement?.querySelector('.mobile-nav-backdrop') as HTMLElement | null;
        if (backdrop) {
          const panelWidth = panel.offsetWidth || 1;
          const progress = Math.min(Math.abs(deltaX) / panelWidth, 1);
          backdrop.style.opacity = String(1 - progress * 0.6);
        }
      }
    },
    [engageNativeSwipeCapture, mobileNavPhase],
  );

  const handleTouchEnd = useCallback(() => {
    if (mobileNavPhase !== 'open') {
      resetMobileNavDragStyles();
      return;
    }

    const deltaY = touchCurrentYRef.current - touchStartYRef.current;
    const deltaX = touchCurrentXRef.current - touchStartXRef.current;
    const isAtScrollLeft = Boolean(mobileNavScrollRef.current && mobileNavScrollRef.current.scrollLeft <= 1);

    resetMobileNavDragStyles();

    // 手势关闭：向左距离足够（>80px）直接关闭；距离不足但快速甩动（>40px 且速度 >0.11px/ms）也视为有意关闭。
    const elapsed = touchStartTimeRef.current > 0 ? Date.now() - touchStartTimeRef.current : 0;
    const velocity = elapsed > 0 ? deltaX / elapsed : 0;
    const shouldDismiss =
      isSwipingRef.current &&
      isAtScrollLeft &&
      Math.abs(deltaX) > Math.abs(deltaY) &&
      (deltaX < -80 || (deltaX < -40 && velocity < -0.11));

    if (shouldDismiss) {
      requestCloseMobileNav();
    }

    isSwipingRef.current = false;
  }, [mobileNavPhase, requestCloseMobileNav, resetMobileNavDragStyles]);

  useEffect(() => {
    if (!isMobileNavMounted) {
      return;
    }

    // 滚动锁统一走共享计数锁（lockBodyScroll 同时锁 html 与 body，并关掉根元素的
    // overscroll-behavior）。此前这里另外手写了一份 documentElement.style.overflow /
    // overscrollBehavior 的捕获与还原：同一份根元素状态被两处置写时，抽屉与弹层
    // （搜索/分享/Cookie）任何一次「先捕获、后还原」交错都可能把 hidden 写回去，
    // 表现为「页面再也滚不动」。现在根元素只有一个写者。
    lockBodyScroll();

    return () => {
      unlockBodyScroll();
    };
  }, [isMobileNavMounted]);

  useEffect(() => {
    if (!isMobileNavMounted) {
      return;
    }

    const focusableSelector = [
      'a[href]',
      'button:not([disabled])',
      'textarea:not([disabled])',
      'input:not([disabled])',
      'select:not([disabled])',
      '[tabindex]:not([tabindex="-1"])',
    ].join(',');

    const focusPanel = window.setTimeout(() => {
      const panel = mobileNavPanelRef.current;
      if (!panel) {
        return;
      }

      // 手势呼出只把焦点交给对话框容器本身（.mobile-nav-panel 带 outline-none，不画焦点环）：
      // 脚本聚焦在「页面还没有发生过任何指针点击」时会被浏览器按键盘焦点处理（Chrome
      // 只在鼠标按下/键盘事件时清掉该判据，触摸滑动不会），于是 :focus-visible 给品牌行
      // 圈出一圈白色焦点框 —— 首次加载后右滑呼出最明显；点汉堡按钮时那次点击已清掉判据，
      // 所以看不到。触摸手势没有键盘意图，Tab 交给下面的焦点陷阱即可，不必抢首个可聚焦项。
      // 按钮打开（可能是键盘 Enter/Space）仍沿用「聚焦第一个可聚焦项」的既有行为。
      if (mobileNavOpenSourceRef.current === 'gesture') {
        panel.focus({ preventScroll: true });
        return;
      }

      const firstFocusable = panel.querySelector<HTMLElement>(focusableSelector);
      (firstFocusable ?? panel).focus();
    }, mobileNavDuration);

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        requestCloseMobileNav();
        return;
      }

      if (event.key !== 'Tab') {
        return;
      }

      const panel = mobileNavPanelRef.current;
      if (!panel) {
        return;
      }

      const focusableElements = Array.from(panel.querySelectorAll<HTMLElement>(focusableSelector)).filter(
        (element) => element.offsetParent !== null || element === document.activeElement,
      );
      if (focusableElements.length === 0) {
        event.preventDefault();
        panel.focus();
        return;
      }

      const firstElement = focusableElements[0];
      const lastElement = focusableElements[focusableElements.length - 1];
      const activeElement = document.activeElement;

      // 焦点在面板外（如遮罩上方导航栏的搜索/汉堡按钮，或打开瞬间焦点尚未移入）
      // 时，Tab / Shift+Tab 一律收进面板：aria-modal 对话框要求背景内容不可达，
      // 否则焦点会一路逃逸到弹层背后的页面内容。
      if (!panel.contains(activeElement)) {
        event.preventDefault();
        (event.shiftKey ? lastElement : firstElement).focus();
        return;
      }

      if (event.shiftKey && activeElement === firstElement) {
        event.preventDefault();
        lastElement.focus();
        return;
      }

      if (!event.shiftKey && activeElement === lastElement) {
        event.preventDefault();
        firstElement.focus();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.clearTimeout(focusPanel);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isMobileNavMounted, mobileNavDuration, requestCloseMobileNav]);

  const locationKey = `${location.pathname}${location.search}`;
  const previousLocationKeyRef = useRef(locationKey);

  useEffect(() => {
    if (previousLocationKeyRef.current === locationKey) {
      return;
    }

    previousLocationKeyRef.current = locationKey;

    if (!isMobileNavMounted) {
      return;
    }

    clearAnimationFrame();
    clearTransitionTimer();
    resetMobileNavDragStyles();
    afterCloseActionRef.current = null;
    previousActiveElementRef.current = null;
    setIsMobileNavMounted(false);
    setMobileNavPhase('closed');
  }, [clearAnimationFrame, clearTransitionTimer, isMobileNavMounted, locationKey, resetMobileNavDragStyles]);

  useEffect(
    () => () => {
      clearAnimationFrame();
      clearTransitionTimer();
      detachNativeSwipeCapture();
    },
    [clearAnimationFrame, clearTransitionTimer, detachNativeSwipeCapture],
  );

  const mobileNavStyle = {
    '--mobile-nav-duration': `${mobileNavDuration}ms`,
  } as React.CSSProperties;
  const mobileNavPanelStyle = {
    ...mobileNavStyle,
    // 左侧抽屉：safe-area 补左侧缺口（横屏刘海）与上下，面板本身占满整高。
    paddingLeft: 'env(safe-area-inset-left, 0px)',
    paddingTop: 'env(safe-area-inset-top, 0px)',
    paddingBottom: 'env(safe-area-inset-bottom, 0px)',
  } as React.CSSProperties;

  return (
    <>
      <SiteTopBar
        pathname={location.pathname}
        mobileNavOpen={isMobileNavOpen}
        mobileNavAnimating={isMobileNavAnimating}
        onToggleMobileNav={handleToggleMobileNav}
        onSearchNavigate={onSearchNavigate}
      />

      {isMobileNavMounted && (
        <div className="mobile-nav-root lg:hidden">
          <div
            data-testid="mobile-nav-backdrop"
            data-open={isMobileNavOpen}
            data-locked={isMobileNavAnimating}
            className="mobile-nav-backdrop fixed inset-0 z-popover bg-zinc-950/40 dark:bg-black/55"
            style={mobileNavStyle}
            onClick={() => requestCloseMobileNav()}
          />

          <aside
            ref={mobileNavPanelRef}
            id="mobile-navigation-panel"
            role="dialog"
            aria-modal="true"
            aria-label="移动端导航菜单"
            aria-busy={isMobileNavAnimating}
            data-testid="mobile-nav-panel"
            data-open={isMobileNavOpen}
            data-state={mobileNavPhase}
            data-interaction-locked={isMobileNavAnimating}
            data-locked={isMobileNavAnimating}
            data-swiping="false"
            className="mobile-nav-panel !fixed inset-y-0 left-0 z-nav-panel w-[min(18rem,85vw)] overflow-hidden border-r border-zinc-300 bg-paper text-ink shadow-none outline-none dark:border-zinc-700 dark:bg-zinc-950 dark:text-white"
            style={mobileNavPanelStyle}
            tabIndex={-1}
            onTouchStart={handleTouchStart}
            onTouchMove={handleTouchMove}
            onTouchEnd={handleTouchEnd}
          >
            <div className="mobile-nav-scroll px-3 pb-3 pt-3 no-scrollbar">
              <SiteSidebarBody
                pathname={location.pathname}
                onSelectPath={handleMobileNavItemSelect}
                onExternalClick={() => requestCloseMobileNav()}
                interactionDisabled={isMobileNavAnimating}
                labelPrefix="移动端"
                onClose={() => requestCloseMobileNav()}
                fillHeight
              />
            </div>
          </aside>
        </div>
      )}
    </>
  );
};

const Background = () => {
  return <div className="pointer-events-none fixed inset-0 z-[-1] overflow-hidden bg-paper dark:bg-void" />;
};

interface LayoutProps {
  children: React.ReactNode;
  hasViewTransition?: boolean;
}

const LayoutShell: React.FC<LayoutProps> = ({ children, hasViewTransition }) => {
  const location = useLocation();
  // 命令面板（Ctrl/Cmd+K / 顶栏与移动端搜索按钮）：懒加载，首次打开才拉 chunk。
  const [isPaletteOpen, setIsPaletteOpen] = useState(false);
  const isPaletteOpenRef = useRef(isPaletteOpen);
  isPaletteOpenRef.current = isPaletteOpen;
  const openPalette = useCallback(() => setIsPaletteOpen(true), []);
  const closePalette = useCallback(() => setIsPaletteOpen(false), []);
  const { isReadingMode } = useReadingMode();
  const prefersReducedMotion = useSiteReducedMotion();

  // 文章标题锚点偏移：单一数据源（--article-heading-offset）。普通模式实测
  // 吸顶导航栏（含 safe-area）高度 + 16px 余量；专注阅读无导航，仅保留
  // 1.5rem。JS（TOC 跳转/active 判断/hash 深链）与 CSS scroll-margin-top
  // 统一读取该变量，保证「点击跳转 = 激活判定 = 原生锚点」参考线一致。
  useEffect(() => {
    const root = document.documentElement;

    if (isReadingMode) {
      root.style.setProperty('--article-heading-offset', '1.5rem');
      return;
    }

    const navbar = document.querySelector('.site-navbar');
    const update = () => {
      const height = navbar instanceof HTMLElement ? navbar.getBoundingClientRect().height : 0;
      if (height > 0) {
        root.style.setProperty('--article-heading-offset', `${Math.round(height + 16)}px`);
      }
    };

    update();
    const observer =
      navbar instanceof HTMLElement && typeof ResizeObserver !== 'undefined' ? new ResizeObserver(update) : null;
    if (navbar instanceof HTMLElement && observer) {
      observer.observe(navbar);
    }
    window.addEventListener('resize', update);

    return () => {
      observer?.disconnect();
      window.removeEventListener('resize', update);
      // 恢复 CSS :root 默认值，避免残留内联值跨上下文污染。
      root.style.removeProperty('--article-heading-offset');
    };
  }, [isReadingMode]);
  // 路由内容切换（纯 CSS 动画，见 src/styles/motion-fallbacks.css）：
  // - 首帧/水合不淡入：等价原 AnimatePresence initial={false}，SSR 输出里也不能有
  //   opacity:0（内容不可见是硬伤）；
  // - 客户端 pathname 变化后重放一次 150ms opacity 淡入（原 routeTransition 参数）：
  //   用自增的 key 重挂容器来重放 CSS 动画，不按状态切换容器节点类型（历史上的
  //   div / motion.div 分支曾使整棵页面子树水合后重挂）；
  // - prefers-reduced-motion 或 View Transitions 生效时不加动画类（后者交给原生过渡）；
  // - 滚动回顶部原先由 AnimatePresence 的 onExitComplete 触发，现在在这里做；
  //   View Transitions 分支的滚动由 AppRoutes 在原生过渡回调里完成，不重复。
  const [routeAnimationKey, setRouteAnimationKey] = useState(0);
  const previousPathnameRef = useRef(location.pathname);

  useEffect(() => {
    if (previousPathnameRef.current === location.pathname) {
      return;
    }

    previousPathnameRef.current = location.pathname;
    setRouteAnimationKey((key) => key + 1);

    if (!hasViewTransition) {
      window.scrollTo({ top: 0, behavior: 'auto' as ScrollBehavior });
    }
  }, [hasViewTransition, location.pathname]);

  const shouldAnimateRoute = routeAnimationKey > 0 && !prefersReducedMotion && !hasViewTransition;

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        // 面板已打开时 Ctrl+K 直接关闭（toggle）；否则仅有其他弹层时让位，
        // 避免面板覆盖在分享/图片查看器之上抢焦点。
        if (isPaletteOpenRef.current) {
          event.preventDefault();
          setIsPaletteOpen(false);
          return;
        }
        if (hasOpenOverlay()) {
          return;
        }
        if (isEditableTarget(event.target)) {
          return;
        }
        event.preventDefault();
        setIsPaletteOpen(true);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Vercount 统计：路由变化即上报当前页访问并回填计数 span（适配 SPA 客户端导航，
  // 替代官方 <script> 仅首屏执行一次、无法为新路由上报/回填的局限）。
  // 不在卸载时中断请求：一次路由切换本身就是一次真实浏览，让在飞的请求完成才能
  // 如实计数；迟到的响应由服务层按 URL 丢弃，不会污染当前页。
  useEffect(() => {
    pingVercount();
  }, [location.pathname]);

  return (
    <div
      className={`site-shell relative flex min-h-screen flex-col lg:flex-row lg:flex-nowrap ${isReadingMode ? 'reading-mode-shell' : ''}`}
      data-reading-mode={isReadingMode ? 'true' : undefined}
    >
      <Background />
      {/* 键盘跳转链接：第一个可聚焦元素，Tab 直达正文（视觉隐藏，聚焦时显示） */}
      {!isReadingMode && (
        <a
          href="#main-content"
          className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[200] focus:inline-flex focus:min-h-11 focus:items-center focus:rounded-control focus:border focus:border-zinc-900 focus:bg-paper focus:px-4 focus:text-sm focus:font-semibold focus:text-zinc-900 dark:focus:border-zinc-100 dark:focus:text-zinc-100"
        >
          跳到主要内容
        </a>
      )}
      {/* 桌面左栏：lg 以上常驻为图标条，鼠标移入/键盘聚焦时展开为浮层（纯 CSS 驱动） */}
      {!isReadingMode && <SiteSidebar pathname={location.pathname} />}
      {/* 内容列：细顶栏（sticky）→ 正文（页面底部无全站 Footer，版权只在侧栏底部）。
          顶栏不再是 fixed，因此正文不需要「导航高度 + safe-area」的顶部内边距补偿。 */}
      <div className="flex min-w-0 flex-1 flex-col">
        {!isReadingMode && <Navbar onSearchNavigate={openPalette} />}
        <main
          id="main-content"
          tabIndex={-1}
          className="relative min-w-0 w-full flex-grow px-3 pt-6 pb-8 outline-none sm:px-6 sm:pt-8 md:pt-10"
        >
          {/* 路由内容容器：始终是同一个 div 节点类型（不按 hasViewTransition 分支换成
              另一种容器 —— 水合后该值翻转会让整棵页面子树卸载重挂：页面 state 丢失、
              图片重新加载、effect 重跑重复上报统计）。按需切换的只有：
              - hasViewTransition：挂 viewTransitionName，视觉过渡交给原生
                View Transition（AppRoutes 负责 startViewTransition 包裹）；
              - 否则：pathname 变化后由 CSS 重放一次进入淡入（无退出动画，避免旧页
                淡出造成的空白间隙；动画类见 motion-fallbacks.css）。 */}
          <div
            key={routeAnimationKey}
            data-testid="route-content"
            style={hasViewTransition ? { viewTransitionName: 'route-content' } : undefined}
            className={`mx-auto min-w-0 w-full max-w-7xl${shouldAnimateRoute ? ' route-content-fade-in' : ''}`}
          >
            {children}
          </div>
        </main>
        {!isReadingMode && (
          <Suspense fallback={null}>
            <BackToTop />
          </Suspense>
        )}
      </div>
      {/* 命令面板：条件挂载保证 chunk 懒加载（首次 Ctrl/Cmd+K 或点搜索按钮才拉取） */}
      {isPaletteOpen && (
        <Suspense fallback={null}>
          <CommandPalette onClose={closePalette} />
        </Suspense>
      )}
    </div>
  );
};

export const Layout: React.FC<LayoutProps> = (props) => (
  <ReadingModeProvider>
    <LayoutShell {...props} />
  </ReadingModeProvider>
);
