/**
 * 首页：站点导流页（门户）。
 *
 * 文章列表、说说、友链的正文内容一律不在这里出现，只留指向各栏目的入口；
 * 搜索表单只负责把关键词交给 /search 页处理。入口清单来自构建期内联的站点配置，
 * 渲染期不访问任何客户端 API，SSG 与水合首帧严格一致。
 */

import React, { useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import {
  Archive,
  ArrowUpRight,
  BarChart3,
  BookOpen,
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
  type LucideIcon,
} from 'lucide-react';
import { siteConfig, type PortalEntry, type PortalLink, type PortalProject } from '@config/site.config';
import { Seo } from '@/components/Seo';
import { useResetTimer } from '@/hooks/useResetTimer';
import { preloadPage } from '@/utils/preload';
import { copyTextToClipboard } from '@/utils/clipboard';
import { mergeClassName } from '@/utils/classNames';

const COPIED_FEEDBACK_MS = 2000;

const PORTAL_ICONS: Record<string, LucideIcon> = {
  posts: BookOpen,
  archive: Archive,
  shuoshuo: MessageSquare,
  friends: Link2,
  about: User,
  search: Search,
  stats: BarChart3,
  guestbook: PenLine,
  cover: Palette,
  watermark: Stamp,
};

const portal = siteConfig.portal ?? {};

/** 站内路径以 / 开头（排除 //protocol-relative 与完整 URL），决定磁贴用 Link 还是 <a>。 */
const isInternalPath = (value: string) => value.startsWith('/') && !value.startsWith('//');

const PortalIcon: React.FC<{ name: string }> = ({ name }) => {
  const Icon = PORTAL_ICONS[name] ?? Sparkles;
  return <Icon size={18} aria-hidden="true" />;
};

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

export const Home = () => {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [term, setTerm] = useState('');
  // 头像源站（q1.qlogo.cn）不可达时回退到 ui-avatars 生成的首字母头像；
  // 仅在 onError 事件中切换，渲染期不访问客户端 API。
  const [avatarFailed, setAvatarFailed] = useState(false);
  const [qqCopied, setQqCopied] = useState(false);
  const { schedule: scheduleCopiedReset } = useResetTimer();

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

  const handleSearchSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const query = term.trim();
    if (!query) {
      return;
    }
    navigate(`/search?q=${encodeURIComponent(query)}`);
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
            <div className="h-28 w-28 shrink-0 overflow-hidden rounded-full border border-zinc-300 bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-800 sm:h-32 sm:w-32">
              <img
                src={avatarUrl}
                alt={siteConfig.author.name}
                width={128}
                height={128}
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
    </div>
  );
};
