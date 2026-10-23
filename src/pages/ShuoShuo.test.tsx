import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { ShuoShuo } from './ShuoShuo';
import { siteConfig } from '@config/site.config';

// GiscusComments 会在视口接近时注入脚本与 iframe，测试环境不需要联网：
// mock 成 data-testid 桩，直接暴露 props 便于断言 mapping / term。
const giscusMock = vi.hoisted(() => ({ mapping: '', term: undefined as string | number | undefined }));

vi.mock('@/components/GiscusComments', () => ({
  GiscusComments: ({ mapping, term }: { mapping?: string; term?: string | number }) => {
    giscusMock.mapping = mapping ?? '';
    giscusMock.term = term;
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
  it('页面标题与介绍渲染', () => {
    renderShuoShuo();
    expect(screen.getByRole('heading', { level: 1, name: '说说' })).toBeInTheDocument();
  });

  it('giscusEnabled=true 时按公告 discussion 编号锁定内嵌评论区', () => {
    // 默认配置（config/comments.config.json）里 giscusEnabled 为 true；
    // mapping 必须是 number（精确锁定，不自动建讨论），term 是 shuoshuo.discussionId。
    expect(siteConfig.giscusEnabled).toBe(true);
    renderShuoShuo();
    expect(screen.getByTestId('mock-giscus')).toBeInTheDocument();
    expect(giscusMock.mapping).toBe('number');
    expect(giscusMock.term).toBe(siteConfig.shuoshuo.discussionId);
  });
});
