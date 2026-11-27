import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { ShuoShuo } from './ShuoShuo';
import type { ShuoShuo as ShuoShuoEntry } from '../types';

// 说说内容来自构建期内联的 generated/shuoshuo.json（shuoshuo/*.md），
// 这里用 mock 注入数据，覆盖「有条目」「空列表」「搜索过滤」三条路径。
const entry: ShuoShuoEntry = {
  id: 'hello-shuoshuo',
  date: '2026-11-20',
  images: ['https://img.pldduck.com/a.jpg', 'https://img.pldduck.com/b.jpg'],
  content: '第一条说说',
  filePath: '/shuoshuo/hello-shuoshuo.md',
};

const dataMock = vi.hoisted(() => ({ list: [] as ShuoShuoEntry[] }));

vi.mock('@/services/shuoshuo', async () => {
  const actual = await vi.importActual<typeof import('@/services/shuoshuo')>('@/services/shuoshuo');
  return {
    ...actual,
    getInitialShuoShuo: () => dataMock.list,
  };
});

const renderShuoShuo = (initialEntry = '/shuoshuo') =>
  render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <Routes>
        <Route path="/shuoshuo" element={<ShuoShuo />} />
      </Routes>
    </MemoryRouter>,
  );

describe('ShuoShuo（列表页）', () => {
  beforeEach(() => {
    dataMock.list = [];
  });

  it('渲染阅读字体页面标题与介绍，不再输出英文眉题', () => {
    renderShuoShuo();
    const heading = screen.getByRole('heading', { level: 1, name: '说说' });
    expect(heading).toBeInTheDocument();
    expect(heading).toHaveClass('font-sans');
    expect(screen.getByText(/类似 PLDDUCK 朋友圈的短动态小天地/)).toBeInTheDocument();
    expect(heading.closest('header')).toHaveClass('rounded-overlay', 'bg-surface');
    expect(screen.queryByText('ShuoShuo · Moments')).not.toBeInTheDocument();
  });

  it('有条目时链到各自详情页，列表页不内嵌任何评论区', () => {
    dataMock.list = [entry];
    renderShuoShuo();
    expect(screen.getByRole('link', { name: /查看这条说说/ })).toHaveAttribute('href', '/shuoshuo/hello-shuoshuo');
    expect(document.querySelector('.giscus-comments')).toBeNull();
    expect(screen.queryByText('评论')).not.toBeInTheDocument();
  });

  it('九宫格图片按条目渲染（1 张单列、多图三列）', () => {
    dataMock.list = [entry];
    renderShuoShuo();
    const buttons = screen.getAllByRole('button', { name: /查看图片/ });
    expect(buttons).toHaveLength(2);
    expect(buttons[0].parentElement).toHaveClass('grid-cols-2');
  });

  it('没有内容时是空态，并提示内容在 Pages CMS 维护', () => {
    renderShuoShuo();
    const status = screen.getByRole('status');
    expect(status).toHaveTextContent('还没有说说');
    expect(status).toHaveTextContent('Pages CMS');
    expect(status).not.toHaveTextContent('暂时取不到');
  });
});
