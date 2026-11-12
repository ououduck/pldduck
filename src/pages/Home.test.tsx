import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderToString } from 'react-dom/server';
import { HelmetProvider } from 'react-helmet-async';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { Home } from './Home';
import { siteConfig } from '@config/site.config';
import { ISSUE_SUBSCRIPTION_URL } from '@/components/IssueSubscriptionCard';
import { getHomeStats } from '@/services/homeStats';
import { getInitialPosts } from '@/services/posts';
import { fillVercountSpans } from '@/services/vercount';
import { assetUrl } from '@/utils/siteUrl';

// Vercount 上报：避免 jsdom 里发起真实网络请求（回填行为由 vercount.test.ts 覆盖）。
vi.mock('@/services/vercount', () => ({
  pingVercount: vi.fn(),
  fillVercountSpans: vi.fn(),
  VERCUNT_PENDING_TEXT: '加载中',
}));
// 服务状态轮询收敛在全局 store：只订阅、不请求。状态文案断言由 SiteStatusBadge.test.tsx 覆盖。
vi.mock('@/services/siteStatusStore', () => ({
  subscribeSiteStatus: vi.fn(() => () => {}),
  subscribeWorkersLimit: vi.fn(() => () => {}),
}));

const mockedFillVercountSpans = vi.mocked(fillVercountSpans);

const LocationProbe = () => {
  const location = useLocation();
  return (
    <div data-testid="location">
      {location.pathname}
      {location.search}
    </div>
  );
};

const renderHome = () =>
  render(
    <HelmetProvider>
      <MemoryRouter initialEntries={['/']}>
        <Home />
        <LocationProbe />
      </MemoryRouter>
    </HelmetProvider>,
  );

