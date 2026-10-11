import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { Home } from './Home';
import { siteConfig } from '@config/site.config';

// 路由探针：MemoryRouter 不更新 window.location，跳转结果只能通过 useLocation 读取。
let probeLocation = '';
const LocationProbe = () => {
  const location = useLocation();
  probeLocation = `${location.pathname}${location.search}`;
  return null;
};

// 数据层与剪贴板用 stub 替代：门户页只应依赖站点配置，mock 掉取数函数后
// 任何「文章/说说/友链正文」的意外泄漏都会直接变成取数调用缺失的报错。
const fixtures = vi.hoisted(() => ({
  posts: [
    {
      id: 'alpha',
      title: '文章甲',
      excerpt: '甲的摘要',
      date: '2026-01-01',
      tags: ['React'],
      category: '教程',
      filePath: 'posts/alpha.md',
      readTime: '3 分钟',
    },
  ],
}));

vi.mock('@/services/posts', () => ({ getInitialPosts: () => fixtures.posts }));
vi.mock('@/utils/clipboard', () => ({ copyTextToClipboard: vi.fn(async () => true) }));

const renderHome = (initialEntry = '/') =>
  render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <Routes>
        <Route
          path="/"
          element={
            <>
              <Home />
              <LocationProbe />
            </>
          }
        />
        <Route
          path="/search"
          element={
            <>
              <div>搜索结果页</div>
              <LocationProbe />
            </>
          }
        />
      </Routes>
    </MemoryRouter>,
  );

describe('Home', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    probeLocation = '';
    // jsdom 不实现 matchMedia：useReducedMotion / useMediaQuery 等依赖媒体查询。
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
  });

  it('渲染站名与自我介绍（首帧即最终可见状态，无入场动画）', () => {
    renderHome();
    expect(screen.getByRole('heading', { level: 1, name: siteConfig.title })).toBeInTheDocument();
    expect(screen.getByText(siteConfig.description)).toBeInTheDocument();
  });

  it('纯导流：不出现任何文章/说说/友链正文，也不链向具体文章', () => {
    const { container } = renderHome();
    expect(screen.queryAllByRole('article')).toHaveLength(0);
    expect(screen.queryByText('文章甲')).not.toBeInTheDocument();
    expect(screen.queryAllByRole('link', { name: /^阅读文章：/ })).toHaveLength(0);
    // 站外出口由开源项目行承担：外链必须新标签打开且带 rel 保护。
    expect(container.querySelectorAll('a[target="_blank"][rel~="noopener"]').length).toBeGreaterThan(0);
  });

  it('站内搜索提交后跳转到 /search 并带上 q 参数', async () => {
    const user = userEvent.setup();
    renderHome();

    await user.type(screen.getByRole('searchbox', { name: '站内搜索' }), 'react hooks');
    await user.click(screen.getByRole('button', { name: '搜索' }));

    await waitFor(() => expect(probeLocation).toBe('/search?q=react%20hooks'));
  });

  it('空查询不跳转', async () => {
    const user = userEvent.setup();
    renderHome();

    await user.click(screen.getByRole('button', { name: '搜索' }));
    expect(probeLocation).toBe('/');
  });

  it('残留的筛选/分页参数被清除，首页只保留无参 URL', async () => {
    renderHome('/?category=%E6%95%99%E7%A8%8B&sort=oldest&page=2');
    await waitFor(() => expect(probeLocation).toBe('/'));
  });

  it('旧版首页的 ?q= 分享链接转交搜索页处理', async () => {
    renderHome('/?q=react');
    await waitFor(() => expect(probeLocation).toBe('/search?q=react'));
  });

  it('站点入口磁贴按配置渲染，开源项目外链保留 target 与 rel', () => {
    renderHome();
    const internalEntry = siteConfig.portal?.entries?.find((entry) => entry.url.startsWith('/'));
    expect(internalEntry).toBeDefined();

    expect(screen.getByRole('link', { name: `前往 ${internalEntry!.title}` })).toHaveAttribute(
      'href',
      internalEntry!.url,
    );

    // 门户清单里已无站外条目，站外语义由开源项目行承担。
    const project = siteConfig.portal?.projects?.find((item) => !item.url.startsWith('/'));
    expect(project).toBeDefined();

    const externalLink = screen.getByRole('link', { name: new RegExp(project!.title) });
    expect(externalLink).toHaveAttribute('href', project!.url);
    expect(externalLink).toHaveAttribute('target', '_blank');
    expect(externalLink).toHaveAttribute('rel', 'noopener noreferrer');
  });

  it('首页承载站点身份文案：站主自述、「关于本站」正文与技术栈清单', () => {
    renderHome();
    expect(screen.getByText(siteConfig.author.bio)).toBeInTheDocument();

    const identity = siteConfig.portal?.identity;
    const stack = siteConfig.portal?.stack ?? [];
    expect(identity).toBeTruthy();
    expect(stack.length).toBeGreaterThan(0);

    const about = screen.getByRole('heading', { level: 2, name: '关于本站' }).closest('section');
    expect(about).not.toBeNull();
    expect(within(about!).getByText(identity!)).toBeInTheDocument();
    stack.forEach((item) => expect(within(about!).getByText(item)).toBeInTheDocument());
  });

  it('原关于页的订阅引导卡落在首页末尾', () => {
    renderHome();
    expect(screen.getByRole('heading', { level: 2, name: '订阅新文章提醒' })).toBeInTheDocument();
  });

  it('复制 QQ 号成功后给出播报', async () => {
    const { copyTextToClipboard } = await import('@/utils/clipboard');
    const user = userEvent.setup();
    renderHome();

    await user.click(screen.getByRole('button', { name: /复制 QQ 号/ }));
    expect(copyTextToClipboard).toHaveBeenCalledWith(siteConfig.social.qq);
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('QQ 号已复制到剪贴板'));
  });
});
