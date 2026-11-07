import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderToStaticMarkup } from 'react-dom/server';
import type { SiteStatusResult, SiteStatusValue } from '@/services/siteStatus';

// 状态轮询已收敛到全局 store（见 siteStatusStore.test.ts）：
// 组件测试只 mock 订阅接口，验证「store 回调什么状态就渲染什么」以及卸载取消订阅。
type StoreListener = (result: SiteStatusResult) => void;

const subscribeSiteStatusMock = vi.hoisted(() => vi.fn<(listener: StoreListener) => () => void>());

vi.mock('@/services/siteStatusStore', () => ({
  subscribeSiteStatus: subscribeSiteStatusMock,
  subscribeWorkersLimit: vi.fn(),
}));

import { SiteStatusBadge } from './SiteStatusBadge';

const STATUS_PAGE_URL = 'https://status.pldduck.com';

let storeListener: StoreListener | undefined;
let unsubscribeSpy: ReturnType<typeof vi.fn<() => void>>;

/** 默认订阅：只记录回调、不自发更新（首帧用例需要保持中性兜底）。 */
const useStoreSubscription = () => {
  storeListener = undefined;
  unsubscribeSpy = vi.fn<() => void>();
  subscribeSiteStatusMock.mockImplementation((listener) => {
    storeListener = listener;
    return unsubscribeSpy;
  });
};

/** 模拟 store 下发一次新结果（等同于轮询/可见性补刷返回）。 */
const emitStatus = async (result: SiteStatusResult) => {
  await act(async () => {
    storeListener?.(result);
  });
};

const getStatusLink = () => screen.getByRole('link');

beforeEach(() => {
  subscribeSiteStatusMock.mockReset();
  useStoreSubscription();
});

describe('SiteStatusBadge — 首帧与兜底', () => {
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
    // 挂载即向全局 store 订阅一次（轮询由 store 统一负责，组件不自己发请求）。
    expect(subscribeSiteStatusMock).toHaveBeenCalledTimes(1);
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

  it('API 失败（store 下发 unavailable）时不隐藏入口，整块仍可点击跳转', async () => {
    const onExternalClick = vi.fn();
    render(<SiteStatusBadge onExternalClick={onExternalClick} />);
    await emitStatus({ status: 'unavailable' });

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

  it('订阅时立即采用 store 的当前快照（重新挂载不必等网络）', () => {
    subscribeSiteStatusMock.mockImplementation((listener) => {
      storeListener = listener;
      // 真实 store 的契约：订阅回调会立即收到当前值。
      listener({ status: 'operational' });
      return unsubscribeSpy;
    });

    render(<SiteStatusBadge />);
    expect(getStatusLink()).toHaveAttribute('data-status', 'operational');
    expect(screen.getByText('所有服务正常')).toBeInTheDocument();
  });
});

describe('SiteStatusBadge — 四态更新', () => {
  it.each<[SiteStatusValue, string, string]>([
    ['operational', '所有服务正常', 'text-emerald-600'],
    ['degraded', '部分服务异常', 'text-amber-500'],
    ['downtime', '服务中断', 'text-red-600'],
    ['maintenance', '服务维护中', 'text-sky-600'],
  ])('store 下发 %s 后更新文案与图标颜色', async (status, label, iconClass) => {
    render(<SiteStatusBadge />);
    expect(getStatusLink()).toHaveAttribute('data-status', 'unavailable');

    await emitStatus({ status });

    expect(screen.getByText(label)).toBeInTheDocument();
    const link = getStatusLink();
    expect(link).toHaveAttribute('data-status', status);
    expect(link.querySelector(`.${iconClass}`)).not.toBeNull();
    expect(screen.getByRole('link', { name: `服务状态：${label}（在新窗口打开 Better Stack 状态页）` })).toBe(link);
  });

  it('从兜底更新为 operational 后出现绿色勾选（绿色只在拿到真实状态之后）', async () => {
    render(<SiteStatusBadge />);
    expect(getStatusLink()).toHaveAttribute('data-status', 'unavailable');

    await emitStatus({ status: 'operational' });

    expect(getStatusLink()).toHaveAttribute('data-status', 'operational');
    expect(getStatusLink().querySelector('.text-emerald-600')).not.toBeNull();
  });

  it('Workers 上限结果（unavailable + workersLimit）仍按中性兜底展示，不显示故障色', async () => {
    render(<SiteStatusBadge />);
    await emitStatus({ status: 'unavailable', workersLimit: true });

    expect(getStatusLink()).toHaveAttribute('data-status', 'unavailable');
    expect(screen.getByText('服务状态')).toBeInTheDocument();
    expect(getStatusLink().querySelector('.text-red-600')).toBeNull();
    expect(getStatusLink().querySelector('.text-emerald-600')).toBeNull();
  });
});

describe('SiteStatusBadge — 订阅清理', () => {
  it('卸载时取消订阅（全局轮询由 store 按订阅者数量清理）', () => {
    const { unmount } = render(<SiteStatusBadge />);
    expect(subscribeSiteStatusMock).toHaveBeenCalledTimes(1);
    expect(unsubscribeSpy).not.toHaveBeenCalled();

    unmount();
    expect(unsubscribeSpy).toHaveBeenCalledTimes(1);
  });

  it('卸载后迟到的状态不再触发渲染（无 React 警告）', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      const { unmount } = render(<SiteStatusBadge />);
      const listener = storeListener;

      unmount();
      await act(async () => {
        listener?.({ status: 'operational' });
      });

      expect(consoleError).not.toHaveBeenCalled();
    } finally {
      consoleError.mockRestore();
    }
  });
});

describe('SiteStatusBadge — 抽屉联动', () => {
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
