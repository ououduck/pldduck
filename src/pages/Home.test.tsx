import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { Home } from './Home';
import { siteConfig } from '@config/site.config';
import type { Friend, PostMetadata, ShuoShuo } from '@/types';

// 路由探针：MemoryRouter 不更新 window.location，跳转结果只能通过 useLocation 读取。
let probeLocation = '';
const LocationProbe = () => {
  const location = useLocation();
  probeLocation = `${location.pathname}${location.search}`;
  return null;
};

// vi.mock 工厂会在模块图求值时执行，早于文件内的普通 const：夹具必须经
// vi.hoisted 提升，否则工厂里的引用落在暂时性死区里（Cannot access before init）。
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
    {
      id: 'beta',
      title: '文章乙',
      excerpt: '乙的摘要',
      date: '2026-02-01',
      tags: [],
      category: '分享',
      filePath: 'posts/beta.md',
      readTime: '5 分钟',
    },
    {
      id: 'gamma',
      title: '文章丙',
      excerpt: '丙的摘要',
      date: '2026-03-01',
      tags: [],
      category: '教程',
      filePath: 'posts/gamma.md',
      readTime: '2 分钟',
    },
    {
      id: 'delta',
      title: '文章丁',
      excerpt: '丁的摘要',
      date: '2026-04-01',
      tags: [],
      category: '测评',
      filePath: 'posts/delta.md',
      readTime: '2 分钟',
    },
  ] as PostMetadata[],
  shuoshuo: [
    { id: 's1', date: '2026-05-01', content: '今天学了 **Markdown** 加粗语法', filePath: 'shuoshuo/s1.md' },
    { id: 's2', date: '2026-05-02', content: '构建速度又快了一点', filePath: 'shuoshuo/s2.md' },
  ] as ShuoShuo[],
  friends: [
    { name: '在线的博客', description: '写前端的朋友', avatar: 'https://a.test/1.png', url: 'https://a.test' },
    {
      name: '失联的博客',
      description: '打不开了',
      avatar: 'https://b.test/2.png',
      url: 'https://b.test',
      unavailable: true,
    },
  ] as Friend[],
}));

// 数据层与弹层用 stub 替代：聚焦首页自身的渲染与交互，不依赖仓库内的真实内容。
vi.mock('@/services/posts', () => ({ getInitialPosts: () => fixtures.posts }));
vi.mock('@/services/shuoshuo', () => ({ getInitialShuoShuo: () => fixtures.shuoshuo }));
vi.mock('@/services/friends', () => ({ getInitialFriends: () => fixtures.friends }));
vi.mock('@/services/readingHistory', () => ({
  getReadingHistory: vi.fn(() => []),
  saveReadingHistory: vi.fn(),
  subscribeReadingHistory: vi.fn(() => () => {}),
  removeReadingHistory: vi.fn(),
}));
vi.mock('@/utils/clipboard', () => ({ copyTextToClipboard: vi.fn(async () => true) }));
vi.mock('@/components/ShareModal', () => ({ ShareModal: () => <div data-testid="mock-share-modal" /> }));

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

  it('「最新文章」按时间倒序只展示配置数量的文章卡片', () => {
    renderHome();
    expect(screen.getAllByRole('article')).toHaveLength(3);
    // 夹具中 date 最新的「文章丁」入选、最旧的「文章甲」被截断（每卡有封面与标题两条链接）。
    expect(screen.getAllByRole('link', { name: '阅读文章：文章丁' }).length).toBeGreaterThan(0);
    expect(screen.queryAllByRole('link', { name: '阅读文章：文章甲' })).toHaveLength(0);
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

  it('站点入口磁贴按配置渲染，外链标注「外部站点」且不省略 rel', () => {
    renderHome();
    const internalEntry = siteConfig.portal?.entries?.find((entry) => entry.url.startsWith('/'));
    const externalEntry = siteConfig.portal?.entries?.find((entry) => !entry.url.startsWith('/'));
    expect(internalEntry).toBeDefined();
    expect(externalEntry).toBeDefined();

    expect(screen.getByRole('link', { name: `前往 ${internalEntry!.title}` })).toHaveAttribute(
      'href',
      internalEntry!.url,
    );
    const externalLink = screen.getByRole('link', { name: `前往 ${externalEntry!.title}（外部站点）` });
    expect(externalLink).toHaveAttribute('href', externalEntry!.url);
    expect(externalLink).toHaveAttribute('rel', 'noopener noreferrer');
  });

  it('说说摘要剥掉 Markdown 标记并链到独立页', () => {
    renderHome();
    expect(screen.getByRole('link', { name: /构建速度又快了一点/ })).toHaveAttribute('href', '/shuoshuo/s2');
    expect(screen.getByText(/今天学了\s*Markdown\s*加粗语法/)).toBeInTheDocument();
    expect(screen.queryByText(/\*\*/)).not.toBeInTheDocument();
  });

  it('友情链接过滤已失联条目', () => {
    renderHome();
    expect(screen.getByRole('link', { name: /在线的博客/ })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /失联的博客/ })).not.toBeInTheDocument();
  });

  it('复制 QQ 号成功后给出播报', async () => {
    const { copyTextToClipboard } = await import('@/utils/clipboard');
    const user = userEvent.setup();
    renderHome();

    await user.click(screen.getByRole('button', { name: /复制 QQ 号/ }));
    expect(copyTextToClipboard).toHaveBeenCalledWith(siteConfig.social.qq);
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('QQ 号已复制到剪贴板'));
  });

  it('点击文章卡片的分享按钮打开分享弹层', async () => {
    const user = userEvent.setup();
    renderHome();

    await user.click(screen.getAllByRole('button', { name: /分享文章：/ })[0]);
    expect(await screen.findByTestId('mock-share-modal')).toBeInTheDocument();
  });
});
