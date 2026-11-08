/**
 * 友链页：展示友情链接（失联分组）与友链申请入口（页面填资料 → 预填 GitHub Issue 正文）；
 * 已收录条目的信息修改走站长邮箱，不再单独设计申请流程。
 */

import { useEffect, useMemo, useState } from 'react';
import type { ChangeEvent, FormEvent } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ArrowRight, Mail, ChevronDown, Shuffle } from 'lucide-react';
import { SearchField } from '@/components/SearchField';
import { siteConfig } from '@config/site.config';
import { getFriends, getInitialFriends } from '@/services/friends';
import { Seo, buildSiteSchemas } from '../components/Seo';
import { absoluteSiteUrl } from '@/utils/siteUrl';
import { FRIEND_ISSUE_CONFIRMATIONS, buildFriendIssueUrl } from '@/utils/friendIssue';
import type { Friend } from '../types';
import { ProgressiveImage } from '@/components/ProgressiveImage';
import { ContentStatus, LoadingStatus } from '@/components/ContentStatus';
import { useReducedMotion } from '@/hooks/useReducedMotion';
import { easeOut } from '@/utils/motion';

const getFriendDomain = (url: string) => {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
};

interface FriendEntryProps {
  friend: Friend;
  /** 已失联样式：头像右下角红色闪烁小点 + 「已失联」弱提示 + 弱化文字色。 */
  unavailable?: boolean;
}

/**
 * 友链条目：正常与已失联友链共用同一轻量布局（无卡片外框/底色/阴影/大圆角）。
 * 已失联状态由友链失联巡检（friend-availability-audit.yml）每日双向同步进 friends/*.json
 * 的 `"unavailable": true`；Pages CMS 里的手工勾选会被下一轮巡检覆写。未配置（缺失/false）视为正常。
 */
const FriendEntry = ({ friend, unavailable = false }: FriendEntryProps) => {
  // 头像缺失或加载失败时回退到站点头像，避免空头像。key 取当前头像地址：
  // 回退瞬间重挂 ProgressiveImage，直接进新实例的加载态，跳过其内部
  // 「图片暂时无法加载」错误框的一帧闪现。站点头像若也失败则保留 ProgressiveImage 兜底错误态。
  const [avatarFailed, setAvatarFailed] = useState(false);
  const avatarSrc = friend.avatar && !avatarFailed ? friend.avatar : SITE_AVATAR;

  return (
    <a
      href={friend.url}
      target="_blank"
      rel="noopener noreferrer"
      className={`group flex h-32 min-w-0 items-start gap-4 overflow-hidden rounded-overlay bg-surface-muted p-4 transition-colors hover:bg-surface focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-content ${
        unavailable ? 'text-content-muted' : ''
      }`}
    >
      <span className="relative h-12 w-12 shrink-0">
        <span className="block h-12 w-12 overflow-hidden rounded-full bg-surface-muted ring-1 ring-line">
          <ProgressiveImage
            key={avatarSrc}
            src={avatarSrc}
            alt={friend.name}
            onError={() => setAvatarFailed(true)}
            wrapperClassName="h-full w-full"
            className="h-full w-full object-cover object-center"
            effect="fade"
          />
        </span>
        {unavailable && (
          <span
            aria-hidden="true"
            className="friend-dead-dot absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full border-2 border-background bg-red-500"
          />
        )}
      </span>

      <span className="min-w-0 flex-1">
        <span className="flex min-w-0 items-baseline gap-2">
          <span
            className={`truncate text-[15px] font-semibold tracking-[-0.01em] transition-colors ${
              unavailable
                ? 'text-content-muted'
                : 'text-content group-hover:text-zinc-700 dark:group-hover:text-zinc-300'
            }`}
          >
            {friend.name}
          </span>
          {unavailable && (
            <span className="shrink-0 text-[11px] font-medium text-red-500/90 dark:text-red-400/90">已失联</span>
          )}
        </span>
        <span className="mt-1 block line-clamp-2 text-sm leading-relaxed text-content-muted">{friend.description}</span>
        <span
          className={`mt-1.5 block truncate text-xs ${
            unavailable
              ? 'text-red-500/80 dark:text-red-400/80'
              : 'text-zinc-400 transition-colors group-hover:text-zinc-600 dark:text-zinc-500 dark:group-hover:text-zinc-300'
          }`}
        >
          {getFriendDomain(friend.url)}
        </span>
      </span>
    </a>
  );
};