describe('Home', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    // 清空 Helmet 写入的 head 标签，避免跨用例污染。
    document.head.querySelectorAll('[data-rh="true"]').forEach((element) => element.remove());
  });

  it('首帧渲染站主身份：头像、名字（h1）、身份与作者介绍原文', () => {
    renderHome();

    expect(screen.getByRole('heading', { level: 1, name: siteConfig.author.name })).toBeInTheDocument();
    expect(screen.getByRole('img', { name: siteConfig.author.name })).toHaveAttribute(
      'src',
      assetUrl(siteConfig.author.avatar),
    );
    expect(screen.getByText(siteConfig.author.bio)).toBeInTheDocument();
    expect(screen.getByText(siteConfig.author.role)).toBeInTheDocument();
  });

  it('深色唯一：模板首帧即 dark，没有浅色主题与 localStorage 启动脚本', () => {
    const indexHtml = readFileSync(resolve(process.cwd(), 'index.html'), 'utf8');

    expect(indexHtml).toContain('<html lang="zh-CN" class="dark">');
    expect(indexHtml).toContain('<meta name="color-scheme" content="dark" />');
    expect(indexHtml).not.toContain("localStorage.getItem('theme')");
    expect(indexHtml).not.toContain('prefers-color-scheme: light');
  });

  it('小部件布局：七张卡片按固定顺序挂载，入场由 CSS 类驱动（无内联动画）', () => {
    renderHome();

    const grid = document.querySelector('.home-widgets');
    expect(grid).not.toBeNull();

    const widgets = Array.from(document.querySelectorAll('.home-widget'));
    expect(widgets).toHaveLength(7);
    expect(widgets.map((element) => element.getAttribute('data-home-reveal'))).toEqual([
      'card-1',
      'card-2',
      'card-3',
      'card-4',
      'card-5',
      'card-6',
      'card-7',
    ]);
    // 入场完全由 CSS 类驱动：SSR/首帧不写内联动画样式，避免水合差异。
    document.querySelectorAll('[data-home-reveal]').forEach((element) => {
      expect(element.getAttribute('style')).toBeNull();
    });

    // 卡片标题是 h2（h1 只有名片卡的名字），层级仍是 h1 → h2。
    const h1s = screen.getAllByRole('heading', { level: 1 });
    expect(h1s).toHaveLength(1);
    expect(screen.getAllByRole('heading', { level: 2 }).length).toBeGreaterThanOrEqual(6);
  });

  it('访问统计卡：Vercount 三项计数锚点齐备，首帧是「加载中」占位', () => {
    renderHome();

    ['site_pv', 'site_uv', 'page_pv'].forEach((key) => {
      const span = document.getElementById(`vercount_value_${key}`);
      expect(span).not.toBeNull();
      expect(span).toHaveTextContent('加载中');
    });

    // 挂载时从模块缓存补一次回填：span 晚于 Layout 的上报完成才挂载时不至于停在加载态。
    expect(mockedFillVercountSpans).toHaveBeenCalled();

    // 「今日」维度 Vercount 公开接口不提供：首页不得出现会误导访客的今日数字。
    expect(screen.queryByText(/今日/)).not.toBeInTheDocument();
  });

  it('推荐阅读：最近更新的三篇，链接指向文章页', () => {
    renderHome();

    const featured = getInitialPosts()
      .slice()
      .sort((a, b) => Date.parse(b.updatedAt || b.date) - Date.parse(a.updatedAt || a.date))
      .slice(0, 3);
    expect(featured).toHaveLength(3);

    featured.forEach((post) => {
      expect(screen.getByRole('link', { name: new RegExp(post.title.slice(0, 6)) })).toHaveAttribute(
        'href',
        `/post/${post.id}`,
      );
    });

    expect(screen.getByRole('link', { name: /看看文章/ })).toHaveAttribute('href', '/posts');
  });

  it('写作档案：累计篇数、锚点年份与 12 根月份柱', () => {
    renderHome();

    const stats = getHomeStats();
    const chart = document.querySelector('[role="img"][aria-label*="每月文章数"]');
    expect(chart).not.toBeNull();
    expect(chart?.querySelectorAll('[data-month]')).toHaveLength(12);
    // 柱高按篇数换算，全部是构建期算出的确定值（不依赖时钟）。
    expect(stats.months).toHaveLength(12);
    expect(stats.anchorYear).not.toBeNull();

    // 累计篇数 / 锚点年份篇数可能同值，断言只看写作档案卡内部。
    const writingWidget = document.getElementById('home-writing');
    expect(writingWidget).not.toBeNull();
    expect(within(writingWidget as HTMLElement).getAllByText(String(stats.postCount)).length).toBeGreaterThan(0);
    expect(within(writingWidget as HTMLElement).getByText(`${stats.anchorYear} 年`)).toBeInTheDocument();
  });

  it('标签云：热门标签指向文章列表的标签筛选', () => {
    renderHome();

    const stats = getHomeStats();
    expect(stats.tags.length).toBeGreaterThan(0);
    const topTag = stats.tags[0];
    expect(screen.getByRole('link', { name: new RegExp(topTag.name) })).toHaveAttribute(
      'href',
      `/posts?tag=${encodeURIComponent(topTag.name)}`,
    );
  });

  it('服务状态卡：首帧中性、始终可点击跳转状态页', () => {
    renderHome();

    const statusLink = screen.getByRole('link', { name: /服务状态/ });
    expect(statusLink).toHaveAttribute('target', '_blank');
    expect(statusLink).toHaveAttribute('rel', 'noopener noreferrer');
    expect(statusLink).toHaveAttribute('data-status', 'unavailable');
    expect(statusLink).toHaveTextContent('服务状态');
  });

  it('联系方式卡：GitHub / 邮箱前缀 / RSS / 更新订阅 / 项目仓库', () => {
    renderHome();

    // 用完整可访问名称定位：标签云里也有「GitHub Actions」这类含 GitHub 的标签链接。
    const githubLink = screen.getByRole('link', { name: /^GitHub（外部站点/ });
    expect(githubLink).toHaveAttribute('href', siteConfig.social.github);
    expect(githubLink).toHaveAttribute('target', '_blank');
    expect(githubLink).toHaveAttribute('rel', 'noopener noreferrer');

    const mailLink = screen.getByRole('link', { name: `发送邮件到 ${siteConfig.social.rawEmail}` });
    expect(mailLink).toHaveAttribute('href', siteConfig.social.email);
    expect(mailLink).not.toHaveAttribute('target');
    // 只显示 @ 前的名字，完整地址进可访问名称；不再用省略号截断。
    expect(mailLink).toHaveTextContent(siteConfig.social.rawEmail.split('@')[0]);
    expect(mailLink).not.toHaveTextContent(siteConfig.social.rawEmail);
    expect(mailLink.className).not.toContain('truncate');
    expect(mailLink.querySelector('.truncate')).toBeNull();

    expect(screen.getByRole('link', { name: /RSS 订阅/ })).toHaveAttribute('href', assetUrl('/feed.xml'));
    expect(screen.getByRole('link', { name: /更新订阅/ })).toHaveAttribute('href', ISSUE_SUBSCRIPTION_URL);
    expect(screen.getByRole('link', { name: /项目仓库/ })).toHaveAttribute('href', siteConfig.friendsPage.repoUrl);

    const nav = screen.getByRole('navigation', { name: '联系方式' });
    // QQ 入口只在 QQ 号与二维码链接同时配置时出现；联系方式卡里不再有复制按钮。
    const qqConfigured = Boolean(siteConfig.social.qq && siteConfig.social.qqQrCode);
    if (qqConfigured) {
      expect(screen.getByRole('button', { name: /QQ 二维码/ })).toBeInTheDocument();
    } else {
      expect(screen.queryByRole('button', { name: /QQ/ })).not.toBeInTheDocument();
    }
    expect(nav.querySelectorAll('a, button')).toHaveLength(qqConfigured ? 6 : 5);
  });

  it('首页搜索表单提交后进入全站搜索页', async () => {
    const user = userEvent.setup();
    renderHome();

    const input = screen.getByRole('searchbox', { name: '搜索全站' });
    await user.type(input, 'Cloudflare{Enter}');

    expect(screen.getByTestId('location')).toHaveTextContent('/search?q=Cloudflare');
  });

  it('不再渲染门户内容：无站点入口、开源项目、关于本站与订阅卡', () => {
    renderHome();

    ['站点入口', '开源项目', '关于本站', '订阅新文章提醒', '站内搜索'].forEach((text) => {
      expect(screen.queryByText(text)).not.toBeInTheDocument();
    });
  });

  it('首页小部件布局是 CSS 网格：桌面多列、手机单列，且不再锁滚动', () => {
    const css = readFileSync(resolve(process.cwd(), 'src/index.css'), 'utf8');

    expect(css).toContain('.home-widgets');
    expect(css).toContain('grid-template-columns: repeat(12, minmax(0, 1fr))');
    expect(css).toContain('grid-template-columns: repeat(6, minmax(0, 1fr))');
    // 移动端改成上下滑动看卡片：旧的「首页禁止滚动」锁必须彻底移除。
    expect(css).not.toContain('html:has(.home-page)');
    expect(css).not.toContain('body:has(.home-page)');
    // 最后一张卡不被 Cookie 提示条遮住。
    expect(css).toContain('var(--cookie-notice-height');
  });

  it('SSR 首帧确定：连续两次服务端渲染输出完全一致', () => {
    const renderMarkup = () =>
      renderToString(
        <HelmetProvider>
          <MemoryRouter initialEntries={['/']}>
            <Home />
          </MemoryRouter>
        </HelmetProvider>,
      );

    const first = renderMarkup();
    const second = renderMarkup();

    expect(first).toBe(second);
    expect(first).toContain(siteConfig.author.name);
    expect(first).toContain(siteConfig.author.bio);
  });

  it('保留首页 SEO 标题与 WebSite / Organization / ProfilePage 结构化数据', () => {
    renderHome();

    expect(document.title).toBe(siteConfig.seoHomeTitle || siteConfig.title);

    const script = Array.from(document.querySelectorAll('script[type="application/ld+json"]')).find((element) =>
      element.textContent?.includes('ProfilePage'),
    );
    expect(script).toBeTruthy();

    const parsed = JSON.parse(script?.textContent ?? '[]') as Array<Record<string, unknown>>;
    const schemas = Array.isArray(parsed) ? parsed : [parsed];
    const types = schemas.map((schema) => schema['@type']);
    expect(types).toEqual(expect.arrayContaining(['WebSite', 'Organization', 'ProfilePage']));

    const profilePage = schemas.find((schema) => schema['@type'] === 'ProfilePage');
    expect(profilePage?.mainEntity).toMatchObject({
      '@type': 'Person',
      name: siteConfig.author.name,
      description: siteConfig.author.bio,
    });
  });
});
