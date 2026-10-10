/**
 * 首页：站点导流页（门户）。
 *
 * 本页不承载文章列表的筛选/分页/搜索：全部数据来自构建期内联的 posts/shuoshuo/
 * friends JSON（同步读取，SSG 与水合首帧严格一致），搜索表单只负责把关键词交给
 * /search 页处理，其余入口一律以链接呈现。
 */

import React, { Suspense, lazy, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import {
  Archive,
  ArrowUpRight,
  BarChart3,
  Check,
  ChevronRight,
  Copy,
  Github,
  Link2,
  Mail,
  MessageSquare,
  Palette,
  PenLine,
  Search,
  Sparkles,
  Stamp,
  User,
  Wrench,
  X,
  type LucideIcon,
} from 'lucide-react';
import { siteConfig, type PortalEntry, type PortalLink, type PortalProject } from '@config/site.config';
import { Seo } from '@/components/Seo';
import { PostCard } from '@/components/PostCard';
import { getInitialPosts } from '@/services/posts';
import { getInitialShuoShuo } from '@/services/shuoshuo';
import { getInitialFriends } from '@/services/friends';
import { removeReadingHistory } from '@/services/readingHistory';
import { useReadingHistory } from '@/hooks/useReadingHistory';
import { useResetTimer } from '@/hooks/useResetTimer';
import { isReadingComplete } from '@/utils/readingProgress';
import { sortPosts } from '@/utils/postSorting';
import { stripMarkdown } from '@/utils/markdownText';
import { formatDate } from '@/utils/date';
import { preloadPage } from '@/utils/preload';
import { copyTextToClipboard } from '@/utils/clipboard';
import { absoluteSiteUrl } from '@/utils/siteUrl';
import { mergeClassName } from '@/utils/classNames';
import type { Friend, PostMetadata, ShuoShuo } from '@/types';

const ShareModal = lazy(() => import('../components/ShareModal').then((m) => ({ default: m.ShareModal })));

const LATEST_POST_COUNT = 3;
const LATEST_SHUOSHUO_COUNT = 3;
const FRIEND_PREVIEW_COUNT = 12;
const SHUOSHUO_SNIPPET_LENGTH = 64;
const COPIED_FEEDBACK_MS = 2000;

const PORTAL_ICONS: Record<string, LucideIcon> = {
  archive: Archive,
  shuoshuo: MessageSquare,
  tool: Wrench,
  friends: Link2,
  about: User,
  search: Search,
  stats: BarChart3,
  guestbook: PenLine,
  cover: Palette,
  watermark: Stamp,
};

const portal = siteConfig.portal ?? {};
const initialPosts = getInitialPosts();
// 构建期内联数据是静态的：列表派生（排序/截取/过滤）在模块作用域算一次即可，
// 无需每次渲染重算，也不会引入时钟/随机值等破坏 SSG 与水合一致性的因素。
const latestPosts = sortPosts(initialPosts, 'newest').slice(0, LATEST_POST_COUNT);
const latestShuoShuo = getInitialShuoShuo().slice(0, LATEST_SHUOSHUO_COUNT);
const activeFriends = getInitialFriends()
  .filter((friend) => !friend.unavailable)
  .slice(0, FRIEND_PREVIEW_COUNT);

/** 站内路径以 / 开头（排除 //protocol-relative 与完整 URL），决定磁贴用 Link 还是 <a>。 */
const isInternalPath = (value: string) => value.startsWith('/') && !value.startsWith('//');

const PortalIcon: React.FC<{ name: string }> = ({ name }) => {
  const Icon = PORTAL_ICONS[name] ?? Sparkles;
  return <Icon size={18} aria-hidden="true" />;
};

const formatShuoShuoDate = (dateText: string) =>
  formatDate(dateText, 'zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit' });

const truncate = (value: string, length: number) =>
  value.length > length ? `${value.slice(0, length).trimEnd()}…` : value;

interface SectionProps {
  id: string;
  eyebrow: string;
  title: string;
  action?: { label: string; to: string };
  children: React.ReactNode;
}

