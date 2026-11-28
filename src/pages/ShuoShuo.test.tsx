import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { ShuoShuo } from './ShuoShuo';
import type { ShuoShuo as ShuoShuoEntry } from '../types';

// 说说内容来自构建期内联的 generated/shuoshuo.json（shuoshuo/*.md），
// 这里用 mock 注入数据，覆盖「有内容」「空列表」「分页」「搜索」几条路径。
const makeEntry = (id: string, images: string[] = []): ShuoShuoEntry => ({
  id,
  date: '2026-11-20',
  images,
  content: `第 ${id} 条说说`,
  filePath: `/shuoshuo/${id}.md`,
});

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
        <Route path="/shuoshuo/page/:page" element={<ShuoShuo />} />
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
    expect(heading).toHaveClass('font-sans');
    expect(screen.getByText(/类似 PLDDUCK 朋友圈的短动态小天地/)).toBeInTheDocument();
    expect(heading.closest('header')).toHaveClass('rounded-overlay', 'bg-surface');
    expect(screen.queryByText('ShuoShuo · Moments')).not.toBeInTheDocument();
  });

  it('说说不再有逐条独立页：没有永久链接、没有分享按钮、没有评论区', () => {
    dataMock.list = [makeEntry('a')];
    renderShuoShuo();
    expect(screen.queryByRole('link', { name: /查看这条说说/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /分享/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /永久链接/ })).not.toBeInTheDocument();
    expect(document.querySelector('.giscus-comments')).toBeNull();
    expect(screen.queryByText('评论')).not.toBeInTheDocument();
  });

  it('九宫格图片：1 张单列、2 张两列、4 张两列、其余三列', () => {
    dataMock.list = [makeEntry('one', ['https://img.pldduck.com/1.jpg'])];
    const { unmount } = renderShuoShuo();
    expect(screen.getAllByRole('button', { name: /查看图片/ })).toHaveLength(1);
    expect(screen.getAllByRole('button', { name: /查看图片/ })[0].parentElement).toHaveStyle({
      gridTemplateColumns: 'repeat(1, minmax(0, 1fr))',
    });
    unmount();

    dataMock.list = [makeEntry('two', ['https://img.pldduck.com/1.jpg', 'https://img.pldduck.com/2.jpg'])];
    const two = renderShuoShuo();
    expect(screen.getAllByRole('button', { name: /查看图片/ })[0].parentElement).toHaveStyle({
      gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
    });
    two.unmount();

    dataMock.list = [
      makeEntry(
        'four',
        ['a', 'b', 'c', 'd'].map((n) => `https://img.pldduck.com/${n}.jpg`),
      ),
    ];
    const four = renderShuoShuo();
    expect(screen.getAllByRole('button', { name: /查看图片/ })[0].parentElement).toHaveStyle({
      gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
    });
    four.unmount();

    dataMock.list = [
      makeEntry(
        'five',
        ['a', 'b', 'c', 'd', 'e'].map((n) => `https://img.pldduck.com/${n}.jpg`),
      ),
    ];
    renderShuoShuo();
    expect(screen.getAllByRole('button', { name: /查看图片/ })[0].parentElement).toHaveStyle({
      gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
    });
  });

  it('每页 10 条：11 条内容分成 2 页，第 2 页只出 1 条', () => {
    dataMock.list = Array.from({ length: 11 }, (_, index) => makeEntry(`entry-${index}`));

    const first = renderShuoShuo('/shuoshuo');
    expect(screen.getAllByRole('article')).toHaveLength(10);
    expect(screen.getByRole('navigation', { name: '分页导航' })).toBeInTheDocument();
    first.unmount();

    renderShuoShuo('/shuoshuo/page/2');
    expect(screen.getAllByRole('article')).toHaveLength(1);
  });

  it('没有内容时是空态，并提示内容在 Pages CMS 维护', () => {
    renderShuoShuo();
    const status = screen.getByRole('status');
    expect(status).toHaveTextContent('还没有说说');
    expect(status).toHaveTextContent('Pages CMS');
  });
});
