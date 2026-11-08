import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { Guestbook } from './Guestbook';
import { siteConfig } from '@config/site.config';

// GiscusComments 会在视口接近时注入脚本与 iframe，测试环境不需要联网：
// mock 成 data-testid 桩，直接暴露 props 便于断言 mapping / term。
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

const renderGuestbook = () =>
  render(
    <MemoryRouter initialEntries={['/guestbook']}>
      <Routes>
        <Route path="/guestbook" element={<Guestbook />} />
      </Routes>
    </MemoryRouter>,
  );

describe('Guestbook', () => {
  it('渲染衬线页面标题，不再输出英文眉题', () => {
    renderGuestbook();
    const heading = screen.getByRole('heading', { level: 1, name: '留言板' });
    expect(heading).toBeInTheDocument();
    expect(heading).toHaveClass('font-serif');
    expect(heading.closest('header')).toHaveClass('rounded-overlay', 'bg-surface');
    expect(screen.queryByText('Guestbook')).not.toBeInTheDocument();
  });

  it('giscusEnabled=true 时按固定 discussion 编号锁定留言讨论', () => {
    expect(siteConfig.giscusEnabled).toBe(true);
    renderGuestbook();
    expect(screen.getByTestId('mock-giscus')).toBeInTheDocument();
    expect(giscusMock.mapping).toBe('number');
    expect(giscusMock.term).toBe(siteConfig.guestbook.discussionId);
    expect(giscusMock.card).toBe(true);
  });
});