const Section: React.FC<SectionProps> = ({ id, eyebrow, title, action, children }) => (
  <section className="border-t border-zinc-200 py-8 md:py-10 dark:border-zinc-800" aria-labelledby={`${id}-heading`}>
    <div className="mb-5 flex items-end justify-between gap-4 md:mb-6">
      <div>
        <p className="mb-1 text-[10px] font-semibold uppercase tracking-[0.2em] text-zinc-400 dark:text-zinc-500">
          {eyebrow}
        </p>
        <h2 id={`${id}-heading`} className="font-serif text-2xl font-bold text-ink dark:text-white md:text-3xl">
          {title}
        </h2>
      </div>
      {action && (
        <Link
          to={action.to}
          onMouseEnter={() => preloadPage(action.to)}
          className="inline-flex min-h-11 shrink-0 items-center gap-1 text-sm font-semibold text-zinc-600 transition-colors hover:text-ink dark:text-zinc-400 dark:hover:text-white"
        >
          {action.label}
          <ChevronRight size={15} aria-hidden="true" />
        </Link>
      )}
    </div>
    {children}
  </section>
);

const EmptyHint: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <p className="border-y border-zinc-200 py-8 text-center text-sm text-zinc-500 dark:border-zinc-800 dark:text-zinc-400">
    {children}
  </p>
);

const DestinationTile: React.FC<{ entry: PortalEntry; primary?: boolean }> = ({ entry, primary }) => {
  const external = !isInternalPath(entry.url);
  const className = mergeClassName(
    'group relative flex h-full flex-col justify-between rounded-surface border border-zinc-300 bg-white p-5 transition-colors hover:border-ink focus-visible:border-ink dark:border-zinc-700 dark:bg-zinc-900 dark:hover:border-white dark:focus-visible:border-white',
    primary && 'lg:col-span-2',
  );
  const inner = (
    <>
      <div>
        <div className="mb-4 flex items-start justify-between gap-3">
          <span className="inline-flex h-10 w-10 items-center justify-center rounded-icon border border-zinc-300 text-ink transition-colors group-hover:border-ink dark:border-zinc-700 dark:text-white dark:group-hover:border-white">
            <PortalIcon name={entry.icon} />
          </span>
          {external ? (
            <ArrowUpRight size={16} aria-hidden="true" className="text-zinc-400 dark:text-zinc-500" />
          ) : (
            <ChevronRight
              size={16}
              aria-hidden="true"
              className="translate-y-1 text-zinc-400 transition-transform group-hover:translate-x-1 group-hover:text-ink dark:text-zinc-500 dark:group-hover:text-white"
            />
          )}
        </div>
        <h3 className="font-serif text-lg font-bold text-ink dark:text-white">{entry.title}</h3>
        <p className="mt-2 text-sm leading-6 text-zinc-600 dark:text-zinc-400">{entry.description}</p>
      </div>
      {entry.note && (
        <p className="mt-4 text-[11px] font-semibold uppercase tracking-[0.16em] text-zinc-400 dark:text-zinc-500">
          {entry.note}
        </p>
      )}
    </>
  );

  if (external) {
    return (
      <a
        href={entry.url}
        target="_blank"
        rel="noopener noreferrer"
        className={className}
        aria-label={`前往 ${entry.title}（外部站点）`}
      >
        {inner}
      </a>
    );
  }

  return (
    <Link
      to={entry.url}
      className={className}
      onMouseEnter={() => preloadPage(entry.url)}
      aria-label={`前往 ${entry.title}`}
    >
      {inner}
    </Link>
  );
};

