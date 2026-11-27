import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { ShuoShuoDetail } from './ShuoShuoDetail';
import type { ShuoShuo as ShuoShuoEntry } from '../types';

// 构建期数据在测试环境不存在（generated/shuoshuo.json 不提交），
// 直接 mock 数据层，覆盖「有条目」与「没条目」两条路径。
const entry: ShuoShuoEntry = {
  id: 'hello-shuoshuo',
  date: '2026-11-20',
  images: ['https://img.pldduck.com/a.jpg'],
  content: '正文 **加粗**',
  filePath: '/shuoshuo/hello-shuoshuo.md',
};

const dataMock = vi.hoisted(() => ({ entry: undefined as ShuoShuoEntry | undefined }));

vi.mock('@/services/shuoshuo', async () => {
  const actual = await vi.importActual<typeof import('@/services/shuoshuo')>('@/services/shuoshuo');
  return {
    ...actual,
    getInitialShuoShuoItem: () => dataMock.entry,
  };
});

const renderDetail = (path = '/shuoshuo/hello-shuoshuo') =>
  render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/shuoshuo/:id" element={<ShuoShuoDetail />} />
        <Route path="/shuoshuo" element={<div data-testid="list-page" />} />
      </Routes>
    </MemoryRouter>,
  );

describe('ShuoShuoDetail', () => {
  beforeEach(() => {
    dataMock.entry = entry;
  });

  it('渲染标题、正文与九宫格图片', () => {
    renderDetail();
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('正文 加粗');
    expect(screen.getByRole('button', { name: /查看图片 1/ })).toBeInTheDocument();
  });

  it('详情页不渲染任何评论区（评论区已于 2026-11 下线）', () => {
    renderDetail();
    expect(document.querySelector('.giscus-comments')).toBeNull();
    expect(screen.queryByRole('heading', { name: '评论' })).not.toBeInTheDocument();
  });

  it('输出面包屑与返回列表入口', () => {
    renderDetail();
    expect(screen.getByRole('navigation', { name: '面包屑' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /返回说说列表/ })).toHaveAttribute('href', '/shuoshuo');
  });

  it('条目不存在时显示未找到，并 noindex', () => {
    dataMock.entry = undefined;
    renderDetail('/shuoshuo/missing');
    expect(screen.getByText('未找到这条说说')).toBeInTheDocument();
    expect(document.querySelector('meta[name="robots"]')).toHaveAttribute(
      'content',
      expect.stringContaining('noindex'),
    );
  });
});
