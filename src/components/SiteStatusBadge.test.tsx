import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderToStaticMarkup } from 'react-dom/server';
import { STATUS_REFRESH_INTERVAL_MS, type SiteStatusResult, type SiteStatusValue } from '@/services/siteStatus';

// 服务层 mock：组件测试只关心「收到什么状态就渲染什么」，网络分支由 siteStatus.test.ts 覆盖。
// getSiteStatus 必须保留可配置实现（含 signal），用于验证轮询/竞态/卸载取消。
const getSiteStatusMock = vi.hoisted(() => vi.fn<(signal?: AbortSignal) => Promise<SiteStatusResult>>());

vi.mock('@/services/siteStatus', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/services/siteStatus')>();
  return { ...actual, getSiteStatus: getSiteStatusMock };
});

import { SiteStatusBadge } from './SiteStatusBadge';

const STATUS_PAGE_URL = 'https://status.pldduck.com';

/** 默认挂起：首帧用例不产生异步更新，也符合「等待 API 时先渲染兜底」的真实时序。 */
const neverResolving = () => new Promise<SiteStatusResult>(() => {});

const getStatusLink = () => screen.getByRole('link');

describe('SiteStatusBadge — 首帧与兜底', () => {
  beforeEach(() => {
    getSiteStatusMock.mockReset();
    getSiteStatusMock.mockReturnValue(neverResolving());
  });

  it('首帧立即渲染可点击的中性「服务状态」入口，不等 API 返回', () => {
    render(<SiteStatusBadge />);

    const link = getStatusLink();
    expect(link).toHaveAttribute('href', STATUS_PAGE_URL);
    expect(link).toHaveAttribute('target', '_blank');
    expect(link).toHaveAttribute('rel', 'noopener noreferrer');
    expect(link).toHaveAttribute('data-status', 'unavailable');
    expect(screen.getByText('服务状态')).toHaveAttribute('aria-live', 'polite');
    // 复用既有导航行类名：文字随侧栏收缩淡出、图标落在 28px 的 sidebar-icon 槽里。
    expect(screen.getByText('服务状态')).toHaveClass('nav-item-label');
    expect(link.firstElementChild).toHaveClass('sidebar-icon');
    expect(link).toHaveClass('nav-item');
    // 首帧不得出现绿色勾选/故障图标语义。
    expect(link.querySelector('.text-emerald-600')).toBeNull();
    expect(link.querySelector('.text-red-600')).toBeNull();
  });

  it('SSR 首帧与客户端首帧渲染同一兜底文案（SSG 水合一致）', () => {
    const serverHtml = renderToStaticMarkup(<SiteStatusBadge />);
    expect(serverHtml).toContain('data-status="unavailable"');
    expect(serverHtml).toContain('服务状态');
    expect(serverHtml).not.toContain('所有服务正常');

    const { container } = render(<SiteStatusBadge />);
    expect(container.innerHTML).toContain('data-status="unavailable"');
    expect(container.textContent).toBe('服务状态');
  });

  it('无障碍名称说明状态与「新窗口打开 Better Stack 状态页」', () => {
    render(<SiteStatusBadge />);
    expect(screen.getByRole('link', { name: '服务状态（在新窗口打开 Better Stack 状态页）' })).toBeInTheDocument();
  });

  it('API 失败（服务返回 unavailable）时不隐藏入口，整块仍可点击跳转', async () => {
    getSiteStatusMock.mockResolvedValue({ status: 'unavailable' });
    const onExternalClick = vi.fn();
    render(<SiteStatusBadge onExternalClick={onExternalClick} />);
    await act(async () => {});

    const link = getStatusLink();
    expect(link).toHaveAttribute('data-status', 'unavailable');
    expect(link).toHaveAttribute('href', STATUS_PAGE_URL);
    expect(link).not.toHaveAttribute('aria-disabled');
    expect(screen.getByText('服务状态')).toBeInTheDocument();
    expect(link.querySelector('.text-emerald-600')).toBeNull();
    expect(link.querySelector('.text-red-600')).toBeNull();

    link.addEventListener('click', (event) => event.preventDefault(), { once: true });
    await userEvent.setup().click(link);
    expect(onExternalClick).toHaveBeenCalledTimes(1);
  });
});

describe('SiteStatusBadge — 四态更新', () => {
  beforeEach(() => {
    getSiteStatusMock.mockReset();
    getSiteStatusMock.mockReturnValue(neverResolving());
  });

  it.each<[SiteStatusValue, string, string]>([
    ['operational', '所有服务正常', 'text-emerald-600'],
    ['degraded', '部分服务异常', 'text-amber-500'],
    ['downtime', '服务中断', 'text-red-600'],
    ['maintenance', '服务维护中', 'text-sky-600'],
  ])('收到 %s 后更新文案与图标颜色', async (status, label, iconClass) => {
    getSiteStatusMock.mockResolvedValue({ status });
    render(<SiteStatusBadge />);

    expect(await screen.findByText(label)).toBeInTheDocument();

    const link = getStatusLink();
    expect(link).toHaveAttribute('data-status', status);
    expect(link.querySelector(`.${iconClass}`)).not.toBeNull();
    expect(screen.getByRole('link', { name: `服务状态：${label}（在新窗口打开 Better Stack 状态页）` })).toBe(link);
  });

  it('从兜底更新为 operational 后出现绿色勾选（绿色只在拿到真实状态之后）', async () => {
    let resolveRequest: ((result: SiteStatusResult) => void) | undefined;
    getSiteStatusMock.mockReturnValue(
      new Promise<SiteStatusResult>((resolve) => {
        resolveRequest = resolve;
      }),
    );
    render(<SiteStatusBadge />);
    expect(getStatusLink()).toHaveAttribute('data-status', 'unavailable');

    await act(async () => {
      resolveRequest?.({ status: 'operational' });
    });

    expect(getStatusLink()).toHaveAttribute('data-status', 'operational');
    expect(getStatusLink().querySelector('.text-emerald-600')).not.toBeNull();
  });
});

