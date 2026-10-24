import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { Friends } from './Friends';
import { siteConfig } from '@config/site.config';

// 模块加载时 Friends.tsx 会调用 getInitialFriends() 捕获 initialFriends，
// 且水合后 effect 会调用 getFriends() 替换列表——两个 mock 必须返回同一份数据。
// vi.mock 被提升到文件顶部，外部常量处于 TDZ，须用 vi.hoisted 共享。
const { friendsFixture } = vi.hoisted(() => ({
  friendsFixture: [
    { name: '示例博客', description: '前端技术分享', avatar: '/a.png', url: 'https://example.com' },
    { name: 'DEV Blog', description: 'Web development', avatar: '/b.png', url: 'https://dev.example.org' },
    {
      name: '失联站点',
      description: '曾经的友链',
      avatar: '/c.png',
      url: 'https://gone.example.net',
      unavailable: true,
    },
  ],
}));

vi.mock('@/services/friends', () => ({
  getInitialFriends: vi.fn(() => friendsFixture),
  getFriends: vi.fn(async () => friendsFixture),
}));
vi.mock('@/services/busuanzi', () => ({
  pingBusuanzi: vi.fn(),
  fillBusuanziSpans: vi.fn(),
}));

const renderFriends = (initialEntry = '/friends') =>
  render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <Routes>
        <Route path="/friends" element={<Friends />} />
      </Routes>
    </MemoryRouter>,
  );

