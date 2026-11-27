import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { ShuoShuoDetail } from './ShuoShuoDetail';

// 详情页是 2026-11 评论通知修复的核心：评论区必须用 mapping="number" + 该条编号，
// 这样 giscus 只锁定这一条 Discussion，通知只落在参与过这一条的人身上。
const giscusMock = vi.hoisted(() => ({
  mapping: '',
  term: undefined as string | number | undefined,
  card: false,
  renderCount: 0,
}));

vi.mock('@/components/GiscusComments', () => ({
  GiscusComments: ({ mapping, term, card }: { mapping?: string; term?: string | number; card?: boolean }) => {
    giscusMock.mapping = mapping ?? '';
    giscusMock.term = term;
    giscusMock.card = card ?? false;
    giscusMock.renderCount += 1;
    return <div data-testid="mock-giscus" />;
  },
}));

// 构建期数据在测试环境不存在（generated/discussions.json 不提交），
// 直接 mock 数据层，覆盖「有条目」与「没条目」两条路径。
const entry = {
  number: 137,
  title: '第一条说说',
  body: '正文 **加粗**',
  excerpt: '第一条说说',
  images: [],
  createdAt: '2026-11-20T10:00:00Z',
  updatedAt: '2026-11-20T10:00:00Z',
  author: { login: 'ououduck', avatarUrl: '', url: 'https://github.com/ououduck' },
  commentCount: 4,
  reactionCount: 0,
  url: 'https://github.com/ououduck/pldduck/discussions/137',
};

const dataMock = vi.hoisted(() => ({ entry: undefined as typeof entry | undefined }));

vi.mock('@/services/discussions', () => ({
  getInitialDiscussion: () => dataMock.entry,
}));

const renderDetail = (path = '/shuoshuo/137') =>
  render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/shuoshuo/:number" element={<ShuoShuoDetail />} />
        <Route path="/shuoshuo" element={<div data-testid="list-page" />} />
      </Routes>
    </MemoryRouter>,
  );

describe('ShuoShuoDetail', () => {
  beforeEach(() => {
    giscusMock.mapping = '';
    giscusMock.term = undefined;
    giscusMock.card = false;
    giscusMock.renderCount = 0;
    dataMock.entry = entry;
  });

  it('渲染标题、正文与作者/时间元信息', () => {
    renderDetail();
    expect(screen.getByRole('heading', { level: 1, name: '第一条说说' })).toBeInTheDocument();
    // 正文由 Markdown 渲染（**加粗** → strong）。
    expect(screen.getByText('加粗').tagName).toBe('STRONG');
    expect(screen.getByText('ououduck')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /在 GitHub 查看/ })).toHaveAttribute(
      'href',
      'https://github.com/ououduck/pldduck/discussions/137',
    );
  });

  it('评论区按该条 Discussion 编号精确锁定（mapping=number）', () => {
    renderDetail();
    expect(screen.getByTestId('mock-giscus')).toBeInTheDocument();
    expect(giscusMock.mapping).toBe('number');
    expect(giscusMock.term).toBe(137);
    expect(giscusMock.card).toBe(true);
  });

  it('编号非法/不存在时显示「找不到」，且不注入评论区（不订阅任何讨论）', () => {
    dataMock.entry = undefined;
    renderDetail('/shuoshuo/999');
    expect(screen.getByText('找不到这条说说')).toBeInTheDocument();
    expect(screen.queryByTestId('mock-giscus')).not.toBeInTheDocument();
  });

  it('旧自建管线的 slug 深链回列表页（保持改造前的 301 契约）', () => {
    renderDetail('/shuoshuo/hello-world');
    expect(screen.getByTestId('list-page')).toBeInTheDocument();
  });
});
