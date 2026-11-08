import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderToString } from 'react-dom/server';
import { HelmetProvider } from 'react-helmet-async';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { Home } from './Home';
import { siteConfig } from '@config/site.config';
import { ISSUE_SUBSCRIPTION_URL } from '@/components/IssueSubscriptionCard';
import { getInitialPosts } from '@/services/posts';
import { copyTextToClipboard } from '@/utils/clipboard';
import { assetUrl } from '@/utils/siteUrl';

vi.mock('@/utils/clipboard', () => ({ copyTextToClipboard: vi.fn() }));

const mockedCopyTextToClipboard = vi.mocked(copyTextToClipboard);

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

/** 门户配置里的全部可见文案：首页任何一个出现在 DOM 里都说明门户内容死灰复燃。 */
const collectPortalCopy = (): string[] => {
  const portal = siteConfig.portal ?? {};
  return [
    portal.tagline,
    portal.status,
    ...(portal.tags ?? []),
    portal.memory?.label,
    portal.memory?.prompt,
    portal.memory?.detail,
    portal.identity,
    ...(portal.stack ?? []),
    ...(portal.entries ?? []).flatMap((entry) => [entry.title, entry.description, entry.note]),
    ...(portal.links ?? []).map((link) => link.title),
    ...(portal.projects ?? []).flatMap((project) => [project.title, project.description, project.tag]),
  ].filter((value): value is string => Boolean(value));
};

