import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { CookieNotice } from './CookieNotice';

const CONSENT_KEY = 'cookie-consent';

const renderNotice = () =>
  render(
    <MemoryRouter>
      <CookieNotice />
    </MemoryRouter>,
  );

describe('CookieNotice', () => {
  beforeEach(() => {
    window.localStorage.clear();
    window.sessionStorage.clear();
  });

  afterEach(() => {
    window.localStorage.clear();
    window.sessionStorage.clear();
  });

  it('未同意过时以居中 dialog 显示提示与隐私政策链接', () => {
    renderNotice();
    const dialog = screen.getByRole('dialog', { name: 'Cookie 与隐私' });
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    expect(screen.getByRole('link', { name: '隐私政策' })).toHaveAttribute('href', '/privacy');
    expect(screen.getByRole('button', { name: '同意' })).toBeInTheDocument();
  });

  it('已同意过时不显示提示', () => {
    window.localStorage.setItem(CONSENT_KEY, 'accepted');
    const { container } = renderNotice();
    expect(container.firstChild).toBeNull();
  });

  it('点击同意写入 localStorage 并隐藏', async () => {
    renderNotice();
    await userEvent.click(screen.getByRole('button', { name: '同意' }));
    expect(window.localStorage.getItem(CONSENT_KEY)).toBe('accepted');
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });

  it('点击关闭仅隐藏不持久化同意', async () => {
    renderNotice();
    await userEvent.click(screen.getByRole('button', { name: '关闭 Cookie 使用说明' }));
    expect(window.localStorage.getItem(CONSENT_KEY)).toBeNull();
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });

  it('localStorage 不可用时仍显示提示（不影响功能）', () => {
    const getItem = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    renderNotice();
    expect(screen.getByRole('dialog', { name: 'Cookie 与隐私' })).toBeInTheDocument();
    getItem.mockRestore();
  });
});