// 构建期 SSG：friends.json 已通过 eager glob 内联，SSR 阶段即可同步渲染友链列表，
// 客户端水合首帧与 SSR 输出一致；异步重取仅用于“重新加载”。
const initialFriends = getInitialFriends();

/** 站点头像绝对地址：友链头像缺失或加载失败时的兜底，避免出现空头像。 */
const SITE_AVATAR = absoluteSiteUrl(siteConfig.logo, siteConfig.url);

/** 已收录条目的信息修改联系邮箱：不接 Issue 流程，也不为此新增配置键。 */
const FRIEND_EDIT_CONTACT_EMAIL = 'pldduck@outlook.com';

const APPLY_FIELD_CLASS = 'mb-1.5 block text-xs font-semibold text-content-muted';

interface ApplyFormState {
  name: string;
  url: string;
  backlinkUrl: string;
  avatar: string;
  description: string;
}

const EMPTY_APPLY_FORM: ApplyFormState = {
  name: '',
  url: '',
  backlinkUrl: '',
  avatar: '',
  description: '',
};

/**
 * 申请资料填写卡：填完直接把正文预填进 GitHub 新建 Issue 页。
 * 页面自身不发请求、不落数据，采集面仍然是 Issue（正文格式与模板渲染结果同构，
 * 由 src/utils/friendIssue.test.ts 用机器人的解析器做往返校验）。
 */