const SecondaryLink: React.FC<{ link: PortalLink }> = ({ link }) => {
  const external = !isInternalPath(link.url);
  const className =
    'inline-flex min-h-11 items-center gap-2 rounded-control border border-zinc-300 bg-paper px-3 text-sm font-medium text-zinc-700 transition-colors hover:border-ink hover:text-ink dark:border-zinc-700 dark:bg-void dark:text-zinc-300 dark:hover:border-white dark:hover:text-white';
  const inner = (
    <>
      <PortalIcon name={link.icon} />
      <span>{link.title}</span>
    </>
  );

  return external ? (
    <a href={link.url} target="_blank" rel="noopener noreferrer" className={className}>
      {inner}
    </a>
  ) : (
    <Link to={link.url} className={className} onMouseEnter={() => preloadPage(link.url)}>
      {inner}
    </Link>
  );
};

const ProjectRow: React.FC<{ project: PortalProject }> = ({ project }) => (
  <a
    href={project.url}
    target="_blank"
    rel="noopener noreferrer"
    className="group flex items-start justify-between gap-4 rounded-surface border border-zinc-300 bg-white p-4 transition-colors hover:border-ink focus-visible:border-ink dark:border-zinc-700 dark:bg-zinc-900 dark:hover:border-white dark:focus-visible:border-white"
  >
    <span className="min-w-0">
      <span className="flex flex-wrap items-center gap-2">
        <span className="font-serif text-base font-bold text-ink dark:text-white">{project.title}</span>
        {project.tag && (
          <span className="rounded-full border border-zinc-300 px-2 py-0.5 text-[11px] font-medium text-zinc-500 dark:border-zinc-700 dark:text-zinc-400">
            {project.tag}
          </span>
        )}
      </span>
      <span className="mt-1.5 block text-sm leading-6 text-zinc-600 dark:text-zinc-400">{project.description}</span>
    </span>
    <ArrowUpRight
      size={16}
      aria-hidden="true"
      className="mt-1 shrink-0 text-zinc-400 transition-colors group-hover:text-ink dark:text-zinc-500 dark:group-hover:text-white"
    />
  </a>
);

const ShuoShuoRow: React.FC<{ item: ShuoShuo }> = ({ item }) => (
  <li>
    <Link
      to={`/shuoshuo/${item.id}`}
      className="group flex items-baseline gap-3 border-b border-zinc-200 py-3 transition-colors last:border-b-0 hover:border-zinc-400 dark:border-zinc-800 dark:hover:border-zinc-600"
    >
      <time dateTime={item.date} className="shrink-0 text-xs font-medium tabular-nums text-zinc-400 dark:text-zinc-500">
        {formatShuoShuoDate(item.date)}
      </time>
      <span className="min-w-0 flex-1 truncate text-sm text-zinc-700 transition-colors group-hover:text-ink dark:text-zinc-300 dark:group-hover:text-white">
        {truncate(stripMarkdown(item.content), SHUOSHUO_SNIPPET_LENGTH)}
      </span>
      <ChevronRight size={14} aria-hidden="true" className="shrink-0 text-zinc-300 dark:text-zinc-600" />
    </Link>
  </li>
);

const FriendTile: React.FC<{ friend: Friend }> = ({ friend }) => (
  <a
    href={friend.url}
    target="_blank"
    rel="noopener noreferrer"
    className="flex min-w-0 items-center gap-2.5 rounded-control border border-zinc-300 bg-paper px-3 py-2.5 transition-colors hover:border-ink dark:border-zinc-700 dark:bg-void dark:hover:border-white"
  >
    <span
      aria-hidden="true"
      className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-icon border border-zinc-300 font-serif text-xs font-bold text-zinc-600 dark:border-zinc-700 dark:text-zinc-300"
    >
      {friend.name.trim().slice(0, 1) || '?'}
    </span>
    <span className="min-w-0">
      <span className="block truncate text-sm font-semibold text-ink dark:text-white">{friend.name}</span>
      <span className="block truncate text-xs text-zinc-500 dark:text-zinc-400">{friend.description}</span>
    </span>
  </a>
);

