/**
 * 主题切换按钮：浅色/深色互切，首帧渲染默认态后在 effect 中纠正（SSG 安全），
 * 并监听 dblog:toggle-theme 自定义事件供命令面板等外部入口调用。
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Moon, Sun } from 'lucide-react';
import { useReducedMotion as useSiteReducedMotion } from '@/hooks/useReducedMotion';

const TEXT = {
  themeLight: '浅色',
  themeDark: '深色',
};

const ThemeToggle = () => {
  type Theme = 'light' | 'dark';
  const hasInitializedThemeRef = useRef(false);
  const prefersReducedMotion = useSiteReducedMotion();
  const [theme, setTheme] = useState<Theme>('light');

  useEffect(() => {
    const root = document.documentElement;
    const systemQuery = window.matchMedia('(prefers-color-scheme: dark)');

    // 水合后确定实际主题：优先恢复用户保存的显式亮/暗选择；无保存值（或旧版
    // 'system'）时按系统偏好解析初始明暗，即“打开网页自动检测系统”。
    // 该解析只在首次挂载（水合恢复）时生效，后续切换不会被旧值反向覆盖。
    let effectiveTheme: Theme = theme;
    let saved: string | null = null;
    try {
      saved = localStorage.getItem('theme');
    } catch {
      // 浏览器存储不可用时，主题持久化为可选能力。
    }

    if (!hasInitializedThemeRef.current) {
      if (saved === 'light' || saved === 'dark') {
        effectiveTheme = saved;
      } else {
        effectiveTheme = systemQuery.matches ? 'dark' : 'light';
      }
    }

    const applyTheme = (nextTheme: Theme) => {
      const shouldBeDark = nextTheme === 'dark';
      const isDarkApplied = root.classList.contains('dark');

      const applyChanges = () => {
        if (shouldBeDark) {
          root.classList.add('dark');
        } else {
          root.classList.remove('dark');
        }
      };

      // 仅当主题 class 实际需要变化时才播动画：水合恢复保存的主题后，setTheme
      // 触发的 effect 重跑是幂等应用（class 已正确），不应再产生可见过渡；
      // 首次恢复（hasInitializedThemeRef 尚为 false）也直接生效、跳过动画。
      // 统一只走原生 View Transitions（不支持时直接应用，无全局 CSS 过渡）。
      const themeActuallyChanges = shouldBeDark !== isDarkApplied;
      if (
        themeActuallyChanges &&
        hasInitializedThemeRef.current &&
        !prefersReducedMotion &&
        document.startViewTransition
      ) {
        try {
          document.startViewTransition(() => {
            applyChanges();
          });
        } catch {
          // 已有活动中的 View Transition（快速连点主题按钮）时按规范同步抛
          // InvalidStateError：直接应用主题，避免异常冒泡到 ErrorBoundary
          // 导致整页崩溃且主题切换不生效。
          applyChanges();
        }
      } else {
        applyChanges();
      }
    };

    if (effectiveTheme !== theme) {
      // 首次应用检测/恢复得到的主题：跳过过渡动画，直接生效。
      // hasInitializedThemeRef 保持 false 直到 applyTheme 完成，确保首次
      // 恢复不会误走 startViewTransition / theme-switching 动画分支。
      setTheme(effectiveTheme);
    }

    applyTheme(effectiveTheme);
    hasInitializedThemeRef.current = true;
  }, [prefersReducedMotion, theme]);

  const toggleTheme = useCallback(() => {
    const next = theme === 'light' ? 'dark' : 'light';
    setTheme(next);
    // 仅显式切换才持久化：系统检测出的默认值不落盘，保证每次打开页面都
    // 重新按系统偏好检测；用户点击一次后，该选择稳定沿用。
    try {
      localStorage.setItem('theme', next);
    } catch {
      // 浏览器存储不可用时，主题持久化为可选能力。
    }
  }, [theme]);

  // 命令面板等外部入口通过自定义事件请求切换主题（不直接依赖组件实例）。
  useEffect(() => {
    const handleExternalToggle = () => toggleTheme();
    window.addEventListener('dblog:toggle-theme', handleExternalToggle);
    return () => window.removeEventListener('dblog:toggle-theme', handleExternalToggle);
  }, [toggleTheme]);

  const currentThemeLabel = theme === 'light' ? TEXT.themeLight : TEXT.themeDark;
  const nextThemeLabel = theme === 'light' ? TEXT.themeDark : TEXT.themeLight;

  return (
    <button
      onClick={toggleTheme}
      className="group relative inline-flex h-11 w-11 items-center justify-center rounded-icon border border-zinc-300 bg-zinc-100 text-ink transition-colors hover:border-zinc-500 hover:bg-zinc-200 active:bg-zinc-300 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100 dark:hover:border-zinc-500 dark:active:bg-zinc-700"
      aria-label={`切换外观主题，当前为${currentThemeLabel}，点击切换为${nextThemeLabel}`}
    >
      <AnimatePresence mode="wait" initial={false}>
        <motion.div
          key={theme}
          initial={prefersReducedMotion ? false : { opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={prefersReducedMotion ? undefined : { opacity: 0 }}
          transition={{ duration: prefersReducedMotion ? 0 : 0.15 }}
        >
          {theme === 'light' ? <Sun size={18} /> : <Moon size={18} />}
        </motion.div>
      </AnimatePresence>
      <span className="pointer-events-none absolute left-1/2 top-full mt-2 -translate-x-1/2 whitespace-nowrap rounded-control border border-zinc-700 bg-black px-2 py-1 text-xs text-white opacity-0 transition-opacity group-hover:opacity-100">
        {currentThemeLabel}
      </span>
    </button>
  );
};

export { ThemeToggle };