const FriendApplyForm = () => {
  const [form, setForm] = useState<ApplyFormState>(EMPTY_APPLY_FORM);
  const [confirmed, setConfirmed] = useState<boolean[]>(() => FRIEND_ISSUE_CONFIRMATIONS.map(() => false));
  const [error, setError] = useState('');

  const updateField = (key: keyof ApplyFormState) => (event: ChangeEvent<HTMLInputElement>) =>
    setForm((previous) => ({ ...previous, [key]: event.target.value }));

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const required: Array<[keyof ApplyFormState, string]> = [
      ['name', '站点名称'],
      ['url', '站点地址'],
      ['avatar', '头像地址'],
      ['description', '站点简介'],
    ];
    const missing = required.filter(([key]) => !form[key].trim()).map(([, label]) => label);
    if (missing.length > 0) {
      setError(`请先填写：${missing.join('、')}`);
      return;
    }
    if (!/^https?:\/\/\S+$/i.test(form.url.trim()) || !/^https?:\/\/\S+$/i.test(form.avatar.trim())) {
      setError('站点地址与头像地址都要写成完整的 http/https 链接');
      return;
    }
    if (confirmed.some((checked) => !checked)) {
      setError(`${FRIEND_ISSUE_CONFIRMATIONS.length} 项确认都要勾选`);
      return;
    }
    setError('');
    window.open(
      buildFriendIssueUrl({ repoUrl: siteConfig.friendsPage.repoUrl, input: form }),
      '_blank',
      'noopener,noreferrer',
    );
  };

  return (
    <div aria-labelledby="friend-apply-form">
      <h3 id="friend-apply-form" className="text-[15px] font-semibold text-content">
        填好资料，一键带到 Issue
      </h3>
      <form className="mt-5 space-y-4" onSubmit={handleSubmit}>
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className={APPLY_FIELD_CLASS} htmlFor="friend-apply-name">
              站点名称
            </label>
            <input
              id="friend-apply-name"
              className="editorial-input"
              value={form.name}
              onChange={updateField('name')}
              maxLength={50}
              placeholder="阿叶的小站"
            />
          </div>
          <div>
            <label className={APPLY_FIELD_CLASS} htmlFor="friend-apply-description">
              站点简介
            </label>
            <input
              id="friend-apply-description"
              className="editorial-input"
              value={form.description}
              onChange={updateField('description')}
              maxLength={120}
              placeholder="前端与生活方式记录"
            />
          </div>
          <div>
            <label className={APPLY_FIELD_CLASS} htmlFor="friend-apply-url">
              站点地址
            </label>
            <input
              id="friend-apply-url"
              className="editorial-input"
              value={form.url}
              onChange={updateField('url')}
              maxLength={500}
              placeholder="https://ayee.example.com"
            />
          </div>
          <div>
            <label className={APPLY_FIELD_CLASS} htmlFor="friend-apply-avatar">
              头像地址
            </label>
            <input
              id="friend-apply-avatar"
              className="editorial-input"
              value={form.avatar}
              onChange={updateField('avatar')}
              maxLength={500}
              placeholder="https://ayee.example.com/avatar.png"
            />
          </div>
          <div>
            <label className={APPLY_FIELD_CLASS} htmlFor="friend-apply-backlink">
              反链页面地址（选填，默认查站点首页）
            </label>
            <input
              id="friend-apply-backlink"
              className="editorial-input"
              value={form.backlinkUrl}
              onChange={updateField('backlinkUrl')}
              maxLength={500}
              placeholder="https://ayee.example.com/links"
            />
          </div>
        </div>
        <fieldset className="space-y-2 pt-1">
          <legend className="mb-1.5 text-xs font-semibold text-content-muted">确认事项</legend>
          {FRIEND_ISSUE_CONFIRMATIONS.map((item, index) => (
            <label key={item} className="flex items-start gap-2.5 text-sm leading-relaxed text-content-muted">
              <input
                type="checkbox"
                className="mt-1 h-4 w-4 shrink-0 accent-zinc-900 dark:accent-zinc-100"
                checked={confirmed[index]}
                onChange={(event) =>
                  setConfirmed((previous) =>
                    previous.map((value, position) => (position === index ? event.target.checked : value)),
                  )
                }
              />
              <span>{item}</span>
            </label>
          ))}
        </fieldset>
        {error ? (
          <p role="alert" className="text-sm text-red-600 dark:text-red-400">
            {error}
          </p>
        ) : null}
        <div className="flex flex-wrap items-center gap-4 pt-1">
          <button type="submit" className="editorial-button-primary inline-flex items-center gap-2">
            生成 Issue 申请
            <ArrowRight size={16} />
          </button>
          <a
            href={siteConfig.friendsPage.applyUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-sm text-content-muted underline-offset-4 transition-colors hover:text-content hover:underline"
          >
            改用空白 Issue 表单
          </a>
        </div>
      </form>
    </div>
  );
};

