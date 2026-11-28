/**
 * 路由级预加载：悬停时按需加载目标页面 chunk，受网络状态（saveData/2g）约束并去重。
 */

type ModuleLoader = () => Promise<{ default: React.ComponentType }>;

type NetworkInformation = {
  saveData?: boolean;
  effectiveType?: string;
};

const preloadedPaths = new Set<string>();

const canPreload = () => {
  if (typeof navigator === 'undefined') {
    return false;
  }

  const connection = (navigator as Navigator & { connection?: NetworkInformation }).connection;
  if (!connection) {
    return true;
  }

  return !connection.saveData && connection.effectiveType !== 'slow-2g' && connection.effectiveType !== '2g';
};

const pageLoaders: Record<string, ModuleLoader> = {
  '/posts': () => import('../pages/Posts').then((m) => ({ default: m.Posts })),
  '/archive': () => import('../pages/Archive').then((m) => ({ default: m.ArchivePage })),
  '/friends': () => import('../pages/Friends').then((m) => ({ default: m.Friends })),
  '/shuoshuo': () => import('../pages/ShuoShuo').then((m) => ({ default: m.ShuoShuo })),
  '/cover': () => import('../pages/CoverGenerator').then((m) => ({ default: m.CoverGenerator })),
  '/watermark': () => import('../pages/Watermark').then((m) => ({ default: m.Watermark })),
  '/search': () => import('../pages/Search').then((m) => ({ default: m.Search })),
  '/privacy': () => import('../pages/Privacy').then((m) => ({ default: m.Privacy })),
};

export { pageLoaders };

/** 悬停时预加载目标页面模块（受网络状况与省流量偏好约束）。 */
export const preloadPage = (path: string) => {
  if (!canPreload() || preloadedPaths.has(path)) {
    return;
  }

  preloadedPaths.add(path);

  if (path.startsWith('/post/')) {
    import('../pages/Post').catch(() => {
      preloadedPaths.delete(path);
    });
    return;
  }

  // 说说分页（/shuoshuo/page/<n>）与列表页共用同一 chunk：pageLoaders 里已按
  // '/shuoshuo' 注册，这里不再单独分支。逐条说说页已取消（2026-11）。
  const loader = pageLoaders[path];
  if (loader) {
    loader().catch(() => {
      preloadedPaths.delete(path);
    });
  }
};
