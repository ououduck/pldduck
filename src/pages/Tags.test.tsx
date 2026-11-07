import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes, useSearchParams } from 'react-router-dom';
import { searchPosts } from '@/services/posts';
import { Tags } from './Tags';

// URL 探针：MemoryRouter 不更新 window.location，断言搜索参数必须经
// useSearchParams 读取（否则「清除搜索后参数移除」的断言恒真、无回归保护）。
let probeSearch = '';
const SearchParamsProbe = () => {
  const [searchParams] = useSearchParams();
  probeSearch = searchParams.toString();
  return null;
};

// 固定非空数据集（testing.md 规则 3/17）：空数据会让标签云、分级、筛选与空态全部零覆盖。
// vi.mock 工厂在模块提升阶段执行，fixture 必须经 vi.hoisted 提前定义（避免 TDZ）。
const mockedPosts = vi.hoisted(() => [
  {
    id: 'react-19',
    title: 'React 19 水合笔记',
    excerpt: '水合首帧与 SSG 输出一致性的排查记录。',
    date: '2026-10-02',
    tags: ['React', '前端', '构建'],
    category: '技术',
    filePath: 'posts/react-19.md',
    readTime: '6 分钟',
  },
  {
    id: 'vite-ssg',
    title: 'Vite SSG 实践',
    excerpt: '用 Vite 构建静态站点的预渲染流程。',
    date: '2026-09-12',
    tags: ['React', '前端'],
    category: '技术',
    filePath: 'posts/vite-ssg.md',
    readTime: '8 分钟',
  },
  {
    id: 'css-token',
    title: '设计 Token 落地',
    excerpt: '把色值/圆角/动效收敛到语义变量。',
    date: '2026-08-20',
    tags: ['React', 'CSS'],
    category: '教程',
    filePath: 'posts/css-token.md',
    readTime: '5 分钟',
  },
  {
    id: 'design-notes',
    title: '版式随手记',
    excerpt: '编辑式排版的一些取舍。',
    date: '2026-07-01',
    tags: ['Vite'],
    category: '随笔',
    filePath: 'posts/design-notes.md',
    readTime: '4 分钟',
  },
]);

vi.mock('@/services/posts', () => ({
  getInitialPosts: vi.fn(() => mockedPosts),
  getPosts: vi.fn(async () => mockedPosts),
  searchPosts: vi.fn(async () => mockedPosts),
}));
vi.mock('@/services/busuanzi', () => ({
  pingBusuanzi: vi.fn(),
  fillBusuanziSpans: vi.fn(),
}));

const renderTags = (initialEntry = '/tags') =>
  render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <Routes>
        <Route
          path="/tags"
          element={
            <>
              <Tags />
              <SearchParamsProbe />
            </>
          }
        />
      </Routes>
    </MemoryRouter>,
  );

/** 标签云的全部标签按钮（按渲染顺序 = 文章数降序）。 */
const getTagButtons = () => screen.getAllByRole('button', { name: /^查看标签 / });

const getTagCount = (button: HTMLElement) => Number(button.getAttribute('aria-label')?.match(/共 (\d+) 篇文章/)?.[1]);