export const Home = () => {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [term, setTerm] = useState('');
  const [sharePost, setSharePost] = useState<PostMetadata | null>(null);
  // 头像源站（q1.qlogo.cn）不可达时回退到 ui-avatars 生成的首字母头像；
  // 仅在 onError 事件中切换，渲染期不访问客户端 API。
  const [avatarFailed, setAvatarFailed] = useState(false);
  const [qqCopied, setQqCopied] = useState(false);
  const { schedule: scheduleCopiedReset } = useResetTimer();
  const { latest: latestReading, refresh: refreshReadingHistory } = useReadingHistory();

  const qqNumber = siteConfig.social.qq;

  // 首页不再承载筛选/分页/搜索状态：残留的 category/sort/page 参数一律清掉，
  // 避免同一份内容以多个 URL 出现（canonical 自指也会随之归一到 /）；
  // ?q= 是旧版首页搜索的分享链接，转交搜索页处理以保留原意图。
  useEffect(() => {
    const query = searchParams.get('q');
    if (query?.trim()) {
      navigate(`/search?${searchParams.toString()}`, { replace: true });
      return;
    }
    if (searchParams.toString() !== '') {
      setSearchParams(new URLSearchParams(), { replace: true });
    }
  }, [navigate, searchParams, setSearchParams]);

  const continueReading = useMemo(() => {
    if (!latestReading || isReadingComplete(latestReading.progress)) return null;
    const matchingPost = initialPosts.find((post) => post.id === latestReading.postId);
    return matchingPost ? { post: matchingPost, entry: latestReading } : null;
  }, [latestReading]);

  // 阅读历史指向已删除的文章：清掉记录，避免「继续阅读」永远显示空条目。
  useEffect(() => {
    if (latestReading && initialPosts.length > 0 && !initialPosts.some((post) => post.id === latestReading.postId)) {
      removeReadingHistory(latestReading.postId);
      refreshReadingHistory();
    }
  }, [latestReading, refreshReadingHistory]);

  const handleSearchSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const query = term.trim();
    if (!query) {
      return;
    }
    navigate(`/search?q=${encodeURIComponent(query)}`);
  };

  const handleAbandonReading = () => {
    if (!continueReading) return;
    removeReadingHistory(continueReading.post.id);
    refreshReadingHistory();
  };

  const handleCopyQQ = async () => {
    if (!qqNumber) return;
    const copied = await copyTextToClipboard(qqNumber);
    if (!copied) return;
    setQqCopied(true);
    scheduleCopiedReset(() => setQqCopied(false), COPIED_FEEDBACK_MS);
  };

  const avatarUrl = avatarFailed
    ? `https://ui-avatars.com/api/?name=${encodeURIComponent(siteConfig.author.name)}&background=1c1917&color=f2f0e9&bold=true`
    : siteConfig.author.avatar;

  const entries = portal.entries ?? [];
  const links = portal.links ?? [];
  const projects = portal.projects ?? [];

  return (
    <div className="pb-10 md:pb-14">
      <Seo title={siteConfig.title} description={siteConfig.description} />

      <section className="py-6 md:py-10">
        <div className="grid gap-6 md:grid-cols-[minmax(0,1fr)_auto] md:items-start">
          <div className="min-w-0">
            <p className="mb-3 text-[11px] font-semibold uppercase tracking-[0.24em] text-zinc-500 dark:text-zinc-400">
              {siteConfig.subtitle} · 主页
            </p>
            <h1 className="text-balance font-serif text-5xl font-bold leading-[1.05] tracking-tight text-ink [overflow-wrap:anywhere] dark:text-white max-[400px]:text-4xl md:text-6xl">
              {siteConfig.title}
            </h1>
            <p className="mt-4 max-w-xl text-sm leading-7 text-zinc-600 dark:text-zinc-300 md:text-base">
              {siteConfig.description}
              {portal.tagline && <span className="text-zinc-400 dark:text-zinc-500"> · {portal.tagline}</span>}
            </p>

            {(portal.status || (portal.tags && portal.tags.length > 0)) && (
              <div className="mt-4 flex flex-wrap items-center gap-2 text-xs">
                {portal.status && (
                  <span className="inline-flex items-center gap-1.5 rounded-full border border-zinc-300 px-2.5 py-1 font-medium text-zinc-600 dark:border-zinc-700 dark:text-zinc-300">
                    <span
                      aria-hidden="true"
                      className="h-1.5 w-1.5 rounded-full bg-emerald-500 motion-safe:animate-pulse"
                    />
                    {portal.status}
                  </span>
                )}
                {portal.tags?.map((tag) => (
                  <span
                    key={tag}
                    className="rounded-full border border-zinc-300 px-2.5 py-1 font-medium text-zinc-500 dark:border-zinc-700 dark:text-zinc-400"
                  >
                    {tag}
                  </span>
                ))}
              </div>
            )}

            {portal.memory && (
              <dl className="mt-6 max-w-md rounded-surface border border-dashed border-zinc-300 px-4 py-3 dark:border-zinc-700">
                <dt className="text-[10px] font-semibold uppercase tracking-[0.2em] text-zinc-400 dark:text-zinc-500">
                  {portal.memory.label}
                </dt>
                <dd className="mt-1 text-sm text-zinc-700 dark:text-zinc-300">
                  {portal.memory.prompt}
                  <span className="mt-0.5 block font-serif text-base font-bold text-ink dark:text-white">
                    {portal.memory.detail}
                  </span>
                </dd>
              </dl>
            )}
          </div>

          <div className="flex items-center gap-4 md:flex-col md:items-end md:gap-3">
            <div className="h-16 w-16 shrink-0 overflow-hidden rounded-full border border-zinc-300 bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-800">
              <img
                src={avatarUrl}
                alt={siteConfig.author.name}
                width={64}
                height={64}
                decoding="async"
                onError={() => setAvatarFailed(true)}
                className="h-full w-full object-cover"
              />
            </div>
            <div className="md:text-right">
              <p className="font-serif text-lg font-bold text-ink dark:text-white">{siteConfig.author.name}</p>
              <p className="text-xs text-zinc-500 dark:text-zinc-400">{siteConfig.author.role}</p>
            </div>
          </div>
        </div>

        <form role="search" onSubmit={handleSearchSubmit} className="mt-8 max-w-2xl">
          <label htmlFor="home-search" className="sr-only">
            站内搜索
          </label>
          <div className="flex gap-2">
            <input
              id="home-search"
              type="search"
              value={term}
              onChange={(event) => setTerm(event.target.value)}
              onFocus={() => preloadPage('/search')}
              placeholder="搜索文章标题与正文…"
              className="editorial-input"
            />
            <button type="submit" className="editorial-button shrink-0 px-4" aria-label="搜索">
              <Search size={16} aria-hidden="true" />
              <span className="hidden sm:inline">搜索</span>
            </button>
          </div>
        </form>
      </section>

      {entries.length > 0 && (
        <Section id="portal" eyebrow="NAVIGATION" title="站点入口" action={{ label: '关于我', to: '/about' }}>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {entries.map((entry, index) => (
              <DestinationTile key={entry.title} entry={entry} primary={index === 0} />
            ))}
          </div>
          {links.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-2">
              {links.map((link) => (
                <SecondaryLink key={link.title} link={link} />
              ))}
            </div>
          )}
        </Section>
      )}

      {projects.length > 0 && (
        <Section id="projects" eyebrow="OPEN SOURCE" title="开源项目">
          <div className="grid gap-3 sm:grid-cols-2">
            {projects.map((project) => (
              <ProjectRow key={project.title} project={project} />
            ))}
          </div>
        </Section>
      )}

      {continueReading && (
        <section
          className="continue-reading border-t border-zinc-200 py-8 dark:border-zinc-800"
          aria-labelledby="continue-reading-heading"
        >
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0">
              <p className="mb-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-zinc-400 dark:text-zinc-500">
                继续阅读
              </p>
              <h2 id="continue-reading-heading" className="truncate text-xl font-bold text-ink dark:text-white">
                {continueReading.post.title}
              </h2>
              <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
                {continueReading.post.category} · 已阅读 {Math.round(continueReading.entry.progress * 100)}%
              </p>
            </div>
            <div className="flex flex-wrap items-center justify-end gap-2">
              <Link
                to={`/post/${continueReading.post.id}`}
                onMouseEnter={() => preloadPage(`/post/${continueReading.post.id}`)}
                className="editorial-button-primary inline-flex min-h-11 shrink-0 items-center justify-center gap-2 px-4 text-sm font-semibold"
                aria-label={`继续阅读：${continueReading.post.title}`}
              >
                继续阅读 <ChevronRight size={15} />
              </Link>
              <button
                type="button"
                onClick={handleAbandonReading}
                className="editorial-button inline-flex min-h-11 shrink-0 items-center justify-center gap-2 px-4 text-sm"
                aria-label={`放弃阅读：${continueReading.post.title}`}
                title="放弃阅读"
              >
                放弃阅读 <X size={15} aria-hidden="true" />
              </button>
            </div>
          </div>
          <div className="mt-4 h-1 overflow-hidden rounded-full bg-zinc-200 dark:bg-zinc-800" aria-hidden="true">
            <div
              className="h-full rounded-full bg-zinc-900 dark:bg-zinc-100"
              style={{ width: `${Math.round(continueReading.entry.progress * 100)}%` }}
            />
          </div>
        </section>
      )}

      <Section id="posts" eyebrow="WRITING" title="最新文章" action={{ label: '全部文章', to: '/archive' }}>
        {latestPosts.length > 0 ? (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
            {latestPosts.map((post) => (
              <PostCard key={post.id} post={post} onShare={setSharePost} />
            ))}
          </div>
        ) : (
          <EmptyHint>还没有文章。</EmptyHint>
        )}
      </Section>

      <Section id="shuoshuo" eyebrow="MINUTES" title="最近说说" action={{ label: '全部说说', to: '/shuoshuo' }}>
        {latestShuoShuo.length > 0 ? (
          <ul className="max-w-3xl">
            {latestShuoShuo.map((item) => (
              <ShuoShuoRow key={item.id} item={item} />
            ))}
          </ul>
        ) : (
          <EmptyHint>还没有说说。</EmptyHint>
        )}
      </Section>

      {activeFriends.length > 0 && (
        <Section id="friends" eyebrow="FRIENDS" title="友情链接" action={{ label: '全部友链', to: '/friends' }}>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {activeFriends.map((friend) => (
              <FriendTile key={friend.url} friend={friend} />
            ))}
          </div>
        </Section>
      )}

      <Section id="contact" eyebrow="CONTACT" title="找到我">
        <div className="flex flex-wrap items-center gap-2">
          <a
            href={siteConfig.social.github}
            target="_blank"
            rel="noopener noreferrer"
            className="editorial-button px-4"
            aria-label="GitHub 主页"
          >
            <Github size={16} aria-hidden="true" />
            GitHub
          </a>
          <a
            href={siteConfig.social.email}
            className="editorial-button px-4"
            aria-label={`发送邮件至 ${siteConfig.social.rawEmail}`}
          >
            <Mail size={16} aria-hidden="true" />
            {siteConfig.social.rawEmail}
          </a>
          {qqNumber && (
            <button
              type="button"
              onClick={handleCopyQQ}
              className="editorial-button px-4"
              aria-label={`复制 QQ 号 ${qqNumber}`}
            >
              {qqCopied ? <Check size={16} aria-hidden="true" /> : <Copy size={16} aria-hidden="true" />}
              QQ {qqCopied ? '已复制' : qqNumber}
            </button>
          )}
        </div>
        <p role="status" aria-live="polite" className="sr-only">
          {qqCopied ? 'QQ 号已复制到剪贴板' : ''}
        </p>
      </Section>

      {sharePost && (
        <Suspense fallback={null}>
          <ShareModal
            isOpen={!!sharePost}
            onClose={() => setSharePost(null)}
            title={sharePost.title}
            excerpt={sharePost.excerpt}
            url={absoluteSiteUrl(`/post/${sharePost.id}`, window.location.origin)}
          />
        </Suspense>
      )}
    </div>
  );
};
