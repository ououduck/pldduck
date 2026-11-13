/**
 * 客户端渲染入口：SSR 静态 HTML 存在时以水合接管，否则普通渲染；
 * 生产构建下注册 Service Worker。
 */
import React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';
import App from './App';
import { registerServiceWorker } from './registerServiceWorker';

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error('找不到挂载点 #root 元素');
}

document.head.querySelectorAll('[data-rh="true"]').forEach((element) => element.remove());

// 生产构建的静态 HTML 已含服务端渲染内容，使用水合接管（hydrateRoot 需一次性传入元素）；
// 开发模式（空 root）走普通客户端渲染。
const app = (
  <React.StrictMode>
    <App />
  </React.StrictMode>
);

if (rootElement.childElementCount > 0) {
  ReactDOM.hydrateRoot(rootElement, app);
} else {
  ReactDOM.createRoot(rootElement).render(app);
}

// 打印样式（src/styles/print.css）在屏幕首屏完全用不到：浏览器空闲时再动态 import，
// 让 Vite 把它拆成独立带 hash 的 CSS asset，不进入首屏关键路径（HTML 里没有任何引用）。
// 规则全部在 @page / @media print 内，对屏幕渲染没有副作用；加载失败只是打印回退到
// 浏览器默认排版，不影响页面功能。SSR 不执行本文件，仍保留 window 守卫以防被复用。
if (typeof window !== 'undefined') {
  const loadPrintStyles = () => {
    void import('./styles/print.css').catch(() => {
      // 失败静默：打印样式是增强项，不阻塞也不提示。
    });
  };

  if (typeof window.requestIdleCallback === 'function') {
    window.requestIdleCallback(loadPrintStyles, { timeout: 2000 });
  } else {
    // Safari 等没有 requestIdleCallback 的内核：退化为首帧后的短延时加载。
    window.setTimeout(loadPrintStyles, 1200);
  }
}

// 仅生产构建注册 Service Worker：dev 下模块 URL 无内容哈希，SW 的
// stale-while-revalidate 缓存会优先命中旧模块，导致改动代码后刷新看不到效果。
if (import.meta.env.PROD) {
  registerServiceWorker();
}