describe('Friends', () => {
  beforeEach(() => {
    vi.clearAllMocks();
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

  it('渲染友链列表', async () => {
    renderFriends();
    expect(await screen.findByText('示例博客')).toBeInTheDocument();
    expect(screen.getByText('DEV Blog')).toBeInTheDocument();
  });

  it('失联友链归入「已失联的博客」折叠板块，展开后可见', async () => {
    const user = userEvent.setup();
    renderFriends();
    await screen.findByText('示例博客');
    expect(screen.queryByText('失联站点')).not.toBeInTheDocument(); // 默认折叠
    // 展开失联板块。
    await user.click(screen.getByRole('button', { name: /已失联的博客/ }));
    expect(await screen.findByText('失联站点')).toBeInTheDocument();
  });

  it('搜索按名称/描述/域名过滤（大小写不敏感，locale 无关回归）', async () => {
    const user = userEvent.setup();
    renderFriends();
    await screen.findByText('示例博客');
    const input = screen.getByLabelText('搜索友链');

    // 大写 I 匹配 "DEV Blog"（土耳其语 locale 下 toLocaleLowerCase 会把 I 变 ı 导致失配）。
    await user.type(input, 'DEV');
    expect(screen.getByText('DEV Blog')).toBeInTheDocument();
    expect(screen.queryByText('示例博客')).not.toBeInTheDocument();

    // 域名搜索。
    await user.clear(input);
    await user.type(input, 'EXAMPLE');
    expect(screen.getByText('示例博客')).toBeInTheDocument();
  });

  it('清除搜索恢复全部', async () => {
    const user = userEvent.setup();
    renderFriends();
    await screen.findByText('示例博客');
    const input = screen.getByLabelText('搜索友链');

    await user.type(input, 'DEV');
    expect(screen.queryByText('示例博客')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: '清除友链搜索' }));
    expect(screen.getByText('示例博客')).toBeInTheDocument();
  });

  it('随机前往：从可访问友链中随机打开一个，绝不跳失联站点', async () => {
    const user = userEvent.setup();
    const openSpy = vi.spyOn(window, 'open').mockImplementation(() => null);
    renderFriends();
    await screen.findByText('示例博客');

    // 多次点击覆盖随机分布：每次都必须落在可访问友链里，绝不会选中失联站点。
    const reachableUrls = new Set(['https://example.com', 'https://dev.example.org']);
    for (let attempt = 0; attempt < 20; attempt += 1) {
      openSpy.mockClear();
      await user.click(screen.getByRole('button', { name: '随机前往' }));
      expect(openSpy).toHaveBeenCalledTimes(1);
      const [url, target, features] = openSpy.mock.calls[0];
      expect(reachableUrls.has(String(url))).toBe(true);
      expect(url).not.toBe('https://gone.example.net');
      expect(target).toBe('_blank');
      expect(features).toBe('noopener,noreferrer');
    }

    openSpy.mockRestore();
  });

  it('申请友链面板：本站信息、预填表单入口与修改邮箱卡片', async () => {
    const user = userEvent.setup();
    renderFriends();
    await screen.findByText('示例博客');
    // 展开「申请友链」面板后依次是本站信息卡、资料填写卡、修改联系卡。
    await user.click(screen.getByRole('button', { name: /申请友链/ }));
    expect(screen.getByText('本站友链信息')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /我已添加/ })).not.toBeInTheDocument();
    expect(screen.getByRole('heading', { name: '填好资料，一键带到 Issue' })).toBeInTheDocument();

    const blankFormLink = screen.getByRole('link', { name: /改用空白 Issue 表单/ });
    expect(blankFormLink).toHaveAttribute('href', siteConfig.friendsPage.applyUrl);
    // 采集面必须是 GitHub：改回 Tally 等外部表单时这里先变红。
    expect(blankFormLink.getAttribute('href')).toMatch(/^https:\/\/github\.com\//);
    expect(siteConfig.friendsPage.applyUrl).toContain('template=friend-link-application.yml');
    expect(blankFormLink).toHaveAttribute('target', '_blank');
    expect(blankFormLink).toHaveAttribute('rel', expect.stringContaining('noopener'));

    const directoryLink = screen.getByRole('link', { name: '查看友链目录' });
    expect(directoryLink).toHaveAttribute('href', siteConfig.friendsPage.repoFriendsUrl);

    // 已收录条目的修改不开新的申请流程，卡片里直接给邮箱。
    const contact = screen.getByText(/如果有修改友链信息的需求/);
    expect(within(contact).getByRole('link')).toHaveAttribute('href', 'mailto:pldduck@outlook.com');
  });

  it('填好资料后生成 Issue 申请：新标签打开正文已预填的 GitHub 链接', async () => {
    const user = userEvent.setup();
    const openSpy = vi.spyOn(window, 'open').mockImplementation(() => null);
    renderFriends();
    await screen.findByText('示例博客');
    await user.click(screen.getByRole('button', { name: /申请友链/ }));

    const submit = screen.getByRole('button', { name: /生成 Issue 申请/ });
    await user.click(submit);
    expect(screen.getByRole('alert')).toHaveTextContent('请先填写：站点名称、站点地址、头像地址、站点简介');
    expect(openSpy).not.toHaveBeenCalled();

    await user.type(screen.getByLabelText('站点名称'), '阿叶的小站');
    await user.type(screen.getByLabelText('站点地址'), 'https://ayee.example.com');
    await user.type(screen.getByLabelText('头像地址'), 'https://ayee.example.com/a.png');
    await user.type(screen.getByLabelText('站点简介'), '前端与生活方式记录');
    await user.selectOptions(screen.getByLabelText('申请类型'), '下架');
    await user.click(submit);
    expect(screen.getByRole('alert')).toHaveTextContent('两项确认都要勾选');
    expect(openSpy).not.toHaveBeenCalled();

    for (const checkbox of screen.getAllByRole('checkbox')) {
      await user.click(checkbox);
    }
    await user.type(screen.getByLabelText(/反链页面地址/), 'https://ayee.example.com/links');
    await user.click(submit);

    expect(openSpy).toHaveBeenCalledTimes(1);
    const opened = new URL(String(openSpy.mock.calls[0][0]));
    expect(`${opened.origin}${opened.pathname}`).toBe('https://github.com/ououduck/pldduck/issues/new');
    // 不能带 template=：走表单时 GitHub 会忽略 body，正文就填不进去。
    expect(opened.searchParams.has('template')).toBe(false);
    expect(opened.searchParams.get('labels')).toBe('friend-link');
    expect(opened.searchParams.get('title')).toBe('[友链] 阿叶的小站');
    const body = opened.searchParams.get('body') ?? '';
    expect(body).toContain('### 站点名称\n\n阿叶的小站');
    expect(body).toContain('### 申请类型\n\n下架');
    expect(body).toContain('https://ayee.example.com/links');
    expect(body).toContain('- [X] 我已在自己的站点上添加了指向本站的链接');

    openSpy.mockRestore();
  });
});
