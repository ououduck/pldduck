import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';

// 组件只负责「收到上限事件 → 弹出 3 秒」；检测与 10 分钟节流由 siteStatusStore
// 负责（覆盖在 siteStatusStore.test.ts）。这里 mock 订阅接口手动触发事件。
const subscribeWorkersLimitMock = vi.hoisted(() => vi.fn<(listener: () => void) => () => void>());

vi.mock('@/services/siteStatusStore', () => ({
  subscribeWorkersLimit: subscribeWorkersLimitMock,
  subscribeSiteStatus: vi.fn(),
}));

import { WorkersLimitToast, WORKERS_LIMIT_MESSAGE, WORKERS_LIMIT_TOAST_DURATION_MS } from './WorkersLimitToast';

let notifyListener: (() => void) | undefined;
let unsubscribeSpy: ReturnType<typeof vi.fn<() => void>>;

/** 模拟 store 判定「Workers 达到每日上限」（已通过 10 分钟节流）。 */
const emitWorkersLimit = () => {
  act(() => {
    notifyListener?.();
  });
};

beforeEach(() => {
  subscribeWorkersLimitMock.mockReset();
  notifyListener = undefined;
  unsubscribeSpy = vi.fn<() => void>();
  subscribeWorkersLimitMock.mockImplementation((listener) => {
    notifyListener = listener;
    return unsubscribeSpy;
  });
});

afterEach(() => {
  vi.useRealTimers();
});

describe('WorkersLimitToast', () => {
  it('默认不渲染，挂载即订阅一次', () => {
    render(<WorkersLimitToast />);

    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(subscribeWorkersLimitMock).toHaveBeenCalledTimes(1);
  });

  it('收到上限事件后弹出精确文案与 role="alert"，红色感叹号且无关闭按钮', () => {
    render(<WorkersLimitToast />);
    emitWorkersLimit();

    const alert = screen.getByRole('alert');
    expect(alert).toBeInTheDocument();
    // 文案逐字固定，不得改动。
    expect(alert.textContent).toBe('今日 Workers 请求次数达到上限，部分功能受限');
    expect(alert.textContent).toBe(WORKERS_LIMIT_MESSAGE);

    const icon = alert.querySelector('svg');
    expect(icon).not.toBeNull();
    expect(icon).toHaveClass('text-red-600');
    expect(icon).toHaveClass('dark:text-red-400');
    expect(icon).toHaveAttribute('aria-hidden', 'true');

    // 自动收回：没有关闭按钮/交互控件。
    expect(screen.queryByRole('button')).not.toBeInTheDocument();

    // 顶部固定居中、含 safe-area、层级高于顶栏/侧栏且低于 modal，移动端不溢出。
    expect(alert).toHaveClass('fixed');
    expect(alert).toHaveClass('z-[90]');
    expect(alert.className).toContain('safe-area-inset-top');
    expect(alert.className).toContain('max-w-[calc(100vw-1.5rem)]');
    expect(alert).toHaveClass('pointer-events-none');
  });

  it('3 秒后自动收回', () => {
    vi.useFakeTimers();
    render(<WorkersLimitToast />);
    emitWorkersLimit();

    expect(screen.getByRole('alert')).toBeInTheDocument();

    act(() => {
      vi.advanceTimersByTime(WORKERS_LIMIT_TOAST_DURATION_MS - 1);
    });
    expect(screen.getByRole('alert')).toBeInTheDocument();

    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('再次收到事件时重新计时，旧 timer 不会提前收回新提示', () => {
    vi.useFakeTimers();
    render(<WorkersLimitToast />);

    emitWorkersLimit();
    act(() => {
      vi.advanceTimersByTime(WORKERS_LIMIT_TOAST_DURATION_MS - 500);
    });

    emitWorkersLimit();
    act(() => {
      vi.advanceTimersByTime(WORKERS_LIMIT_TOAST_DURATION_MS - 500);
    });
    // 距第二次弹出才 2.5s，提示仍在。
    expect(screen.getByRole('alert')).toBeInTheDocument();

    act(() => {
      vi.advanceTimersByTime(500);
    });
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('卸载时取消订阅并清理计时器（卸载后不再 setState）', () => {
    vi.useFakeTimers();
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});

    try {
      const { unmount } = render(<WorkersLimitToast />);
      emitWorkersLimit();
      expect(screen.getByRole('alert')).toBeInTheDocument();

      unmount();
      expect(unsubscribeSpy).toHaveBeenCalledTimes(1);

      // 若 timer 未清理，这里会在已卸载组件上 setState。
      act(() => {
        vi.advanceTimersByTime(WORKERS_LIMIT_TOAST_DURATION_MS * 2);
      });
      expect(consoleError).not.toHaveBeenCalled();
      expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    } finally {
      consoleError.mockRestore();
    }
  });
});
