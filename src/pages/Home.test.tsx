import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderToString } from 'react-dom/server';
import { HelmetProvider } from 'react-helmet-async';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { Home } from './Home';
import { siteConfig } from '@config/site.config';
import { ISSUE_SUBSCRIPTION_URL } from '@/components/IssueSubscriptionCard';
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

    expect(screen.queryByRole('heading', { level: 2 })).not.toBeInTheDocument();
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
