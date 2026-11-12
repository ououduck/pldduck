import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { CoverGenerator } from './CoverGenerator';

// 封面生成器重度依赖 canvas 2D：jsdom 无 canvas 实现，渲染 effect 会走
// 失败兜底（generateCover 有 try/catch），冒烟测试验证页面骨架与错误兜底不崩溃。
vi.mock('@/services/vercount', () => ({
  pingVercount: vi.fn(),
  fillVercountSpans: vi.fn(),
  VERCUNT_PENDING_TEXT: '加载中',
}));

const renderCover = () =>
  render(
    <MemoryRouter initialEntries={['/cover']}>
      <CoverGenerator />
    </MemoryRouter>,
  );

describe('CoverGenerator', () => {
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
    // canvas 2D context：jsdom 返回 null，页面应通过 try/catch 兜底不崩溃。
    Object.defineProperty(HTMLCanvasElement.prototype, 'getContext', {
      writable: true,
      value: vi.fn(() => null),
    });
  });

  afterEach(() => {
    document.body.style.overflow = '';
  });

  it('渲染页面标题与设置标签页', () => {
    renderCover();
    expect(screen.getByRole('heading', { name: '封面生成器' })).toBeInTheDocument();
    // 标签页（内容/样式/布局/导出）。
    expect(screen.getByRole('tab', { name: '内容' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: '样式' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: '排版' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: '导出' })).toBeInTheDocument();
  });

  it('页头为阅读字体中文标题，不再有英文大写眉题', () => {
    renderCover();
    const heading = screen.getByRole('heading', { level: 1, name: '封面生成器' });
    expect(heading).toHaveClass('font-sans');
    expect(screen.queryByText('COVER STUDIO')).not.toBeInTheDocument();
  });

  it('标签页支持方向键切换（键盘交互保持）', async () => {
    const userEvent = (await import('@testing-library/user-event')).default;
    const user = userEvent.setup();
    renderCover();
    const contentTab = screen.getByRole('tab', { name: '内容' });
    expect(contentTab).toHaveAttribute('aria-selected', 'true');

    contentTab.focus();
    await user.keyboard('{ArrowRight}');

    const styleTab = await screen.findByRole('tab', { name: '样式' });
    expect(styleTab).toHaveAttribute('aria-selected', 'true');
    expect(contentTab).toHaveAttribute('aria-selected', 'false');
  });

  it('切换标签页显示对应设置面板', async () => {
    const userEvent = (await import('@testing-library/user-event')).default;
    const user = userEvent.setup();
    renderCover();
    await user.click(screen.getByRole('tab', { name: '导出' }));
    // 导出面板包含导出设置标题与格式切换按钮。
    expect(screen.getByText('导出设置')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'png' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'jpeg' })).toBeInTheDocument();
  });

  it('纯白模板缩略图标题使用近黑字，不在纯白卡上写近白字', async () => {
    renderCover();

    // 模板卡底色就是模板本身的 gradient（纯白卡 #ffffff）：标题必须用近黑的
    // background Token，旧写法 text-ink（#fafafa）会让「纯白」两个字完全看不见。
    const whiteCard = await screen.findByRole('button', { name: /纯白/ });
    const whiteTitle = within(whiteCard).getByText('纯白');
    expect(whiteTitle).toHaveClass('text-background');
    expect(whiteTitle).not.toHaveClass('text-ink');

    // 纯黑卡仍是白字，不受影响。
    const blackCard = screen.getByRole('button', { name: /纯黑/ });
    expect(within(blackCard).getByText('纯黑')).toHaveClass('text-white');
  });

  it('导出面板的反色按钮使用 accent/background 语义类，深色下不会白底白字', async () => {
    const userEvent = (await import('@testing-library/user-event')).default;
    const user = userEvent.setup();
    renderCover();
    await user.click(screen.getByRole('tab', { name: '导出' }));

    // 激活的宽高比 / 格式 / 导出背景：白底 + 近黑字（bg-accent + text-background）。
    // 深色 Token 下 ink 与 white 都是近白，旧写法 dark:bg-white dark:text-ink
    // 会渲染成截图中「按钮过白不可见」的样子。
    const activeRatio = screen.getByRole('button', { name: '16:9' });
    expect(activeRatio).toHaveAttribute('aria-pressed', 'true');
    expect(activeRatio).toHaveClass('bg-accent', 'text-background');
    expect(activeRatio.className).not.toMatch(/dark:bg-white|dark:text-ink|text-white/);

    expect(screen.getByRole('button', { name: 'png' })).toHaveClass('bg-accent', 'text-background');
    expect(screen.getByRole('button', { name: '跟随模板底色' })).toHaveClass('bg-accent', 'text-background');

    // 主操作按钮（下载封面）与预设保存按钮同样是反色语义类。
    expect(screen.getByRole('button', { name: '下载封面' })).toHaveClass('bg-accent', 'text-background');
    expect(screen.getByRole('button', { name: '保存' })).toHaveClass('bg-accent', 'text-background');

    // 未激活的宽高比按钮保持中性灰，不跟着反色。
    expect(screen.getByRole('button', { name: '4:3' })).not.toHaveClass('bg-accent');
  });

  it('格式/导出背景激活态与保存成功提示条同样使用反色语义类', async () => {
    const userEvent = (await import('@testing-library/user-event')).default;
    const user = userEvent.setup();
    renderCover();
    await user.click(screen.getByRole('tab', { name: '导出' }));

    const jpeg = screen.getByRole('button', { name: 'jpeg' });
    await user.click(jpeg);
    expect(jpeg).toHaveClass('bg-accent', 'text-background');

    await user.click(screen.getByRole('button', { name: 'png' }));
    const transparent = screen.getByRole('button', { name: '透明背景（PNG）' });
    await user.click(transparent);
    expect(transparent).toHaveClass('bg-accent', 'text-background');

    // 保存预设走成功提示条：该提示条是反色块，白底必须配近黑字。
    await user.click(screen.getByRole('button', { name: '保存' }));
    const successBanner = await screen.findByText(/已保存预设/);
    expect(successBanner.closest('div')).toHaveClass('bg-accent', 'text-background');
  });
});
