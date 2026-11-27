import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { GuestbookDetail } from './GuestbookDetail';

// 留言详情与说说详情同一机制：评论区按该份留言的 Discussion 编号精确锁定，
// 这是「回复只通知参与者」的实现点（2026-11 修复）。
const giscusMock = vi.hoisted(() => ({
  mapping: '',
  term: undefined as string | number | undefined,
  card: false,
}));

vi.mock('@/components/GiscusComments', () => ({
  GiscusComments: ({ mapping, term, card }: { mapping?: string; term?: string | number; card?: boolean }) => {
    giscusMock.mapping = mapping ?? '';
    giscusMock.term = term;
    giscusMock.card = card ?? false;
    return <div data-testid="mock-giscus" />;
  },
}));

const entry = {
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

const dataMock = vi.hoisted(() => ({ entry: undefined as typeof entry | undefined }));

vi.mock('@/services/discussions', () => ({
  getInitialDiscussion: () => dataMock.entry,
}));

const renderDetail = (path = '/guestbook/288') =>
  render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/guestbook/:number" element={<GuestbookDetail />} />
        <Route path="/guestbook" element={<div data-testid="list-page" />} />
      </Routes>
    </MemoryRouter>,
  );

describe('GuestbookDetail', () => {
  beforeEach(() => {
    giscusMock.mapping = '';
    giscusMock.term = undefined;
    giscusMock.card = false;
    dataMock.entry = entry;
  });

  it('渲染留言标题、正文与作者', () => {
    renderDetail();
    expect(screen.getByRole('heading', { level: 1, name: '第一次来，混个脸熟' })).toBeInTheDocument();
    expect(screen.getByText('你好呀')).toBeInTheDocument();
    expect(screen.getByText('AUkarl')).toBeInTheDocument();
  });

  it('评论区按该份留言的编号精确锁定（mapping=number）', () => {
    renderDetail();
    expect(giscusMock.mapping).toBe('number');
    expect(giscusMock.term).toBe(288);
    expect(giscusMock.card).toBe(true);
  });

  it('编号不存在时显示「找不到」，不注入评论区', () => {
    dataMock.entry = undefined;
    renderDetail('/guestbook/9999');
    expect(screen.getByText('找不到这份留言')).toBeInTheDocument();
    expect(screen.queryByTestId('mock-giscus')).not.toBeInTheDocument();
  });
});
