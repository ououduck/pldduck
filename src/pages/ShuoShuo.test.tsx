import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { ShuoShuo } from './ShuoShuo';
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

const renderShuoShuo = (initialEntry = '/shuoshuo') =>
  render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <Routes>
        <Route path="/shuoshuo" element={<ShuoShuo />} />
      </Routes>
    </MemoryRouter>,
  );

describe('ShuoShuo', () => {
  it('渲染阅读字体页面标题与介绍，不再输出英文眉题', () => {
    renderShuoShuo();
    const heading = screen.getByRole('heading', { level: 1, name: '说说' });
    expect(heading).toBeInTheDocument();
    expect(heading).toHaveClass('font-sans');
    expect(screen.getByText('这里是一块类似 PLDDUCK 朋友圈的短动态小天地。')).toBeInTheDocument();
    expect(heading.closest('header')).toHaveClass('rounded-overlay', 'bg-surface');
    expect(screen.queryByText('ShuoShuo · Moments')).not.toBeInTheDocument();
  });

  it('giscusEnabled=true 时按公告 discussion 编号锁定内嵌评论区', () => {
    // 默认配置（config/comments.config.json）里 giscusEnabled 为 true；
    // mapping 必须是 number（精确锁定，不自动建讨论），term 是 shuoshuo.discussionId。
    expect(siteConfig.giscusEnabled).toBe(true);
    renderShuoShuo();
    expect(screen.getByTestId('mock-giscus')).toBeInTheDocument();
    expect(giscusMock.mapping).toBe('number');
    expect(giscusMock.term).toBe(siteConfig.shuoshuo.discussionId);
    expect(giscusMock.card).toBe(true);
  });
});
