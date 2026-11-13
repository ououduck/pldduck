import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, it, expect } from 'vitest';
import { easeOut, easeSmooth } from './motion';
import { getHeadingScrollOffset } from './scroll';

describe('motion 常量', () => {
  it('缓动曲线为标准 cubic-bezier 数组', () => {
    expect(easeOut).toHaveLength(4);
    expect(easeSmooth).toHaveLength(4);
    for (const value of [...easeOut, ...easeSmooth]) {
      expect(typeof value).toBe('number');
    }
  });
});

/**
 * 路由进入淡入已从 framer-motion 迁到 CSS（motion-fallbacks.css）。原 motion.test
 * 断言的 routeTransition 变体（只有 enter、无 exit）改由这份 CSS 契约覆盖：
 * 类存在、时长/曲线与原变体一致（0.15s + easeSmooth 同值曲线）、reduced-motion 有兜底。
 */
describe('路由淡入 CSS 兜底', () => {
  const css = readFileSync(resolve(process.cwd(), 'src/styles/motion-fallbacks.css'), 'utf8');

  it('提供 .route-content-fade-in 且只有进入态（不淡出）', () => {
    expect(css).toContain('@keyframes route-content-fade-in');
    expect(css).toContain('.route-content-fade-in');
    expect(css).not.toContain('route-content-fade-out');
    // 关键帧另起名字：index.css 已有给 View Transitions 用的 route-fade-in/out。
    expect(css).not.toMatch(/@keyframes route-fade-(in|out)\s*\{/);
  });

  it('时长 150ms、曲线与 easeSmooth 一致（0.22, 1, 0.36, 1）', () => {
    expect(css).toContain('--duration-fast, 150ms');
    expect(css).toContain('cubic-bezier(0.22, 1, 0.36, 1)');
  });

  it('reduced-motion 下禁用动画（内容直接可见）', () => {
    const reducedMotionBlock = css.slice(css.indexOf('@media (prefers-reduced-motion: reduce)'));
    expect(reducedMotionBlock).toContain('.route-content-fade-in');
    expect(reducedMotionBlock).toContain('animation: none');
  });
});

describe('scroll offset', () => {
  it('标题锚点偏移读取 CSS 变量，缺失时回退为正数', () => {
    expect(getHeadingScrollOffset()).toBeGreaterThan(0);
  });
});
