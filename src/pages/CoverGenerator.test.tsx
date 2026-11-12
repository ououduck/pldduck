import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
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

  it('页头为 serif 中文标题，不再有英文大写眉题', () => {
    renderCover();
    const heading = screen.getByRole('heading', { level: 1, name: '封面生成器' });
    expect(heading).toHaveClass('font-serif');
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
});