beforeEach(() => {
  vi.clearAllMocks();
  // 每个用例恢复默认搜索结果（避免上一个用例的 mockResolvedValue 泄漏）。
  vi.mocked(searchPosts).mockResolvedValue(mockedPosts);
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

describe('Tags', () => {
  it('URL 带 ?q= 时同步到搜索框', async () => {
    renderTags('/tags?q=react');
    const input = await screen.findByRole('searchbox', { name: '搜索标签或文章' });
    await waitFor(() => expect(input).toHaveValue('react'));
  });

  it('输入搜索词后输入框保持用户输入不被 URL 同步回退（v7_startTransition 竞态回归）', async () => {
    const user = userEvent.setup();
    renderTags();
    const input = screen.getByRole('searchbox', { name: '搜索标签或文章' });

    await user.type(input, 'vite');
    await waitFor(() => expect(input).toHaveValue('vite'));
    expect(input).toHaveValue('vite');
  });

  it('清除搜索后 URL 的 q 参数被移除', async () => {
    const user = userEvent.setup();
    renderTags('/tags?q=react');
    const input = await screen.findByRole('searchbox', { name: '搜索标签或文章' });
    await waitFor(() => expect(input).toHaveValue('react'));

    await user.click(screen.getByRole('button', { name: '清除搜索' }));
    await waitFor(() => expect(input).toHaveValue(''));
    await waitFor(() => {
      expect(probeSearch).not.toContain('q=');
    });
  });
});

describe('Tags — 编辑式页头与克制标签云', () => {
  it('页头去掉大写英文眉题，只保留轻量标题与统计说明', () => {
    renderTags();

    expect(screen.queryByText('Tags Collection')).not.toBeInTheDocument();
    const heading = screen.getByRole('heading', { level: 1 });
    expect(heading).toHaveTextContent('标签集合');
    expect(heading).toHaveClass('font-serif');
    // 统计：5 个标签、按标签累计 8 篇文章（同一文章可计入多个标签）。
    expect(screen.getByText('共 5 个标签 · 8 篇文章')).toHaveClass('text-content-muted');
  });

  it('标签云按文章数降序，保留计数与含文章数的 aria-label', () => {
    renderTags();

    const buttons = getTagButtons();
    expect(buttons).toHaveLength(5);
    expect(buttons[0]).toHaveAccessibleName('查看标签 React，共 3 篇文章');
    expect(buttons[1]).toHaveAccessibleName('查看标签 前端，共 2 篇文章');

    // 降序：解析出的文章数必须单调不增（真实排序断言，不依赖中英文混排顺序）。
    const counts = buttons.map(getTagCount);
    expect(counts).toEqual([...counts].sort((a, b) => b - a));
    expect(within(buttons[0]).getByText('3')).toBeInTheDocument();
  });

  it('标签分级用字号/字重/颜色分层，不再用重胶囊或粗下划线', () => {
    renderTags();

    const reactButton = screen.getByRole('button', { name: '查看标签 React，共 3 篇文章' });
    const viteButton = screen.getByRole('button', { name: '查看标签 Vite，共 1 篇文章' });

    const topTier = within(reactButton).getByText('React');
    expect(topTier).toHaveClass('text-lg', 'font-semibold', 'text-content');

    const bottomTier = within(viteButton).getByText('Vite');
    expect(bottomTier).toHaveClass('text-sm', 'font-normal', 'text-content-muted');

    // 三个标签档位名次不同但都保留 44px 点击区；hover 反馈交给下划线 + 文字变深。
    for (const button of getTagButtons()) {
      expect(button).toHaveClass('min-h-11');
    }
    expect(topTier).toHaveClass('group-hover:underline');
    expect(topTier).not.toHaveClass('border-b');
  });

  it('标签云容器靠留白分隔，不再用 border-y 重卡片', () => {
    renderTags();

    const cloud = getTagButtons()[0].parentElement as HTMLElement;
    expect(cloud).toHaveClass('flex-wrap');
    expect(cloud).not.toHaveClass('border-y');
    expect(cloud).not.toHaveClass('border-line');
  });
});

describe('Tags — 标签筛选与 URL 联动', () => {
  it('点击标签写入 ?tag= 并展示轻量编辑式文章条目', async () => {
    const user = userEvent.setup();
    renderTags();

    await user.click(screen.getByRole('button', { name: '查看标签 React，共 3 篇文章' }));
    await waitFor(() => expect(probeSearch).toContain('tag=React'));

    const heading = screen.getByRole('heading', { level: 2 });
    expect(heading).toHaveTextContent('React');
    expect(heading).toHaveTextContent('共 3 篇');

    // 条目按日期倒序：最近一篇在前。
    const entryLinks = screen.getAllByRole('link').filter((link) => link.getAttribute('href')?.startsWith('/post/'));
    expect(entryLinks).toHaveLength(3);
    expect(entryLinks[0]).toHaveAttribute('href', '/post/react-19');

    const firstEntry = screen.getByRole('link', { name: /React 19 水合笔记/ });
    expect(within(firstEntry).getByRole('heading', { level: 3 })).toHaveTextContent('React 19 水合笔记');
    expect(within(firstEntry).getByText('水合首帧与 SSG 输出一致性的排查记录。')).toBeInTheDocument();
    expect(within(firstEntry).getByText('2026-10-02')).toBeInTheDocument();
    expect(within(firstEntry).getByText('6 分钟')).toBeInTheDocument();
    // 分类胶囊已移除：条目中不再出现分类文字。
    expect(within(firstEntry).queryByText('技术')).not.toBeInTheDocument();
  });

  it('?tag= 直访筛选对应标签', () => {
    renderTags('/tags?tag=前端');

    const heading = screen.getByRole('heading', { level: 2 });
    expect(heading).toHaveTextContent('前端');
    expect(heading).toHaveTextContent('共 2 篇');
    expect(screen.getByRole('link', { name: /Vite SSG 实践/ })).toHaveAttribute('href', '/post/vite-ssg');
  });

  it('返回全部标签是显式 type="button" 的文字 ghost 操作，点击后移除 tag 参数', async () => {
    const user = userEvent.setup();
    renderTags('/tags?tag=前端');

    const backButton = screen.getByRole('button', { name: '返回全部标签' });
    expect(backButton).toHaveAttribute('type', 'button');
    expect(backButton).toHaveClass('min-h-11');

    await user.click(backButton);
    await waitFor(() => expect(probeSearch).not.toContain('tag='));
    expect(getTagButtons()).toHaveLength(5);
  });

  it('非法 tag 回退提示且不隐藏页面标题', () => {
    renderTags('/tags?tag=不存在的标签');

    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('标签集合');
    expect(screen.getByText('当前标签不存在或已失效，请返回查看全部标签。')).toBeInTheDocument();
  });
});

describe('Tags — 搜索与空态', () => {
  it('搜索结果同步刷新标签云并显示搜索计数', async () => {
    const user = userEvent.setup();
    vi.mocked(searchPosts).mockResolvedValue([mockedPosts[0]]);
    renderTags();

    const input = screen.getByRole('searchbox', { name: '搜索标签或文章' });
    await user.type(input, 'react');

    await waitFor(() => expect(screen.getByText(/找到 3 个标签/)).toBeInTheDocument());
    expect(getTagButtons()).toHaveLength(3);
  });

  it('搜索无匹配时显示轻量空态，清除搜索后恢复标签云', async () => {
    const user = userEvent.setup();
    vi.mocked(searchPosts).mockResolvedValue([]);
    renderTags();

    const input = screen.getByRole('searchbox', { name: '搜索标签或文章' });
    await user.type(input, 'zzz');

    const emptyTitle = await screen.findByText('未找到匹配标签');
    // 空态卡片 role="status"；加载态同样是 status，故先等空态标题出现再取容器。
    const emptyStatus = emptyTitle.closest('[role="status"]') as HTMLElement;
    expect(emptyStatus).not.toBeNull();

    await user.click(within(emptyStatus).getByRole('button', { name: '清除搜索' }));
    await waitFor(() => expect(getTagButtons()).toHaveLength(5));
  });

  it('选中标签且搜索结果为空时提示清除搜索', async () => {
    const user = userEvent.setup();
    vi.mocked(searchPosts).mockResolvedValue([]);
    renderTags('/tags?tag=React');

    const input = screen.getByRole('searchbox', { name: '搜索标签或文章' });
    await user.type(input, 'zzz');

    await waitFor(() =>
      expect(
        screen.getByText('当前标签存在，但在当前搜索条件下没有匹配文章。你可以清除搜索后查看完整列表。'),
      ).toBeInTheDocument(),
    );
    expect(screen.getByRole('heading', { level: 2 })).toHaveTextContent('共 0 篇');
  });
});
