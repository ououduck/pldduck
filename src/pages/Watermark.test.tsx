import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { Watermark } from './Watermark';

// 水印工具全部在本地处理：初始渲染不触发 FileReader/canvas/网络。
// 此前的页面组件没有外壳测试，随本次工具页外壳统一补上页头与骨架冒烟断言。
vi.mock('@/services/vercount', () => ({
  pingVercount: vi.fn(),
  fillVercountSpans: vi.fn(),
  VERCUNT_PENDING_TEXT: '加载中',
}));

const renderWatermark = () =>
  render(
    <MemoryRouter initialEntries={['/watermark']}>
      <Watermark />
    </MemoryRouter>,
  );

describe('Watermark — 外壳与初始骨架', () => {
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

  it('编辑式页头：阅读字体「图片水印」标题，无英文大写眉题', () => {
    renderWatermark();

    const heading = screen.getByRole('heading', { level: 1, name: '图片水印' });
    expect(heading).toHaveClass('font-sans');
    expect(screen.queryByText('Image Watermark')).not.toBeInTheDocument();
    expect(screen.getByText(/所有处理都在本地完成，不会上传你的图片/)).toBeInTheDocument();
    // 预览面板不再有装饰性 Preview 眉题。
    expect(screen.queryByText('Preview')).not.toBeInTheDocument();
  });

  it('保留图片上传、设置、导出与预览骨架（未选图时的初始态）', () => {
    renderWatermark();

    expect(screen.getByRole('heading', { name: '水印设置' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: '实时预览' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '选择图片' })).toBeInTheDocument();
    // 未选择图片：预览为上传占位，导出按钮禁用（原业务边界不变）。
    expect(screen.getByRole('button', { name: /选择图片开始预览/ })).toBeInTheDocument();
    expect(screen.queryByRole('img', { name: '添加水印后的图片预览' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: '下载图片' })).toBeDisabled();
    expect(screen.getByRole('button', { name: '重置' })).toBeInTheDocument();
  });
});
