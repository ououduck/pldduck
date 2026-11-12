import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes, useSearchParams } from 'react-router-dom';
import { Posts } from './Posts';
import { getInitialPosts } from '@/services/posts';
import { getReadingHistory, removeReadingHistory } from '@/services/readingHistory';

// URL 探针：MemoryRouter 不更新 window.location，断言搜索参数必须经
// useSearchParams 读取（否则「清除搜索后参数移除」的断言恒真、无回归保护）。
let probeSearch = '';
const SearchParamsProbe = () => {
  const [searchParams] = useSearchParams();
  probeSearch = searchParams.toString();
  return null;
};

// 弹层与工具组件用 stub 替代，聚焦 Posts 自身行为。
vi.mock('@/components/ShareModal', () => ({
  ShareModal: () => <div data-testid="mock-share-modal" />,
}));
vi.mock('@/services/vercount', () => ({
  pingVercount: vi.fn(),
  fillVercountSpans: vi.fn(),
  VERCUNT_PENDING_TEXT: '加载中',
}));
vi.mock('@/services/readingHistory', () => ({
  getReadingHistory: vi.fn(() => []),
  saveReadingHistory: vi.fn(),
  subscribeReadingHistory: vi.fn(() => () => {}),
  removeReadingHistory: vi.fn(),
}));

const renderPosts = (initialEntry = '/posts') =>
  render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <Routes>
        <Route
          path="*"
          element={
            <>
              <Posts />
              <SearchParamsProbe />
            </>
          }
        />
      </Routes>
    </MemoryRouter>,
  );

