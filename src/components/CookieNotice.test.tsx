import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { CookieNotice, COOKIE_NOTICE_EXIT_DURATION_MS } from './CookieNotice';

const CONSENT_KEY = 'cookie-consent';

const renderNotice = () =>
  render(
    <MemoryRouter>
      <CookieNotice />
    </MemoryRouter>,
  );

/** 覆盖 matchMedia，让站点 useReducedMotion 读到 true（jsdom 默认没有 matchMedia）。 */
const stubPrefersReducedMotion = () => {
  const originalMatchMedia = window.matchMedia;
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: vi.fn((query: string) => ({
      matches: query.includes('prefers-reduced-motion'),
      media: query,
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  });
  return () => {
    Object.defineProperty(window, 'matchMedia', { writable: true, value: originalMatchMedia });
  };
};

describe('CookieNotice', () => {
  beforeEach(() => {
    window.localStorage.clear();
    window.sessionStorage.clear();
  });

  afterEach(() => {
    window.localStorage.clear();
    window.sessionStorage.clear();
  });

  it('未同意过时以居中 dialog 显示提示与隐私政策链接', () => {
    renderNotice();
    const dialog = screen.getByRole('dialog', { name: 'Cookie 与隐私' });
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    expect(screen.getByRole('link', { name: '隐私政策' })).toHaveAttribute('href', '/privacy');
    expect(screen.getByRole('button', { name: '同意' })).toBeInTheDocument();
  });

  it('已同意过时不显示提示', () => {
    window.localStorage.setItem(CONSENT_KEY, 'accepted');
    const { container } = renderNotice();
    expect(container.firstChild).toBeNull();
  });

  it('点击同意写入 localStorage 并隐藏', async () => {
    renderNotice();
    await userEvent.click(screen.getByRole('button', { name: '同意' }));
    expect(window.localStorage.getItem(CONSENT_KEY)).toBe('accepted');
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });

  it('点击关闭仅隐藏不持久化同意', async () => {
    renderNotice();
    await userEvent.click(screen.getByRole('button', { name: '关闭 Cookie 使用说明' }));
    expect(window.localStorage.getItem(CONSENT_KEY)).toBeNull();
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });

  it('localStorage 不可用时仍显示提示（不影响功能）', () => {
    const getItem = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    renderNotice();
    expect(screen.getByRole('dialog', { name: 'Cookie 与隐私' })).toBeInTheDocument();
    getItem.mockRestore();
  });

  it('关闭后释放 body 滚动锁（关掉弹窗不能把页面锁死）', async () => {
    renderNotice();
    expect(document.body.style.overflow).toBe('hidden');
    // 根元素同样被锁（WebKit 上只锁 body 不足以锁住视口）且 overscroll 被关掉。
    expect(document.documentElement.style.overflow).toBe('hidden');
    expect(document.documentElement.style.getPropertyValue('overscroll-behavior')).toBe('none');

    await userEvent.click(screen.getByRole('button', { name: '仅浏览' }));

    expect(document.body.style.overflow).toBe('');
    expect(document.documentElement.style.overflow).toBe('');
    expect(document.documentElement.style.getPropertyValue('overscroll-behavior')).toBe('');
  });

  it('视口矮时不会把对话框挤出视口：遮罩层可滚 + 对话框有 vh 兜底限高', () => {
    renderNotice();
    const dialog = screen.getByRole('dialog', { name: 'Cookie 与隐私' });
    const overlay = dialog.parentElement as HTMLElement;

    // 遮罩层是滚动容器，内容比视口高时由它承担滚动，而不是裁掉对话框顶部。
    expect(overlay).toHaveClass('grid', 'overflow-y-auto', 'overscroll-contain');
    // 对话框用 margin:auto 居中（溢出时退化为顶对齐，不出现上下同时被裁）。
    expect(dialog).toHaveClass('m-auto', 'overflow-y-auto');
    // 限高必须先有 100vh 兜底，再由 @supports(height:100svh) 升级：
    // Safari < 15.4 / Firefox < 101 会把裸 svh 声明整条丢弃，等于没有限高。
    expect(dialog.className).toContain('max-h-[calc(100vh-2rem)]');
    expect(dialog.className).toContain('supports-[height:100svh]:max-h-[calc(100svh-2rem)]');
    // 不能只剩裸 svh 一种写法。
    expect(dialog.className).not.toMatch(/(^|\s)max-h-\[calc\(100svh/);
  });

  // 动效已从 framer-motion（会把 motion chunk 拖进首屏）迁到 CSS：
  // 入场/退场只挂 CSS 动画类，节点上不再有 framer 写的内联 opacity/transform。
  it('入场用 CSS 动画类实现，不写内联 opacity:0', () => {
    renderNotice();
    const dialog = screen.getByRole('dialog', { name: 'Cookie 与隐私' });

    expect(dialog).toHaveClass('cookie-dialog-in');
    expect(dialog.parentElement).toHaveClass('cookie-overlay-in');
    expect(dialog.style.opacity).toBe('');
    expect(dialog.style.transform).toBe('');
  });

  it('关闭后先播退场动画（保持挂载），时长到才卸载', () => {
    vi.useFakeTimers();
    try {
      renderNotice();
      fireEvent.click(screen.getByRole('button', { name: '同意' }));

      // 退场类切在同一节点上，动画期间对话框仍在 DOM 里（保留原退场观感）。
      const dialog = screen.getByRole('dialog', { name: 'Cookie 与隐私' });
      expect(dialog).toHaveClass('cookie-dialog-out');
      expect(dialog.parentElement).toHaveClass('cookie-overlay-out');

      act(() => {
        vi.advanceTimersByTime(COOKIE_NOTICE_EXIT_DURATION_MS - 1);
      });
      expect(screen.getByRole('dialog', { name: 'Cookie 与隐私' })).toBeInTheDocument();

      act(() => {
        vi.advanceTimersByTime(1);
      });
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });

  it('reduced-motion 下 0 时长：关闭即卸载，不挂动画类', () => {
    const restoreMatchMedia = stubPrefersReducedMotion();

    try {
      renderNotice();
      const dialog = screen.getByRole('dialog', { name: 'Cookie 与隐私' });
      expect(dialog).not.toHaveClass('cookie-dialog-in');
      expect(dialog.parentElement).not.toHaveClass('cookie-overlay-in');

      fireEvent.click(screen.getByRole('button', { name: '同意' }));
      // 不做退场动画也就不该有 200ms 延迟。
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    } finally {
      restoreMatchMedia();
    }
  });
});
