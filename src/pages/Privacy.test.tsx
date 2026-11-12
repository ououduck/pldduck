import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { HelmetProvider } from 'react-helmet-async';
import { MemoryRouter } from 'react-router-dom';
import { Privacy } from './Privacy';

const renderPrivacy = () =>
  render(
    <HelmetProvider>
      <MemoryRouter initialEntries={['/privacy']}>
        <Privacy />
      </MemoryRouter>
    </HelmetProvider>,
  );

describe('Privacy', () => {
  it('渲染隐私政策标题、卡片和联系渠道', () => {
    renderPrivacy();

    expect(screen.getByRole('heading', { level: 1, name: '隐私政策' })).toHaveClass('font-sans');
    expect(screen.getByText('本站会保存什么')).toBeInTheDocument();
    expect(screen.getByText('访问统计')).toBeInTheDocument();
    expect(screen.getByText('评论与 GitHub')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /留言板/ })).toHaveAttribute('href', '/guestbook');
    expect(screen.getByRole('link', { name: /pldduck@outlook\.com/ })).toHaveAttribute(
      'href',
      expect.stringMatching(/^mailto:/),
    );
  });

  it('输出隐私政策 SEO 标题与 WebPage schema', () => {
    renderPrivacy();

    expect(document.title).toContain('隐私政策');
    const script = Array.from(document.querySelectorAll('script[type="application/ld+json"]')).find((element) =>
      element.textContent?.includes('WebPage'),
    );
    expect(script).toBeTruthy();
  });
});
