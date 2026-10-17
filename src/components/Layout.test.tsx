import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { Layout } from './Layout';

// 懒加载子组件用简单 stub 替代，避免测试中等待 dynamic import 与动画。
// 注意：Layout 以命名导出方式解构（import('./X').then(m => m.X)），mock 需提供同名导出。
vi.mock('@/components/BackToTop', () => ({
  BackToTop: () => <div data-testid="mock-back-to-top" />,
}));
vi.mock('@/components/CookieNotice', () => ({
  CookieNotice: () => <div data-testid="mock-cookie-notice" />,
}));
// 不蒜子统计：避免测试环境发起真实网络请求。
vi.mock('@/services/busuanzi', () => ({
  pingBusuanzi: vi.fn(),
  fillBusuanziSpans: vi.fn(),
}));

// 路由探针：MemoryRouter 不更新 window.location，断言跳转必须经
// useLocation 读取（否则「跳转到搜索页」的断言恒真、无回归保护）。
let probePathname = '';
const LocationProbe = () => {
  probePathname = useLocation().pathname;
  return null;
};

const renderLayout = () =>
  render(
    <MemoryRouter initialEntries={['/']}>
      <Layout>
        <LocationProbe />
        <div>页面内容</div>
      </Layout>
    </MemoryRouter>,
  );

// 桌面侧栏（jsdom 不应用 CSS 显隐，抽屉未挂载时侧栏是唯一一份导航清单）。
const sidebar = () => screen.getByRole('complementary', { name: '站点导航' });

