import { describe, it, expect, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { BatchCoverDialog } from './BatchCoverDialog';

const renderDialog = (onGenerate = vi.fn()) =>
  render(<BatchCoverDialog isOpen onClose={vi.fn()} onGenerate={onGenerate} />);

const uploadCsv = () => {
  const input = document.querySelector('input[type="file"]') as HTMLInputElement;
  const file = new File(['title,slug\n第一篇封面,first'], 'batch.csv', { type: 'text/csv' });
  fireEvent.change(input, { target: { files: [file] } });
};

describe('BatchCoverDialog', () => {
  it('读到条目后主操作按钮使用反色语义类，深色下不会白底白字', async () => {
    renderDialog();
    uploadCsv();

    const primary = await screen.findByRole('button', { name: '开始生成 ZIP' });
    await waitFor(() => expect(primary).toBeInTheDocument());
    // 深色 Token 下 ink/white 都是近白：主操作按钮必须用 accent 底 + background 字，
    // 旧写法 dark:bg-white dark:text-ink 会渲染成「按钮过白不可见」。
    expect(primary).toHaveClass('bg-accent', 'text-background');
    expect(primary.className).not.toMatch(/dark:bg-white|dark:text-ink|text-white/);
  });

  it('未读到条目时不渲染主操作按钮', () => {
    renderDialog();
    expect(screen.queryByRole('button', { name: '开始生成 ZIP' })).not.toBeInTheDocument();
  });
});
