import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';

/**
 * 联系方式卡（首页）：QQ 二维码弹窗、邮箱前缀显示与六个入口的统一样式。
 *
 * 配置用可变 mock：真实 `config/site.config.json` 里的 `social.qqQrCode` 由 Pages CMS 填写，
 * 测试不能依赖它当前是否为空。
 */
const mocks = vi.hoisted(() => ({
  social: {
    github: 'https://github.com/example',
    email: 'mailto:someone@example.com',
    rawEmail: 'someone@example.com',
    qq: '10001',
    qqQrCode: 'https://cdn.example.com/qq-qr.png',
  },
  repoUrl: 'https://github.com/example/repo',
}));

vi.mock('@config/site.config', () => ({
  siteConfig: {
    social: mocks.social,
    friendsPage: { repoUrl: mocks.repoUrl },
  },
}));

import { ContactWidget } from './ContactWidget';

const renderWidget = () =>
  render(
    <MemoryRouter>
      <ContactWidget />
    </MemoryRouter>,
  );

const getQqButton = () => screen.getByRole('button', { name: /QQ 二维码/ });

const openQrDialog = async () => {
  await userEvent.setup().click(getQqButton());
  return screen.findByRole('dialog', { name: 'QQ 二维码' });
};

describe('ContactWidget', () => {
  beforeEach(() => {
    mocks.social.qqQrCode = 'https://cdn.example.com/qq-qr.png';
  });

  it('邮箱只显示 @ 前的名字，完整地址进可访问名称，且不再用省略号截断', () => {
    renderWidget();

    const mailLink = screen.getByRole('link', { name: '发送邮件到 someone@example.com' });
    expect(mailLink).toHaveAttribute('href', 'mailto:someone@example.com');
    expect(mailLink).toHaveTextContent('someone');
    expect(mailLink).not.toHaveTextContent('someone@example.com');
    expect(mailLink.className).not.toContain('truncate');
    expect(mailLink.querySelector('.truncate')).toBeNull();
  });

  it('六个入口共用同一套胶囊样式与 15px 图标（QQ 用 SVG 图标）', () => {
    renderWidget();

    const nav = screen.getByRole('navigation', { name: '联系方式' });
    const items = Array.from(nav.querySelectorAll<HTMLElement>('a, button'));
    expect(items).toHaveLength(6);

    items.forEach((item) => {
      expect(item).toHaveClass('min-h-11');
      expect(item).toHaveClass('rounded-control');
      expect(item).toHaveClass('gap-2');
      expect(item.querySelector('.truncate')).toBeNull();

      const icon = item.querySelector('svg');
      expect(icon).not.toBeNull();
      expect(icon).toHaveAttribute('width', '15');
      expect(icon).toHaveAttribute('height', '15');
    });

    // QQ 是内联 SVG（不是 lucide 的复制图标），可见文字只有 QQ，号码留到弹窗里。
    const qqButton = getQqButton();
    expect(qqButton.querySelector('svg path')).not.toBeNull();
    expect(qqButton).toHaveTextContent('QQ');
    expect(qqButton).not.toHaveTextContent('10001');
  });

  it('未配置二维码图片链接时不渲染 QQ 入口', () => {
    mocks.social.qqQrCode = '';
    renderWidget();

    expect(screen.queryByRole('button', { name: /QQ/ })).not.toBeInTheDocument();
    expect(screen.getByRole('navigation', { name: '联系方式' }).querySelectorAll('a, button')).toHaveLength(5);
  });

  it('鼠标悬停即弹出二维码弹窗（图片来自 CMS 配置）', async () => {
    const user = userEvent.setup();
    renderWidget();

    const qqButton = getQqButton();
    expect(qqButton).toHaveAttribute('aria-haspopup', 'dialog');
    expect(qqButton).toHaveAttribute('aria-expanded', 'false');

    await user.hover(qqButton);

    const dialog = await screen.findByRole('dialog', { name: 'QQ 二维码' });
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    expect(qqButton).toHaveAttribute('aria-expanded', 'true');
    expect(qqButton).toHaveAttribute('aria-controls', dialog.id);

    const image = screen.getByRole('img', { name: 'QQ 号 10001 的二维码' });
    expect(image).toHaveAttribute('src', 'https://cdn.example.com/qq-qr.png');
    expect(screen.getByText('QQ 号 10001')).toBeInTheDocument();
  });

  it('点击同样打开弹窗（手机点击路径），弹窗挂在 body 上不被卡片裁剪', async () => {
    const user = userEvent.setup();
    renderWidget();

    await user.click(getQqButton());

    const dialog = await screen.findByRole('dialog', { name: 'QQ 二维码' });
    // 卡片有入场动画的 transform + overflow-hidden：fixed 子元素会被裁剪，必须走 portal。
    expect(document.body.contains(dialog)).toBe(true);
    expect(screen.getByRole('navigation', { name: '联系方式' }).contains(dialog)).toBe(false);
  });

  it('Escape 关闭弹窗并把焦点还给 QQ 入口', async () => {
    const user = userEvent.setup();
    renderWidget();

    const qqButton = getQqButton();
    qqButton.focus();
    await user.keyboard('{Enter}');

    await screen.findByRole('dialog', { name: 'QQ 二维码' });
    await waitFor(() => expect(screen.getByRole('button', { name: '关闭 QQ 二维码' })).toHaveFocus());

    await user.keyboard('{Escape}');

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    await waitFor(() => expect(qqButton).toHaveFocus());
  });

  it('关闭后指针仍停在入口上时，不会被浏览器补发的 mouseenter 立刻重开', async () => {
    const user = userEvent.setup();
    renderWidget();

    const qqButton = getQqButton();
    fireEvent.mouseEnter(qqButton);
    await screen.findByRole('dialog', { name: 'QQ 二维码' });

    await user.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());

    // 遮罩移除后，指针下的入口会收到一次补发的 mouseenter：不能因此立刻弹回。
    fireEvent.mouseEnter(qqButton);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();

    // 抑制窗口结束后，悬停打开恢复正常（点击路径不受抑制窗口限制）。
    await new Promise((resolve) => setTimeout(resolve, 450));
    fireEvent.mouseEnter(qqButton);
    expect(await screen.findByRole('dialog', { name: 'QQ 二维码' })).toBeInTheDocument();
  });

  it('点击关闭按钮或遮罩都能关闭弹窗', async () => {
    const user = userEvent.setup();
    renderWidget();

    await openQrDialog();
    await user.click(screen.getByRole('button', { name: '关闭 QQ 二维码' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());

    await openQrDialog();
    const dialog = screen.getByRole('dialog', { name: 'QQ 二维码' });
    fireEvent.click(dialog.parentElement as HTMLElement);
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });

  it('二维码加载失败时如实提示，重新打开会重置失败态', async () => {
    const user = userEvent.setup();
    renderWidget();

    await openQrDialog();
    fireEvent.error(screen.getByRole('img', { name: 'QQ 号 10001 的二维码' }));

    expect(screen.getByRole('status')).toHaveTextContent('二维码加载失败，请稍后重试。');
    expect(screen.queryByRole('img', { name: 'QQ 号 10001 的二维码' })).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: '关闭 QQ 二维码' }));
    await openQrDialog();

    expect(screen.getByRole('img', { name: 'QQ 号 10001 的二维码' })).toBeInTheDocument();
  });
});
