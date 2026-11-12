// @vitest-environment node
import { describe, it, expect } from 'vitest';

/**
 * 服务层会被 Post.tsx 引入，因此也进了 SSR 包：模块顶层与导出函数在 node 环境
 * （无 window / document）必须可导入、可安全空跑。见 ai-rules/testing.md 规则 9。
 */
describe('vercount 服务的 SSR 安全性', () => {
  it('无 window / document 时模块可导入，导出函数调用不抛错', async () => {
    expect(typeof window).toBe('undefined');
    expect(typeof document).toBe('undefined');

    const { pingVercount, fillVercountSpans, VERCUNT_PENDING_TEXT } = await import('./vercount');

    expect(VERCUNT_PENDING_TEXT).toBe('加载中');
    expect(() => pingVercount()).not.toThrow();
    expect(() => fillVercountSpans()).not.toThrow();
  });
});