describe('Posts', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getReadingHistory).mockReturnValue([]);
    // jsdom 不实现 matchMedia：useReducedMotion/useMediaQuery 等依赖媒体查询。
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

  it('渲染 sr-only h1 供屏幕阅读器定位页面主题', () => {
    renderPosts();
    const heading = screen.getByRole('heading', { level: 1 });
    expect(heading).toHaveTextContent('文章');
    expect(heading).toHaveClass('sr-only');
  });

  it('渲染文章卡片列表（来自构建期数据）', () => {
    renderPosts();
    // 文章页应有至少一个文章链接（卡片标题链接）
    const postLinks = screen.getAllByRole('link', { name: /阅读文章：/ });
    expect(postLinks.length).toBeGreaterThan(0);
  });

  it('分类功能已下线：不渲染「文章分类筛选」分组，也不再有分类按钮', () => {
    renderPosts();
    expect(screen.queryByRole('group', { name: '文章分类筛选' })).not.toBeInTheDocument();
    // 分类胶囊按钮（如「分享」「教程」）不再出现：只剩标签侧栏里的标签按钮。
    expect(screen.queryByRole('button', { name: /^(分享|教程)$/ })).not.toBeInTheDocument();
    // 分类栏渐隐（filter-scroll-mask）随分类栏一并移除。
    expect(document.querySelector('[class*="filter-scroll-mask"]')).toBeNull();
  });

  it('旧链接 ?category= 直访时参数被 canonicalizeHomeQuery 清掉并展示完整列表', async () => {
    const defaultRender = renderPosts();
    const defaultArticleCount = defaultRender.container.querySelectorAll('article').length;
    defaultRender.unmount();
    probeSearch = '';

    const { container } = renderPosts('/posts?category=分享');
    await waitFor(() => expect(probeSearch).not.toContain('category'));
    // 丢弃分类参数后回到默认（全部文章）视图，与无参列表渲染的卡片数一致。
    await waitFor(() => expect(container.querySelectorAll('article')).toHaveLength(defaultArticleCount));
  });

  it('右侧标签卡片列出全部标签（不显示计数），点击写入 ?tag= 并过滤列表', async () => {
    const user = userEvent.setup();
    const [firstPost] = getInitialPosts();
    const firstTag = firstPost.tags[0];
    const expectedCount = getInitialPosts().filter((post) => post.tags.includes(firstTag)).length;

    const { container } = renderPosts();
    const panel = screen.getByRole('complementary', { name: '全部标签' });
    const tagButton = within(panel).getByRole('button', {
      name: `筛选标签 ${firstTag}，共 ${expectedCount} 篇文章`,
    });
    // 计数只留在可访问名称里，视觉上只显示标签文字。
    expect(tagButton.textContent).toBe(firstTag);

    await user.click(tagButton);
    await waitFor(() => expect(probeSearch).toContain(`tag=${encodeURIComponent(firstTag)}`));
    expect(container.querySelectorAll('article')).toHaveLength(expectedCount);
    const activeButton = within(panel).getByRole('button', {
      name: `筛选标签 ${firstTag}，共 ${expectedCount} 篇文章`,
    });
    expect(activeButton).toHaveAttribute('aria-pressed', 'true');
    // 选中后反色成白底小按钮。
    expect(activeButton).toHaveClass('bg-content', 'text-background');
  });

  it('标签按文章数降序铺成一行三个的小按钮网格', () => {
    renderPosts();
    const panel = screen.getByRole('complementary', { name: '全部标签' });

    // 期望顺序：按文章数降序、同数按中文名排序（与小字按钮的展示顺序一致）。
    const counts = new Map<string, number>();
    getInitialPosts().forEach((post) => {
      (Array.isArray(post.tags) ? post.tags : [])
        .map((tag) => tag.trim())
        .filter(Boolean)
        .forEach((tag) => counts.set(tag, (counts.get(tag) ?? 0) + 1));
    });
    const expectedOrder = [...counts.entries()]
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'zh-CN'))
      .map(([name]) => name);

    const list = panel.querySelector('ul');
    expect(list).toHaveClass('grid', 'grid-cols-3');

    const chips = within(panel)
      .getAllByRole('button')
      .filter((element) => element.getAttribute('aria-label')?.startsWith('筛选标签 '));
    expect(chips.map((element) => element.textContent)).toEqual(expectedOrder);
    // 小字号小按钮：不再是一行一个的整宽列表项。
    expect(chips[0]).toHaveClass('min-h-8', 'text-[11px]');
    expect(chips[0]).not.toHaveClass('justify-between');
  });

  it('?tag= 直访按标签过滤，清除标签后恢复完整列表', async () => {
    const user = userEvent.setup();
    const [firstPost] = getInitialPosts();
    const firstTag = firstPost.tags[0];
    const expectedCount = getInitialPosts().filter((post) => post.tags.includes(firstTag)).length;

    const { container } = renderPosts(`/posts?tag=${encodeURIComponent(firstTag)}`);
    await waitFor(() => expect(container.querySelectorAll('article')).toHaveLength(expectedCount));
    expect(screen.getByText(firstTag, { selector: 'span.font-medium' })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: '清除标签' }));
    await waitFor(() => expect(probeSearch).not.toContain('tag='));
    await waitFor(() => expect(container.querySelectorAll('article').length).toBeGreaterThan(expectedCount));
  });

  it('移动端标签按钮打开侧面板，选标签后关闭并写入 URL；Escape 可关闭', async () => {
    const user = userEvent.setup();
    const [firstPost] = getInitialPosts();
    const firstTag = firstPost.tags[0];
    const expectedCount = getInitialPosts().filter((post) => post.tags.includes(firstTag)).length;

    renderPosts();
    await user.click(screen.getByRole('button', { name: '打开标签筛选' }));
    const dialog = await screen.findByRole('dialog', { name: '标签' });
    expect(dialog).toBeInTheDocument();

    await user.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('dialog', { name: '标签' })).not.toBeInTheDocument());

    await user.click(screen.getByRole('button', { name: '打开标签筛选' }));
    const reopenedDialog = await screen.findByRole('dialog', { name: '标签' });
    await user.click(
      within(reopenedDialog).getByRole('button', {
        name: `筛选标签 ${firstTag}，共 ${expectedCount} 篇文章`,
      }),
    );

    await waitFor(() => expect(probeSearch).toContain(`tag=${encodeURIComponent(firstTag)}`));
    await waitFor(() => expect(screen.queryByRole('dialog', { name: '标签' })).not.toBeInTheDocument());
  });

  it('排序按钮在最新/最早间切换，并同步 URL 的 sort 参数', async () => {
    const user = userEvent.setup();
    renderPosts();

    const newestButton = screen.getByRole('button', { name: '按最新优先排序' });
    expect(newestButton).toHaveAttribute('aria-pressed', 'false');
    expect(newestButton).toHaveTextContent('最新');

    await user.click(newestButton);

    await waitFor(() => expect(probeSearch).toContain('sort=oldest'));
    const oldestButton = screen.getByRole('button', { name: '按最早优先排序' });
    expect(oldestButton).toHaveAttribute('aria-pressed', 'true');
    expect(oldestButton).toHaveTextContent('最早');
  });

  it('搜索框与排序按钮同处一行（分类 tab 删除后不再让搜索框独占一行）', async () => {
    renderPosts();
    const searchBox = await screen.findByRole('searchbox', { name: '搜索文章' });
    const sortButton = screen.getByRole('button', { name: '按最新优先排序' });

    // 最近的一层 flex 容器必须同时包住「搜索框」和「排序按钮」。
    const row = sortButton.closest('.flex');
    expect(row).not.toBeNull();
    expect(row).toContainElement(searchBox);
    // 排序按钮是行内最后一个子节点（靠右），搜索框占满剩余宽度。
    expect((row as HTMLElement).lastElementChild).toBe(sortButton);
    expect(searchBox.closest('.flex-1')).not.toBeNull();
  });

  it('继续阅读以卡片式呈现，保留继续/放弃操作与进度', async () => {
    const user = userEvent.setup();
    const [firstPost] = getInitialPosts();
    vi.mocked(getReadingHistory).mockReturnValue([{ postId: firstPost.id, progress: 0.42, updatedAt: 1 }]);

    renderPosts();

    const card = await screen.findByRole('region', { name: '继续阅读' });
    expect(card).toHaveClass('rounded-overlay', 'bg-surface-muted');
    expect(card).toHaveTextContent('已阅读 42%');
    // 列表首卡也使用 h2，与卡片标题同名；这里必须限定在「继续阅读」区域内。
    expect(within(card).getByRole('heading', { level: 2, name: firstPost.title })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: `继续阅读：${firstPost.title}` })).toHaveAttribute(
      'href',
      `/post/${firstPost.id}`,
    );

    await user.click(screen.getByRole('button', { name: `放弃阅读：${firstPost.title}` }));
    expect(removeReadingHistory).toHaveBeenCalledWith(firstPost.id);
  });

  it('打开分享弹层：点击卡片分享按钮', async () => {
    const user = userEvent.setup();
    renderPosts();
    const shareButtons = screen.getAllByRole('button', { name: /分享文章：/ });
    expect(shareButtons.length).toBeGreaterThan(0);
    await user.click(shareButtons[0]);
    expect(await screen.findByTestId('mock-share-modal')).toBeInTheDocument();
  });

  it('URL 带 ?q= 时同步到搜索框', async () => {
    renderPosts('/posts?q=react');
    const input = await screen.findByRole('searchbox', { name: '搜索文章' });
    await waitFor(() => expect(input).toHaveValue('react'));
  });

  it('输入搜索词后输入框保持用户输入不被 URL 同步回退（v7_startTransition 竞态回归）', async () => {
    const user = userEvent.setup();
    renderPosts();
    const input = screen.getByRole('searchbox', { name: '搜索文章' });

    await user.type(input, 'react');
    // 击键后 URL 异步提交期间，URL→state 回写不得把输入内容回退。
    await waitFor(() => expect(input).toHaveValue('react'));
    expect(input).toHaveValue('react');
  });

  it('清除搜索后 URL 的 q 参数被移除', async () => {
    const user = userEvent.setup();
    renderPosts('/posts?q=react');
    const input = await screen.findByRole('searchbox', { name: '搜索文章' });
    await waitFor(() => expect(input).toHaveValue('react'));

    await user.click(screen.getByRole('button', { name: '清除搜索' }));
    await waitFor(() => expect(input).toHaveValue(''));
    // URL 中不再有 q 参数。
    await waitFor(() => {
      expect(probeSearch).not.toContain('q=');
    });
  });
});