describe('Layout', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // jsdom 不实现 matchMedia：ThemeToggle / Navbar 的媒体查询依赖它。
    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      value: vi.fn((query: string) => ({
        matches: false,
        media: query,
        onchange: null,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        addListener: vi.fn(),
        removeListener: vi.fn(),
        dispatchEvent: vi.fn(),
      })),
    });
    // 右滑呼出抽屉按 Tailwind lg(1024px) 判定是否移动端；jsdom 默认宽度恰为 1024，
    // 会被守卫挡掉，故按真实手机视口设小。
    Object.defineProperty(window, 'innerWidth', { configurable: true, writable: true, value: 500 });
  });

  afterEach(() => {
    // 移动端导航锁定 body 滚动：重置避免跨用例污染。
    document.body.style.overflow = '';
    localStorage.clear();
  });

  it('侧边栏渲染栏目导航（桌面常驻可见）', () => {
    renderLayout();
    const rail = sidebar();
    expect(within(rail).getByRole('link', { name: /^首页/ })).toBeInTheDocument();
    expect(within(rail).getByRole('link', { name: /^文章/ })).toBeInTheDocument();
    expect(within(rail).getByRole('link', { name: /^说说/ })).toBeInTheDocument();
    expect(within(rail).getByRole('link', { name: /^友链/ })).toBeInTheDocument();
  });

  it('侧边栏常驻含归档与标签（不再收纳进「更多」）', () => {
    renderLayout();
    const rail = sidebar();
    expect(within(rail).getByRole('link', { name: /^归档/ })).toBeInTheDocument();
    expect(within(rail).getByRole('link', { name: /^标签/ })).toBeInTheDocument();
  });

  it('侧边栏提供站内搜索入口（此前只能靠 Ctrl+K 打开命令面板）', () => {
    renderLayout();
    expect(within(sidebar()).getByRole('link', { name: /^站内搜索/ })).toHaveAttribute('href', '/search');
  });

  it('当前页在侧栏中以 aria-current 标记', () => {
    renderLayout();
    // MemoryRouter 初始路径为 '/'，侧栏「首页」项即当前页。
    expect(within(sidebar()).getByRole('link', { name: /^首页/ })).toHaveAttribute('aria-current', 'page');
  });

  it('渲染主题切换按钮', () => {
    renderLayout();
    expect(screen.getAllByRole('button', { name: /切换外观主题/ }).length).toBe(1);
  });

  it('渲染搜索入口按钮', () => {
    renderLayout();
    expect(screen.getByRole('button', { name: '打开搜索页' })).toBeInTheDocument();
  });

  it('桌面端导航含「开往」外链，指向 travellings 并新窗口打开', () => {
    renderLayout();
    const link = within(sidebar()).getByRole('link', { name: /^开往/ });
    expect(link).toHaveAttribute('href', 'https://www.travellings.cn/go.html');
    expect(link).toHaveAttribute('target', '_blank');
    expect(link).toHaveAttribute('rel', 'noopener noreferrer');
  });

  it('邮件入口就地打开（mailto 无需新窗口）', () => {
    renderLayout();
    const link = within(sidebar()).getByRole('link', { name: /^邮件/ });
    expect(link.getAttribute('href')).toMatch(/^mailto:/);
    expect(link).not.toHaveAttribute('target');
  });

  it('移动端抽屉同样含「开往」入口', async () => {
    const user = userEvent.setup();
    renderLayout();
    await user.click(screen.getByRole('button', { name: '打开导航菜单' }));
    await screen.findByRole('dialog', { name: '移动端导航菜单' });
    await waitForNavOpen();
    // 面板打开后共两处：桌面侧栏常驻一处 + 抽屉一处（jsdom 不应用 CSS 显隐）。
    const links = screen.getAllByRole('link', { name: /开往/ });
    expect(links).toHaveLength(2);
    for (const link of links) {
      expect(link).toHaveAttribute('href', 'https://www.travellings.cn/go.html');
      expect(link).toHaveAttribute('target', '_blank');
    }
  });

  it('渲染 children 内容', () => {
    renderLayout();
    expect(screen.getByText('页面内容')).toBeInTheDocument();
  });

  it('导航面板中不含反馈入口', async () => {
    const user = userEvent.setup();
    renderLayout();
    await user.click(screen.getByRole('button', { name: '打开导航菜单' }));
    const dialog = await screen.findByRole('dialog', { name: '移动端导航菜单' });
    await waitForNavOpen();
    expect(within(dialog).queryByRole('button', { name: /反馈/ })).not.toBeInTheDocument();
    expect(within(dialog).queryByRole('link', { name: /反馈/ })).not.toBeInTheDocument();
  });

  it('渲染页脚（站点标题与备案链接）', () => {
    renderLayout();
    expect(screen.getByRole('contentinfo')).toBeInTheDocument();
  });

  it('桌面侧栏不再有折叠按钮：静置图标条 + hover/聚焦展开全由 CSS 驱动', () => {
    renderLayout();
    expect(screen.queryByRole('button', { name: /侧边栏/ })).not.toBeInTheDocument();
    // 外层栏只占图标条宽度并作为定位上下文，内层 .site-sidebar-inner 是可溢出的浮层。
    expect(document.querySelector('#site-sidebar > .site-sidebar-inner')).not.toBeNull();
    expect(within(sidebar()).getByRole('link', { name: /^文章/ })).toBeInTheDocument();
  });

  it('Ctrl+K 打开命令面板', async () => {
    const user = userEvent.setup();
    renderLayout();
    await user.keyboard('{Control>}k{/Control}');
    await screen.findByRole('dialog', { name: '命令面板' });
    expect(probePathname).toBe('/');
  });

  it('点击搜索按钮打开命令面板', async () => {
    const user = userEvent.setup();
    renderLayout();
    await user.click(screen.getByRole('button', { name: '打开搜索页' }));
    await screen.findByRole('dialog', { name: '命令面板' });
    expect(probePathname).toBe('/');
  });

  // 等待移动端导航动画完成（data-state 从 opening 推进到 open）：
  // 用 waitFor 轮询状态而非固定 sleep —— 动画时长（MOBILE_NAV_ANIMATION_DURATION_MS）
  // 调整时测试不脆断，也不拖慢套件。
  const waitForNavOpen = async () => {
    await waitFor(() => {
      const panel = screen.getByTestId('mobile-nav-panel');
      expect(panel.getAttribute('data-state')).toBe('open');
    });
  };
  const waitForNavClosed = async () => {
    await waitFor(() => {
      expect(screen.queryByTestId('mobile-nav-panel')).not.toBeInTheDocument();
    });
  };

  it('汉堡按钮打开左侧抽屉并可再次点击关闭', async () => {
    const user = userEvent.setup();
    renderLayout();
    const menuButton = screen.getByRole('button', { name: '打开导航菜单' });
    await user.click(menuButton);
    expect(await screen.findByRole('dialog', { name: '移动端导航菜单' })).toBeInTheDocument();
    // 等待打开动画完成（否则切换关闭会被 isMobileNavAnimating 守卫忽略）。
    await waitForNavOpen();
    // aria-expanded 在面板真正进入 opening/open 态后才为 true：openMobileNav 先以
    // closed 态挂载面板（离屏）再经双 rAF 切入 opening，刚挂载那一刻仍是 false。
    expect(menuButton).toHaveAttribute('aria-expanded', 'true');
    expect(menuButton).toHaveAttribute('aria-controls', 'mobile-navigation-panel');

    // 动画结束后按钮文案切换为「收起导航菜单」，再次点击关闭。
    const closeButton = await screen.findByRole('button', { name: '收起导航菜单' });
    await user.click(closeButton);
    await waitForNavClosed();
    expect(screen.queryByRole('dialog', { name: '移动端导航菜单' })).not.toBeInTheDocument();
  });

  it('点击抽屉导航项后菜单关闭（close-then-navigate 守卫回归）', async () => {
    const user = userEvent.setup();
    renderLayout();
    await user.click(screen.getByRole('button', { name: '打开导航菜单' }));
    const dialog = await screen.findByRole('dialog', { name: '移动端导航菜单' });
    // 等待打开动画完成。
    await waitForNavOpen();

    // 抽屉内的栏目项是 button（先播关闭动画、动画结束再导航），不是 Link。
    await user.click(within(dialog).getByRole('button', { name: /^标签/ }));
    await waitForNavClosed();
    expect(screen.queryByRole('dialog', { name: '移动端导航菜单' })).not.toBeInTheDocument();
  });

  // 右滑呼出由 window 上的原生 touch 监听判定（不是 React 合成事件）。jsdom 没有
  // TouchEvent 构造器，用普通 Event 挂上 touches/changedTouches 即可满足读取。
  const dispatchSwipe = (fromX: number, toX: number, fromY = 400, toY = 400) => {
    const start = { clientX: fromX, clientY: fromY, target: document.body };
    const end = { clientX: toX, clientY: toY, target: document.body };

    const startEvent = new Event('touchstart', { bubbles: true, cancelable: true });
    Object.assign(startEvent, { touches: [start], changedTouches: [start] });
    window.dispatchEvent(startEvent);

    const endEvent = new Event('touchend', { bubbles: true, cancelable: true });
    Object.assign(endEvent, { touches: [], changedTouches: [end] });
    window.dispatchEvent(endEvent);
  };

  it('任意页面右滑即可呼出导航抽屉', async () => {
    renderLayout();
    dispatchSwipe(30, 260);
    const dialog = await screen.findByRole('dialog', { name: '移动端导航菜单' });
    expect(dialog).toBeInTheDocument();
  });

  it('纵向滚动与短促右滑不误开抽屉', async () => {
    renderLayout();
    dispatchSwipe(30, 340, 200, 700); // 横向位移被纵向位移压过
    dispatchSwipe(30, 60); // 未达位移阈值，也不构成甩动
    await waitFor(() => {
      expect(screen.queryByRole('dialog', { name: '移动端导航菜单' })).not.toBeInTheDocument();
    });
    expect(screen.queryByTestId('mobile-nav-panel')).not.toBeInTheDocument();
  });
});
