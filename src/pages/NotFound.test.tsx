import { describe, it, expect } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderToString } from 'react-dom/server';
import { HelmetProvider } from 'react-helmet-async';
import { MemoryRouter, Route, Routes, useSearchParams } from 'react-router-dom';
import { NotFound } from './NotFound';

// 搜索页探针：MemoryRouter 下断言 window.location 是恒真（testing.md 规则），
// 改用 useSearchParams 渲染真实路由查询参数。
const SearchProbe: React.FC = () => {
  const [params] = useSearchParams();
  return <div data-testid="search-probe">q={params.get('q') ?? ''}</div>;
};

const renderAtPath = (path: string) =>
  render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/search" element={<SearchProbe />} />
        <Route path="*" element={<NotFound />} />
      </Routes>
    </MemoryRouter>,
  );

describe('NotFound — 调试路径水合一致性', () => {
  it('SSR 首帧输出占位符，不渲染真实路径（与 SSG 预渲染输出一致）', () => {
    // SSG 用占位路由 /__missing__ 预渲染 404 页；若首帧直接输出
    // location.pathname，客户端在真实未知路径水合时会与 SSR 文本不一致。
    const html = renderToString(
      <MemoryRouter initialEntries={['/__missing__']}>
        <Routes>
          <Route path="*" element={<NotFound />} />
        </Routes>
      </MemoryRouter>,
    );
    expect(html).toContain('Path: —');
    expect(html).not.toContain('Path: /__missing__');
  });

  it('挂载后展示真实路径调试信息', async () => {
    renderAtPath('/some/unknown/path');
    await waitFor(() => {
      expect(screen.getByText('Path: /some/unknown/path')).toBeInTheDocument();
    });
  });
});

describe('NotFound — 404 页功能模块', () => {
  it('卡片式：页头、搜索、入口、最近文章各为一块 surface 卡片', () => {
    renderAtPath('/missing');
    const heading = screen.getByRole('heading', { name: '这篇文章跑路了' });
    expect(heading).toBeInTheDocument();
    expect(heading.closest('header')).toHaveClass('rounded-overlay', 'bg-surface');

    expect(screen.getByRole('searchbox', { name: '搜索本站内容' })).toBeInTheDocument();
    expect(screen.getByRole('region', { name: '站内搜索' })).toHaveClass('rounded-overlay', 'bg-surface');
    expect(screen.getByRole('navigation', { name: '页面入口' })).toHaveClass('rounded-overlay', 'bg-surface');

    expect(screen.getByRole('link', { name: /归档/ })).toHaveAttribute('href', '/archive');
    expect(screen.getByRole('link', { name: /^文章/ })).toHaveAttribute('href', '/posts');
    expect(screen.getByRole('link', { name: /^搜索/ })).toHaveAttribute('href', '/search');
    expect(screen.getByRole('link', { name: /返回首页/ })).toHaveAttribute('href', '/');
  });

  it('搜索框输入关键词回车跳转 /search?q=', async () => {
    const user = userEvent.setup();
    renderAtPath('/missing');
    await user.type(screen.getByRole('searchbox', { name: '搜索本站内容' }), '静态博客{Enter}');
    const probe = await screen.findByTestId('search-probe');
    expect(probe).toHaveTextContent('q=静态博客');
  });

  it('空关键词回车进入 /search（不带 q）', async () => {
    const user = userEvent.setup();
    renderAtPath('/missing');
    await user.type(screen.getByRole('searchbox', { name: '搜索本站内容' }), '{Enter}');
    const probe = await screen.findByTestId('search-probe');
    expect(probe).toHaveTextContent('q=');
  });

  it('渲染最近 3 篇文章入口，卡片区内逐条链接到文章', () => {
    renderAtPath('/missing');
    const heading = screen.getByRole('heading', { level: 2, name: '最近的文章' });
    expect(heading).toBeInTheDocument();
    const section = heading.closest('section');
    expect(section).not.toBeNull();
    expect(section).toHaveClass('rounded-overlay', 'bg-surface');
    const recentLinks = within(section as HTMLElement).getAllByRole('link');
    expect(recentLinks).toHaveLength(3);
    recentLinks.forEach((link) => {
      expect(link.getAttribute('href')).toMatch(/^\/post\//);
    });
  });

  it('保持 noindex，避免 404 页被收录', () => {
    render(
      <HelmetProvider>
        <MemoryRouter initialEntries={['/missing']}>
          <Routes>
            <Route path="*" element={<NotFound />} />
          </Routes>
        </MemoryRouter>
      </HelmetProvider>,
    );
    const robots = document.head.querySelector('meta[name="robots"]');
    expect(robots?.getAttribute('content')).toContain('noindex');
  });
});
