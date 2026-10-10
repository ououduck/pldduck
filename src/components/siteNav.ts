/**
 * 全站导航清单唯一来源：桌面侧边栏与移动抽屉共用同一份分组模型，避免两份清单漂移。
 *
 * 新增页面时这里与 `config/routes.mjs` 需同步维护（见 ai-rules/layout-nav.md）。
 */

import {
  Archive,
  BarChart3,
  Bell,
  BookOpen,
  Github,
  House,
  Image as ImageIcon,
  Info,
  Mail,
  MessageCircle,
  MessageSquareText,
  Rss,
  Search,
  Stamp,
  Tag,
  TrainFront,
  Users,
} from 'lucide-react';
import { assetUrl } from '@/utils/siteUrl';
import { siteConfig } from '@config/site.config';
import { ISSUE_SUBSCRIPTION_URL } from './IssueSubscriptionCard';

/** lucide 图标组件类型：沿用 Layout 既有写法，避免依赖 lucide 的类型导出名。 */
type NavIcon = typeof BookOpen;

export interface NavPathItem {
  key: string;
  path: string;
  label: string;
  hint: string;
  icon: NavIcon;
}

export interface NavHrefItem {
  key: string;
  href: string;
  label: string;
  hint: string;
  icon: NavIcon;
  /** 外链是否新窗口打开；mailto 等就地打开的填 false。缺省视为 true。 */
  newTab?: boolean;
}

export type NavItem = NavPathItem | NavHrefItem;

export interface NavGroup {
  label: string;
  items: NavItem[];
}

/** 侧边栏/抽屉分组清单。 */
export const navGroups: NavGroup[] = [
  {
    label: '主页',
    items: [{ key: 'home', path: '/', label: '首页', hint: '站点概览', icon: House }],
  },
  {
    label: '栏目',
    items: [
      { key: 'posts', path: '/posts', label: '文章', hint: '全部文章', icon: BookOpen },
      { key: 'shuoshuo', path: '/shuoshuo', label: '说说', hint: '朋友圈式动态', icon: MessageCircle },
      { key: 'archive', path: '/archive', label: '归档', hint: '时间归档', icon: Archive },
      { key: 'tags', path: '/tags', label: '标签', hint: '主题筛选', icon: Tag },
      { key: 'stats', path: '/stats', label: '统计', hint: '站点数据', icon: BarChart3 },
      { key: 'friends', path: '/friends', label: '友链', hint: '友情链接', icon: Users },
      { key: 'guestbook', path: '/guestbook', label: '留言', hint: '留言互动', icon: MessageSquareText },
      { key: 'about', path: '/about', label: '关于', hint: '站点介绍', icon: Info },
      {
        key: 'travellings',
        href: 'https://www.travellings.cn/go.html',
        label: '开往',
        hint: '随机前往成员站点',
        icon: TrainFront,
      },
    ],
  },
  {
    label: '工具',
    items: [
      { key: 'search', path: '/search', label: '站内搜索', hint: '全站检索', icon: Search },
      { key: 'cover', path: '/cover', label: '封面生成器', hint: '制作文章封面', icon: ImageIcon },
      { key: 'watermark', path: '/watermark', label: '水印工具', hint: '给图片加文字水印', icon: Stamp },
    ],
  },
  {
    label: '订阅与联系',
    items: [
      { key: 'email', href: siteConfig.social.email, label: '邮件', hint: '联系作者', icon: Mail, newTab: false },
      { key: 'github', href: siteConfig.friendsPage.repoUrl, label: 'GitHub', hint: '项目仓库', icon: Github },
      { key: 'rss', href: assetUrl('/feed.xml'), label: 'RSS 订阅', hint: '订阅更新', icon: Rss },
      { key: 'issue-subscription', href: ISSUE_SUBSCRIPTION_URL, label: '更新订阅', hint: '接收文章提醒', icon: Bell },
    ],
  },
];

/** 导航项激活判定：文章详情页归属「文章」栏目。 */
export const isNavItemActive = (path: string, pathname: string) =>
  pathname === path || (path === '/posts' && pathname.startsWith('/post/'));

/**
 * 顶栏面包屑页名：精确命中导航项，其次按详情路径归属栏目；
 * 未命中（如 404）返回 null，由调用方决定回退文案。
 */
export const resolveNavLabel = (pathname: string): string | null => {
  for (const group of navGroups) {
    for (const item of group.items) {
      if ('path' in item && isNavItemActive(item.path, pathname)) {
        return item.label;
      }
    }
  }

  if (pathname.startsWith('/shuoshuo/')) {
    return '说说';
  }

  return null;
};
