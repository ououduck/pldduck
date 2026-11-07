import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { CompactPostCard } from './CompactPostCard';
import type { PostMetadata } from '@/types';

const makePost = (overrides: Partial<PostMetadata> = {}): PostMetadata => ({
  id: 'compact-post',
  title: '紧凑文章标题',
  excerpt: '紧凑文章摘要',
  date: '2026-03-14',
  category: '技术',
  filePath: '/posts/compact.md',
  readTime: '3分钟阅读',
  tags: [],
  ...overrides,
});

const renderCard = (overrides: Partial<PostMetadata> = {}) =>
  render(
    <MemoryRouter initialEntries={['/search']}>
      <CompactPostCard post={makePost(overrides)} />
    </MemoryRouter>,
  );

describe('CompactPostCard', () => {
  it('轻量横幅：保留标题/分类/日期/摘要与文章链接，不再用固定高度重卡片', () => {
    renderCard();

    const link = screen.getByRole('link', { name: /紧凑文章标题/ });
    expect(link).toHaveAttribute('href', '/post/compact-post');
    // 两处共用（Search 移动端 / 相关文章）：外层必须 h-full 由父级网格定宽，
    // 且不得回到旧版固定 h-24 + 边框/白底/圆角重卡片。
    expect(link).toHaveClass('h-full');
    expect(link).not.toHaveClass('h-24');
    expect(link.className).not.toMatch(/\bborder\b|bg-white|rounded-surface/);

    expect(screen.getByRole('heading', { name: '紧凑文章标题' })).toBeInTheDocument();
    expect(screen.getByText('技术')).toBeInTheDocument();
    expect(screen.getByText('2026/03/14')).toBeInTheDocument();
    expect(screen.getByText('紧凑文章摘要')).toBeInTheDocument();
  });

  it('有封面渲染装饰性图片（alt 为空），无封面显示轻量占位', () => {
    const { container, unmount } = renderCard({ coverImage: '/posts-img/cover.png' });
    const image = container.querySelector('img');
    expect(image).not.toBeNull();
    expect(image).toHaveAttribute('alt', '');
    unmount();

    renderCard();
    expect(screen.getByText('无封面')).toBeInTheDocument();
  });
});
