import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { ShuoShuo } from './ShuoShuo';
import { siteConfig } from '@config/site.config';
import type { DiscussionEntry } from '../types';

// 2026-11：说说页改成「列表 + 详情」，列表本身不再内嵌 giscus（评论区在详情页）。
// 构建期数据用 mock 注入，覆盖「有条目」与「抓不到数据」两条路径。
const entry: DiscussionEntry = {
  number: 137,
  title: '第一条说说',
  body: '正文',
  excerpt: '第一条说说',
  images: [],
  createdAt: '2026-11-20T10:00:00Z',
  updatedAt: '2026-11-20T10:00:00Z',
  author: { login: 'ououduck', avatarUrl: '', url: 'https://github.com/ououduck' },
  commentCount: 3,
  reactionCount: 1,
  url: 'https://github.com/ououduck/pldduck/discussions/137',
};

const dataMock = vi.hoisted(() => ({
  list: [] as DiscussionEntry[],
  available: true,
}));

vi.mock('@/services/discussions', () => ({
  getInitialDiscussionList: () => dataMock.list,
  hasDiscussionList: () => dataMock.available,
}));

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
    dataMock.available = true;
  });

  it('渲染阅读字体页面标题与介绍，不再输出英文眉题', () => {
    renderShuoShuo();
    const heading = screen.getByRole('heading', { level: 1, name: '说说' });
    expect(heading).toBeInTheDocument();
    expect(heading).toHaveClass('font-sans');
    expect(screen.getByText('这里是一块类似 PLDDUCK 朋友圈的短动态小天地。')).toBeInTheDocument();
    expect(heading.closest('header')).toHaveClass('rounded-overlay', 'bg-surface');
    expect(screen.queryByText('ShuoShuo · Moments')).not.toBeInTheDocument();
  });

  it('页头说明「每条说说一个独立讨论」的通知口径', () => {
    renderShuoShuo();
    expect(screen.getByText(/每条说说是一个独立讨论/)).toBeInTheDocument();
  });

  it('有条目时逐条链到各自详情页（评论区在详情页，列表不订阅任何讨论）', () => {
    dataMock.list = [entry];
    renderShuoShuo();
    const links = screen.getAllByRole('link', { name: '第一条说说' });
    expect(links[0]).toHaveAttribute('href', '/shuoshuo/137');
    expect(document.querySelector('.giscus-comments')).toBeNull();
  });

  it('抓到数据但没有内容时是空态（不是错误态）', () => {
    dataMock.list = [];
    dataMock.available = true;
    renderShuoShuo();
    const status = screen.getByRole('status');
    expect(status).toHaveTextContent('还没有说说');
    expect(status).not.toHaveTextContent('暂时取不到');
  });

  it('构建期没抓到列表时如实说「取不到」，不伪装成空列表', () => {
    dataMock.list = [];
    dataMock.available = false;
    renderShuoShuo();
    const status = screen.getByRole('alert');
    expect(status).toHaveTextContent('说说列表暂时取不到');
  });

  it('提供「在 GitHub 发布说说」入口（新建 Discussion 是唯一的发布方式）', () => {
    expect(siteConfig.giscusEnabled).toBe(true);
    renderShuoShuo();
    const link = screen.getByRole('link', { name: /在 GitHub 发布说说/ });
    expect(link).toHaveAttribute('href', expect.stringContaining('/discussions/new?category='));
    expect(link).toHaveAttribute('target', '_blank');
    expect(link).toHaveAttribute('rel', 'noopener noreferrer');
  });
});
