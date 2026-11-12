import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';

/**
 * 联系方式卡（首页）：QQ 二维码悬浮层、邮箱前缀显示与六个入口的统一样式。
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
const findPopover = () => screen.findByRole('dialog', { name: 'QQ 号 10001 的二维码' });

const openByHover = async () => {
  await userEvent.setup().hover(getQqButton());
  return findPopover();
};

const openByClick = () => {
  fireEvent.click(getQqButton());
  return findPopover();
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

    // QQ 是内联 SVG（不是 lucide 的复制图标），可见文字只有 QQ，号码留到悬浮层里。
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

  it('鼠标悬停时在按钮上方弹出小悬浮层（非全屏遮罩、无 aria-modal）', async () => {
    renderWidget();

    const qqButton = getQqButton();
    expect(qqButton).toHaveAttribute('aria-haspopup', 'dialog');
    expect(qqButton).toHaveAttribute('aria-expanded', 'false');

    const popover = await openByHover();

    expect(popover).not.toHaveAttribute('aria-modal');
    expect(popover.className).toContain('fixed');
    expect(popover.style.width).toBe('200px');
    expect(popover.style.left).toBeTruthy();
    expect(popover.style.top || popover.style.bottom).toBeTruthy();
    // 不是全屏遮罩：没有覆盖整个视口的 fixed inset-0 背景层。
    expect(document.querySelector('.fixed.inset-0')).toBeNull();

    expect(qqButton).toHaveAttribute('aria-expanded', 'true');
    expect(qqButton).toHaveAttribute('aria-controls', popover.id);

    const image = screen.getByRole('img', { name: 'QQ 号 10001 的二维码' });
    expect(image).toHaveAttribute('src', 'https://cdn.example.com/qq-qr.png');
    expect(screen.getByText('QQ 号 10001')).toBeInTheDocument();
  });

  it('悬浮层挂在 body 上，不被卡片入场动画与 overflow-hidden 裁剪', async () => {
    renderWidget();

    const popover = await openByHover();

    expect(document.body.contains(popover)).toBe(true);
    expect(screen.getByRole('navigation', { name: '联系方式' }).contains(popover)).toBe(false);
  });

  it('鼠标移出后收起悬浮层', async () => {
    const user = userEvent.setup();
    renderWidget();

    await user.hover(getQqButton());
    await findPopover();

    await user.unhover(getQqButton());
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });

  it('触屏的 pointerenter 不会误开，点击可切换开合（手机点击路径）', async () => {
    renderWidget();
    const qqButton = getQqButton();

    fireEvent.pointerOver(qqButton, { pointerType: 'touch', relatedTarget: null });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();

    fireEvent.click(qqButton);
    await findPopover();

    fireEvent.click(qqButton);
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });

  it('Escape 与点击悬浮层外部都能关闭', async () => {
    renderWidget();

    await openByClick();
    fireEvent.keyDown(window, { key: 'Escape' });
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());

    await openByClick();
    fireEvent.pointerDown(document.body);
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });

  it('二维码加载失败时如实提示，重新打开会重置失败态', async () => {
    renderWidget();

    await openByClick();
    fireEvent.error(screen.getByRole('img', { name: 'QQ 号 10001 的二维码' }));

    expect(screen.getByRole('status')).toHaveTextContent('二维码加载失败，请稍后重试。');
    expect(screen.queryByRole('img', { name: 'QQ 号 10001 的二维码' })).not.toBeInTheDocument();

    fireEvent.click(getQqButton());
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());

    await openByClick();
    expect(screen.getByRole('img', { name: 'QQ 号 10001 的二维码' })).toBeInTheDocument();
  });
});