describe('Home', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedCopyTextToClipboard.mockResolvedValue(true);
  });

  afterEach(() => {
    // 清空 Helmet 写入的 head 标签，避免跨用例污染。
    document.head.querySelectorAll('[data-rh="true"]').forEach((element) => element.remove());
  });

  it('首帧渲染站主身份：头像、名字（h1）与作者介绍原文', () => {
    renderHome();

    expect(screen.getByRole('heading', { level: 1, name: siteConfig.author.name })).toBeInTheDocument();
    expect(screen.getByRole('img', { name: siteConfig.author.name })).toHaveAttribute(
      'src',
      assetUrl(siteConfig.author.avatar),
    );
    expect(screen.getByText(siteConfig.author.bio)).toBeInTheDocument();
  });

  it('深色唯一：模板首帧即 dark，没有浅色主题与 localStorage 启动脚本', () => {
    const indexHtml = readFileSync(resolve(process.cwd(), 'index.html'), 'utf8');

    expect(indexHtml).toContain('<html lang="zh-CN" class="dark">');
    expect(indexHtml).toContain('<meta name="color-scheme" content="dark" />');
    expect(indexHtml).not.toContain("localStorage.getItem('theme')");
    expect(indexHtml).not.toContain('prefers-color-scheme: light');
  });

  it('首页使用大色块 hero 面板与克制的 CSS 入场结构（无内联动画、SSR 可确定）', () => {
    renderHome();

    const hero = document.querySelector('.home-hero');
    expect(hero).not.toBeNull();
    expect(hero?.querySelector('.home-hero-glow')).not.toBeNull();

    const reveals = Array.from(document.querySelectorAll('[data-home-reveal]'));
    expect(reveals.map((element) => element.getAttribute('data-home-reveal'))).toEqual([
      'avatar',
      'title',
      'bio',
      'search',
      'contact',
    ]);
    // 入场完全由 CSS 类驱动：SSR/首帧不写内联动画样式，避免水合差异。
    reveals.forEach((element) => expect(element.getAttribute('style')).toBeNull());
  });

  it('不再有主题切换入口（深色唯一）', () => {
    renderHome();
    expect(screen.queryByRole('button', { name: /切换外观主题|切换深浅色/ })).not.toBeInTheDocument();
  });

  it('桌面保留 Hero 卡片，移动端用全屏/紧凑网格的 class 钩子', () => {
    renderHome();

    const page = document.querySelector('.home-page');
    const hero = page?.querySelector('.home-hero');
    expect(page).not.toBeNull();
    expect(hero).not.toBeNull();
    // 桌面卡片外观仍由这些类提供；<768px 的媒体查询再把背景/圆角覆盖为透明无卡片。
    expect(hero?.className).toContain('rounded-overlay');
    expect(hero?.className).toContain('bg-surface');

    const contactGrid = document.querySelector('.home-contact-grid');
    expect(contactGrid).not.toBeNull();
    expect(contactGrid?.querySelectorAll('a, button').length).toBeGreaterThanOrEqual(6);
  });

  it('移动端无滚动规则由 CSS :has 限定在首页（离开路由自动恢复）', () => {
    const css = readFileSync(resolve(process.cwd(), 'src/index.css'), 'utf8');

    expect(css).toContain('html:has(.home-page)');
    expect(css).toContain('body:has(.home-page)');
    expect(css).toContain('@media (max-width: 767.98px)');
    expect(css).toContain('.home-page .home-hero');
    expect(css).toContain('.home-page .home-contact-grid');
    // 首次访问的 Cookie 提示条不遮挡联系方式：移动端高度预算里预留其高度。
    expect(css).toContain('var(--cookie-notice-height');
  });

  it('首页下方有“看看文章”跳转：移动端同款按钮 + 桌面卡片与最新两篇文章', () => {
    renderHome();

    const articleLinks = screen.getAllByRole('link', { name: /看看文章/ });
    expect(articleLinks.length).toBeGreaterThanOrEqual(2);
    articleLinks.forEach((link) => expect(link).toHaveAttribute('href', '/posts'));

    const latest = getInitialPosts()
      .slice()
      .sort((a, b) => Date.parse(b.updatedAt || b.date) - Date.parse(a.updatedAt || a.date))
      .slice(0, 2);
    latest.forEach((post) => {
      expect(screen.getByRole('link', { name: post.title })).toHaveAttribute('href', `/post/${post.id}`);
    });

    expect(document.querySelector('.home-articles-cta')).not.toBeNull();
  });

  it('首页承载联系方式与订阅入口：GitHub / 邮箱 / RSS / 更新订阅 / 项目仓库', () => {
    renderHome();

    const githubLink = screen.getByRole('link', { name: /GitHub/ });
    expect(githubLink).toHaveAttribute('href', siteConfig.social.github);
    expect(githubLink).toHaveAttribute('target', '_blank');
    expect(githubLink).toHaveAttribute('rel', 'noopener noreferrer');

    const mailLink = screen.getByRole('link', { name: siteConfig.social.rawEmail });
    expect(mailLink).toHaveAttribute('href', siteConfig.social.email);
    expect(mailLink).not.toHaveAttribute('target');

    expect(screen.getByRole('link', { name: /RSS 订阅/ })).toHaveAttribute('href', assetUrl('/feed.xml'));
    expect(screen.getByRole('link', { name: /更新订阅/ })).toHaveAttribute('href', ISSUE_SUBSCRIPTION_URL);
    expect(screen.getByRole('link', { name: /项目仓库/ })).toHaveAttribute('href', siteConfig.friendsPage.repoUrl);
  });

  it('首页搜索表单提交后进入全站搜索页', async () => {
    const user = userEvent.setup();
    renderHome();

    const input = screen.getByRole('searchbox', { name: '搜索全站' });
    await user.type(input, 'Cloudflare{Enter}');

    expect(screen.getByTestId('location')).toHaveTextContent('/search?q=Cloudflare');
  });

  it('复制 QQ 号成功后给出状态播报', async () => {
    const user = userEvent.setup();
    renderHome();

    const status = screen.getByRole('status');
    expect(status).toHaveAttribute('aria-live', 'polite');

    await user.click(screen.getByRole('button', { name: `复制 QQ 号 ${siteConfig.social.qq}` }));

    expect(mockedCopyTextToClipboard).toHaveBeenCalledWith(siteConfig.social.qq);
    await waitFor(() => expect(status).toHaveTextContent('QQ 号已复制到剪贴板'));
  });

  it('复制失败时如实反馈，不伪装成功', async () => {
    const user = userEvent.setup();
    mockedCopyTextToClipboard.mockResolvedValueOnce(false);
    renderHome();

    await user.click(screen.getByRole('button', { name: `复制 QQ 号 ${siteConfig.social.qq}` }));

    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('复制失败，请手动复制 QQ 号'));
    expect(screen.getByRole('status')).not.toHaveTextContent('已复制');
  });

  it('剪贴板抛错时同样按失败反馈，不产生未处理异常', async () => {
    const user = userEvent.setup();
    mockedCopyTextToClipboard.mockRejectedValueOnce(new Error('clipboard denied'));
    renderHome();

    await user.click(screen.getByRole('button', { name: `复制 QQ 号 ${siteConfig.social.qq}` }));

    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('复制失败，请手动复制 QQ 号'));
  });

  it('不再渲染任何门户内容：无站点入口、开源项目、关于本站与订阅卡', () => {
    renderHome();

    // 唯一允许的 h2 是首页下方的「看看文章」入口，不恢复门户区块标题。
    const h2s = screen.queryAllByRole('heading', { level: 2 });
    expect(h2s).toHaveLength(1);
    expect(h2s[0]).toHaveTextContent('看看文章');
    expect(screen.queryAllByRole('article')).toHaveLength(0);

    ['站点入口', '开源项目', '关于本站', '订阅新文章提醒', '站内搜索'].forEach((text) => {
      expect(screen.queryByText(text)).not.toBeInTheDocument();
    });

    collectPortalCopy().forEach((text) => {
      expect(screen.queryByText(text)).not.toBeInTheDocument();
    });
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
