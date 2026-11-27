import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { Guestbook } from './Guestbook';
import { siteConfig } from '@config/site.config';
import type { DiscussionEntry } from '../types';

// 2026-11：留言板改成「列表 + 详情」，列表不再内嵌 giscus（评论区在详情页）。
const entry: DiscussionEntry = {
  number: 288,
  title: '第一次来，混个脸熟',
  body: '你好呀',
  excerpt: '你好呀',
  images: [],
  createdAt: '2026-11-16T05:42:38Z',
  updatedAt: '2026-11-16T05:42:38Z',
  author: { login: 'AUkarl', avatarUrl: '', url: 'https://github.com/AUkarl' },
  commentCount: 1,
  reactionCount: 0,
  url: 'https://github.com/ououduck/pldduck/discussions/288',
};

const dataMock = vi.hoisted(() => ({
  list: [] as DiscussionEntry[],
  available: true,
}));

vi.mock('@/services/discussions', () => ({
  getInitialDiscussionList: () => dataMock.list,
  hasDiscussionList: () => dataMock.available,
}));

const renderGuestbook = () =>
  render(
    <MemoryRouter initialEntries={['/guestbook']}>
      <Routes>
        <Route path="/guestbook" element={<Guestbook />} />
      </Routes>
    </MemoryRouter>,
  );

describe('Guestbook（列表页）', () => {
  beforeEach(() => {
    dataMock.list = [];
    dataMock.available = true;
  });

  it('渲染阅读字体页面标题，不再输出英文眉题', () => {
    renderGuestbook();
    const heading = screen.getByRole('heading', { level: 1, name: '留言板' });
    expect(heading).toBeInTheDocument();
    expect(heading).toHaveClass('font-sans');
    expect(heading.closest('header')).toHaveClass('rounded-overlay', 'bg-surface');
    expect(screen.queryByText('Guestbook')).not.toBeInTheDocument();
  });

  it('页头说明「每份留言一个独立讨论」的通知口径', () => {
    renderGuestbook();
    expect(screen.getByText(/每份留言是一个独立讨论/)).toBeInTheDocument();
  });

  it('有条目时逐条链到各自详情页，列表不内嵌 giscus', () => {
    dataMock.list = [entry];
    renderGuestbook();
    expect(screen.getAllByRole('link', { name: '第一次来，混个脸熟' })[0]).toHaveAttribute('href', '/guestbook/288');
    expect(document.querySelector('.giscus-comments')).toBeNull();
  });

  it('抓到数据但没有留言时是空态', () => {
    renderGuestbook();
    expect(screen.getByRole('status')).toHaveTextContent('还没有留言');
  });

  it('构建期没抓到列表时如实说「取不到」', () => {
    dataMock.available = false;
    renderGuestbook();
    expect(screen.getByRole('alert')).toHaveTextContent('留言列表暂时取不到');
  });

  it('提供「写一条留言」入口（新建 Discussion 是唯一留言方式）', () => {
    expect(siteConfig.giscusEnabled).toBe(true);
    renderGuestbook();
    const link = screen.getByRole('link', { name: /写一条留言/ });
    expect(link).toHaveAttribute('href', expect.stringContaining('/discussions/new?category='));
    expect(link).toHaveAttribute('target', '_blank');
    expect(link).toHaveAttribute('rel', 'noopener noreferrer');
  });
});