describe('SiteStatusBadge — 轮询、竞态与清理', () => {
  beforeEach(() => {
    getSiteStatusMock.mockReset();
    getSiteStatusMock.mockReturnValue(neverResolving());
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('挂载即请求一次，并每 60s 轮询', async () => {
    vi.useFakeTimers();
    getSiteStatusMock.mockResolvedValue({ status: 'operational' });

    render(<SiteStatusBadge />);
    await act(async () => {});
    expect(getSiteStatusMock).toHaveBeenCalledTimes(1);

    await act(async () => {
      vi.advanceTimersByTime(STATUS_REFRESH_INTERVAL_MS);
    });
    expect(getSiteStatusMock).toHaveBeenCalledTimes(2);
  });

  it('页面重新可见时立即刷新，不等下一拍轮询', async () => {
    getSiteStatusMock.mockResolvedValue({ status: 'degraded' });

    render(<SiteStatusBadge />);
    await act(async () => {});
    expect(getSiteStatusMock).toHaveBeenCalledTimes(1);

    await act(async () => {
      document.dispatchEvent(new Event('visibilitychange'));
    });
    expect(getSiteStatusMock).toHaveBeenCalledTimes(2);
  });

  it('旧请求迟到不覆盖新请求的结果', async () => {
    const deferred: Array<(result: SiteStatusResult) => void> = [];
    getSiteStatusMock.mockImplementation(
      () =>
        new Promise<SiteStatusResult>((resolve) => {
          deferred.push(resolve);
        }),
    );

    render(<SiteStatusBadge />);
    expect(deferred).toHaveLength(1);

    // 第二次请求（可见性刷新）先返回 operational。
    await act(async () => {
      document.dispatchEvent(new Event('visibilitychange'));
    });
    expect(deferred).toHaveLength(2);
    await act(async () => {
      deferred[1]({ status: 'operational' });
    });
    expect(screen.getByText('所有服务正常')).toBeInTheDocument();

    // 第一次请求后到：不得把已更新的结果覆盖回 downtime。
    await act(async () => {
      deferred[0]({ status: 'downtime' });
    });
    expect(screen.getByText('所有服务正常')).toBeInTheDocument();
    expect(screen.queryByText('服务中断')).not.toBeInTheDocument();
  });

  it('卸载后清理轮询与可见性监听，不再发起请求', async () => {
    vi.useFakeTimers();
    getSiteStatusMock.mockResolvedValue({ status: 'operational' });

    const { unmount } = render(<SiteStatusBadge />);
    await act(async () => {});
    expect(getSiteStatusMock).toHaveBeenCalledTimes(1);

    unmount();
    await act(async () => {
      vi.advanceTimersByTime(STATUS_REFRESH_INTERVAL_MS * 3);
    });
    document.dispatchEvent(new Event('visibilitychange'));

    expect(getSiteStatusMock).toHaveBeenCalledTimes(1);
  });

  it('卸载时中止等待：迟到的结果不再 setState（无 React 警告）', async () => {
    const signals: Array<AbortSignal | undefined> = [];
    let resolveRequest: ((result: SiteStatusResult) => void) | undefined;
    getSiteStatusMock.mockImplementation((signal) => {
      signals.push(signal);
      return new Promise<SiteStatusResult>((resolve) => {
        resolveRequest = resolve;
      });
    });
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});

    try {
      const { unmount } = render(<SiteStatusBadge />);
      expect(signals).toHaveLength(1);
      expect(signals[0]?.aborted).toBe(false);

      unmount();
      // effect 清理必须 abort 本次等待（共享请求留给另一个挂载点，不在这里断言）。
      expect(signals[0]?.aborted).toBe(true);

      await act(async () => {
        resolveRequest?.({ status: 'operational' });
      });
      expect(consoleError).not.toHaveBeenCalled();
    } finally {
      consoleError.mockRestore();
    }
  });
});

describe('SiteStatusBadge — 抽屉联动', () => {
  beforeEach(() => {
    getSiteStatusMock.mockReset();
    getSiteStatusMock.mockReturnValue(neverResolving());
  });

  it('点击整块外链通知宿主关闭抽屉', async () => {
    const onExternalClick = vi.fn();
    render(<SiteStatusBadge onExternalClick={onExternalClick} />);

    const link = getStatusLink();
    link.addEventListener('click', (event) => event.preventDefault(), { once: true });
    await userEvent.setup().click(link);

    expect(onExternalClick).toHaveBeenCalledTimes(1);
  });

  it('抽屉动画期间锁住点击（与导航行守卫一致），但入口仍渲染', async () => {
    const onExternalClick = vi.fn();
    render(<SiteStatusBadge onExternalClick={onExternalClick} interactionDisabled />);

    const link = getStatusLink();
    expect(link).toHaveAttribute('aria-disabled', 'true');
    link.addEventListener('click', (event) => event.preventDefault(), { once: true });
    await userEvent.setup().click(link);

    expect(onExternalClick).not.toHaveBeenCalled();
  });
});