export const Friends = () => {
  const [isExpanded, setIsExpanded] = useState(false);
  const [isDeadExpanded, setIsDeadExpanded] = useState(false);
  const [friends, setFriends] = useState<Friend[]>(initialFriends);
  const [searchQuery, setSearchQuery] = useState('');
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loading, setLoading] = useState(initialFriends.length === 0);
  const [loadAttempt, setLoadAttempt] = useState(0);
  const shouldReduceMotion = useReducedMotion();

  useEffect(() => {
    let cancelled = false;
    // 首次加载数据已由 eager glob 同步提供，首帧直接用内联数据渲染（与 SSR 水合一致，
    // 避免顺序闪动导致水合冲突）；水合后再异步取一次打乱后的顺序（getFriends 会话内
    // 只打乱一次），实现「每次刷新随机排序」。仅“重新加载”（loadAttempt > 0）或
    // 初始数据缺失时才走带 loading 态的完整异步重取。
    if (loadAttempt === 0 && initialFriends.length > 0) {
      setLoading(false);
      getFriends()
        .then((data) => {
          if (!cancelled) setFriends(data);
        })
        .catch(() => {
          // 打乱失败不影响展示：保留内联的原始顺序。
        });
      return () => {
        cancelled = true;
      };
    }
    setLoading(true);
    getFriends()
      .then((data) => {
        if (cancelled) return;
        setFriends(data);
        setLoadError(null);
      })
      .catch((error) => {
        if (cancelled) return;
        console.error('友链数据加载失败:', error);
        setLoadError('友链数据加载失败，请稍后刷新重试。');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [loadAttempt]);

  const siteInfo = {
    name: siteConfig.title,
    description: siteConfig.description,
    url: siteConfig.url,
    // 展示位与「LOGO：」复制文本共用同一个值，必须是绝对地址 —— 申请人要把它挂到自己站上，
    // 站内相对路径（/logo.png）对他们没有任何意义。
    avatar: absoluteSiteUrl(siteConfig.logo, siteConfig.url),
  };

  // 域名解析结果预计算（new URL 解析与 hosts 剥离）：搜索过滤每次击键不再对
  // 全部友链重复解析 URL。
  const friendDomains = useMemo(() => {
    const map = new Map<string, string>();
    for (const friend of friends) {
      map.set(friend.name, getFriendDomain(friend.url).toLowerCase());
    }
    return map;
  }, [friends]);

  const filteredFriends = useMemo(() => {
    // toLowerCase（非 toLocaleLowerCase）：土耳其语等 locale 下 'I' 会变成
    // 点无点 'ı'，导致含 I 的站点名/域名搜索失配。
    const keyword = searchQuery.trim().toLowerCase();
    if (!keyword) {
      return friends;
    }

    return friends.filter((friend) => {
      const domain = friendDomains.get(friend.name) ?? '';
      return [friend.name, friend.description, domain].some((value) => value.toLowerCase().includes(keyword));
    });
  }, [friendDomains, friends, searchQuery]);

  // 已失联友链（friend.unavailable === true，由失联巡检写入）与正常友链分开渲染：
  // 正常友链留在主列表，失联友链全部归入下方「已失联的博客」折叠板块。
  const activeFriends = useMemo(
    () => filteredFriends.filter((friend) => friend.unavailable !== true),
    [filteredFriends],
  );
  const unavailableFriends = useMemo(
    () => filteredFriends.filter((friend) => friend.unavailable === true),
    [filteredFriends],
  );

  // 随机池取全部可访问友链，不受搜索框内容影响：「随机前往」是逛站入口，
  // 用户在筛选时点它也应从整站友链里抽，而不是只在当前匹配项里抽；失联站点不去。
  const reachableFriends = useMemo(() => friends.filter((friend) => friend.unavailable !== true), [friends]);

  const handleRandomGo = () => {
    if (reachableFriends.length === 0) return;
    const pick = reachableFriends[Math.floor(Math.random() * reachableFriends.length)];
    window.open(pick.url, '_blank', 'noopener,noreferrer');
  };

  // 友链页结构化数据：站点级 schema + CollectionPage + ItemList（枚举全部有效友链，
  // 帮助爬虫理解友链集合）+ BreadcrumbList。SSG 静态页已标记 schemaFromSeo，不重复注入。
  const friendsPageDescription =
    '跑路的duck 友情链接汇集优秀技术博客与趣味网站，欢迎提交友链申请，一起分享交流与成长。';
  const friendsStructuredData = [
    ...buildSiteSchemas(friendsPageDescription),
    {
      '@context': 'https://schema.org',
      '@type': 'CollectionPage',
      name: `友链 | ${siteConfig.title}`,
      description: friendsPageDescription,
      url: absoluteSiteUrl('/friends', siteConfig.url),
      inLanguage: 'zh-CN',
      isPartOf: {
        '@type': 'WebSite',
        name: siteConfig.title,
        url: absoluteSiteUrl('/', siteConfig.url),
      },
    },
    {
      '@context': 'https://schema.org',
      '@type': 'ItemList',
      name: '友情链接',
      url: absoluteSiteUrl('/friends', siteConfig.url),
      itemListElement: friends
        .filter((friend) => friend.unavailable !== true)
        .map((friend, index) => ({
          '@type': 'ListItem',
          position: index + 1,
          name: friend.name,
          url: friend.url,
        })),
    },
    {
      '@context': 'https://schema.org',
      '@type': 'BreadcrumbList',
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: '首页', item: absoluteSiteUrl('/', siteConfig.url) },
        { '@type': 'ListItem', position: 2, name: '友链', item: absoluteSiteUrl('/friends', siteConfig.url) },
      ],
    },
  ];

  return (
    <div className="pb-12 pt-8 md:pb-20 md:pt-12">
      <Seo title="友链" description={friendsPageDescription} structuredData={friendsStructuredData} />

      <header className="mb-6 rounded-overlay bg-surface p-5 md:mb-8 md:p-7">
        <div className="flex items-center justify-between gap-4">
          <h1 className="font-serif text-4xl font-bold tracking-tight text-content md:text-5xl">友情链接</h1>
          <button
            type="button"
            onClick={handleRandomGo}
            disabled={reachableFriends.length === 0}
            className="inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-control px-3 text-sm font-medium text-content-muted transition-colors hover:bg-surface-muted hover:text-content disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Shuffle size={15} aria-hidden="true" />
            随机前往
          </button>
        </div>
        <p className="mt-4 max-w-2xl text-sm leading-relaxed text-content-muted md:text-base">
          这里汇集了一些优秀的技术博客和有趣的网站。如果你也想交换友链，可以在下方填好资料，一键带到 GitHub Issue。
        </p>
        <p className="mt-3 text-xs text-content-muted">以下排名不分先后，每次刷新都会随机排序</p>
      </header>

      <div className="mb-6 overflow-hidden rounded-overlay bg-surface md:mb-8">
        <button
          type="button"
          onClick={() => setIsExpanded(!isExpanded)}
          className="flex w-full items-center justify-between gap-4 p-5 text-left transition-colors hover:bg-surface-muted"
          aria-expanded={isExpanded}
          aria-controls="friend-link-panel"
        >
          <div className="min-w-0 flex-1">
            <span className="text-[15px] font-semibold text-content">申请友链</span>
            <p className="mt-0.5 text-sm leading-relaxed text-content-muted">
              查看本站友链信息，填好资料后一键提交 GitHub Issue
            </p>
          </div>
          <motion.div
            animate={{ rotate: isExpanded ? 180 : 0 }}
            transition={shouldReduceMotion ? { duration: 0 } : { duration: 0.22, ease: easeOut }}
            className="flex-shrink-0"
          >
            <ChevronDown size={18} className="text-content-muted" />
          </motion.div>
        </button>

        <AnimatePresence initial={false}>
          {isExpanded && (
            <motion.div
              id="friend-link-panel"
              key="friend-link-content"
              initial={shouldReduceMotion ? false : { height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={shouldReduceMotion ? undefined : { height: 0, opacity: 0 }}
              transition={shouldReduceMotion ? { duration: 0 } : { duration: 0.28, ease: easeOut }}
              className="overflow-hidden"
            >
              <div className="space-y-4 px-5 pb-5 pt-4">
                <motion.div
                  initial={shouldReduceMotion ? false : { opacity: 0 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={shouldReduceMotion ? undefined : { opacity: 0 }}
                >
                  <section
                    aria-labelledby="friend-link-site-info"
                    className="rounded-overlay bg-surface-muted p-4 md:p-5"
                  >
                    <h2 id="friend-link-site-info" className="text-xs font-semibold text-content-muted">
                      本站友链信息
                    </h2>
                    <div className="mt-4 flex flex-col items-start gap-4 sm:flex-row sm:items-center">
                      <ProgressiveImage
                        src={siteInfo.avatar}
                        alt={siteInfo.name}
                        wrapperClassName="h-12 w-12 flex-shrink-0 overflow-hidden rounded-full bg-surface ring-1 ring-line"
                        className="h-12 w-12 object-cover object-center"
                      />
                      <div className="w-full min-w-0 flex-1 space-y-1">
                        <div className="text-[15px] font-medium text-content">{siteInfo.name}</div>
                        <p className="text-sm leading-relaxed text-content-muted">{siteInfo.description}</p>
                        <div className="select-all break-all pt-0.5 font-mono text-xs leading-relaxed text-content-muted">
                          链接：{siteInfo.url}
                        </div>
                        <div className="select-all break-all font-mono text-xs leading-relaxed text-content-muted">
                          LOGO：{siteInfo.avatar}
                        </div>
                      </div>
                    </div>
                    <a
                      href={siteConfig.friendsPage.repoFriendsUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="mt-2 inline-flex min-h-11 items-center text-sm text-content-muted transition-colors hover:text-content"
                    >
                      查看友链目录
                    </a>
                  </section>
                </motion.div>
                <motion.div
                  initial={shouldReduceMotion ? false : { opacity: 0 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={shouldReduceMotion ? undefined : { opacity: 0 }}
                  className="rounded-overlay bg-surface-muted p-4 md:p-5"
                >
                  <FriendApplyForm />
                </motion.div>
                <motion.div
                  initial={shouldReduceMotion ? false : { opacity: 0 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={shouldReduceMotion ? undefined : { opacity: 0 }}
                >
                  <aside className="rounded-overlay bg-amber-500/10 p-4 text-sm leading-relaxed text-amber-900 md:p-5 dark:text-amber-100">
                    <p className="flex items-start gap-2">
                      <Mail
                        size={16}
                        className="mt-0.5 shrink-0 text-amber-600 dark:text-amber-400"
                        aria-hidden="true"
                      />
                      <span>
                        如果有修改友链信息的需求，请联系邮箱{' '}
                        <a
                          href={`mailto:${FRIEND_EDIT_CONTACT_EMAIL}`}
                          className="break-words underline decoration-amber-400/70 underline-offset-2 transition-colors hover:text-amber-950 dark:hover:text-white"
                        >
                          {FRIEND_EDIT_CONTACT_EMAIL}
                        </a>
                      </span>
                    </p>
                  </aside>
                </motion.div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <div className="mb-6 rounded-overlay bg-surface p-4 md:mb-8">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <SearchField
            value={searchQuery}
            onValueChange={setSearchQuery}
            onClear={() => setSearchQuery('')}
            clearLabel="清除友链搜索"
            placeholder="按站点名称、简介或域名搜索友链..."
            aria-label="搜索友链"
            containerClassName="w-full sm:max-w-sm"
          />
          {searchQuery && <p className="text-sm text-content-muted">找到 {filteredFriends.length} 个匹配站点</p>}
        </div>
      </div>

      {loadError && !loading && (
        <ContentStatus
          variant="error"
          title="友链加载失败"
          description={loadError}
          actionLabel="重新加载"
          onAction={() => setLoadAttempt((attempt) => attempt + 1)}
          className="mb-6"
        />
      )}

      <ul className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3" aria-busy={loading}>
        {!loading &&
          !loadError &&
          activeFriends.map((friend) => (
            <li key={`${friend.url}-${friend.name}`} className="h-full">
              <FriendEntry friend={friend} />
            </li>
          ))}

        {loading && (
          <li className="col-span-full rounded-overlay bg-surface p-5">
            <LoadingStatus label="正在加载友情链接" />
          </li>
        )}
        {loading &&
          Array.from({ length: 3 }).map((_, index) => (
            <li key={`skeleton-${index}`} aria-hidden="true" className="h-32 rounded-overlay bg-surface p-4">
              <div className="flex items-start gap-4">
                <div className="h-12 w-12 shrink-0 animate-pulse rounded-full bg-surface-muted" />
                <div className="flex-1 space-y-3">
                  <div className="h-4 w-1/3 animate-pulse bg-surface-muted" />
                  <div className="h-3 w-full animate-pulse bg-surface-muted" />
                  <div className="h-3 w-2/3 animate-pulse bg-surface-muted" />
                </div>
              </div>
            </li>
          ))}

        {!loading && !loadError && filteredFriends.length > 0 && activeFriends.length === 0 && (
          <li className="col-span-full rounded-overlay bg-surface p-8 text-center text-sm text-red-500/90 dark:text-red-400/90">
            匹配的友链均位于下方「已失联的博客」板块中。
          </li>
        )}

        {!loading && !loadError && filteredFriends.length === 0 && (
          <li className="col-span-full rounded-overlay bg-surface p-8 text-center text-sm text-content-muted">
            没有找到匹配的友链，试试更短的关键词。
          </li>
        )}
      </ul>

      {/* 已失联的博客：失联状态由友链失联巡检每日写入 friends/*.json（探测不可达即置
          unavailable: true，恢复后自动移回上方板块），Pages CMS 的手动勾选会被覆写。 */}
      <div className="mt-8 overflow-hidden rounded-overlay bg-surface md:mt-10">
        <button
          type="button"
          onClick={() => setIsDeadExpanded(!isDeadExpanded)}
          className="flex w-full items-center justify-between gap-4 p-5 text-left transition-colors hover:bg-surface-muted"
          aria-expanded={isDeadExpanded}
          aria-controls="dead-friend-link-panel"
        >
          <div className="min-w-0 flex-1">
            <span className="flex items-center gap-2 text-[15px] font-semibold text-content">
              已失联的博客
              <span
                className={`text-xs font-medium tabular-nums ${
                  unavailableFriends.length > 0
                    ? 'text-red-500/90 dark:text-red-400/90'
                    : 'text-zinc-400 dark:text-zinc-500'
                }`}
              >
                {unavailableFriends.length}
              </span>
            </span>
            <p className="mt-0.5 text-sm leading-relaxed text-content-muted">
              以下友链暂时无法正常访问，站点恢复后会自动移回上方列表
            </p>
          </div>
          <motion.div
            animate={{ rotate: isDeadExpanded ? 180 : 0 }}
            transition={shouldReduceMotion ? { duration: 0 } : { duration: 0.22, ease: easeOut }}
            className="flex-shrink-0"
          >
            <ChevronDown size={18} className="text-content-muted" />
          </motion.div>
        </button>

        <AnimatePresence initial={false}>
          {isDeadExpanded && (
            <motion.div
              id="dead-friend-link-panel"
              key="dead-friend-link-content"
              initial={shouldReduceMotion ? false : { height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={shouldReduceMotion ? undefined : { height: 0, opacity: 0 }}
              transition={shouldReduceMotion ? { duration: 0 } : { duration: 0.28, ease: easeOut }}
              className="overflow-hidden"
            >
              <div className="px-5 pb-5 pt-4">
                {unavailableFriends.length > 0 ? (
                  <ul className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
                    {unavailableFriends.map((friend) => (
                      <li key={`${friend.url}-${friend.name}`} className="h-full">
                        <FriendEntry friend={friend} unavailable />
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-sm leading-relaxed text-content-muted">
                    目前没有失联的友链，所有友链均可正常访问 🎉
                  </p>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <p className="mt-6 rounded-overlay bg-surface p-5 text-sm text-content-muted">
        如果有任何疑问，请联系邮箱{' '}
        <a
          href={siteConfig.social.email}
          className="font-medium text-content underline decoration-line underline-offset-2 transition-colors hover:decoration-content"
        >
          {siteConfig.social.rawEmail}
        </a>
      </p>
    </div>
  );
};
