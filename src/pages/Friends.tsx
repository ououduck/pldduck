/**
 * 友链页：展示友情链接（失联分组）与友链申请入口（页面填资料 → 预填 GitHub Issue 正文）；
 * 已收录条目的信息修改走站长邮箱，不再单独设计申请流程。
 */

import { useEffect, useMemo, useState } from 'react';
import type { ChangeEvent, FormEvent } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ArrowRight, Sparkles, ChevronDown, Globe2 } from 'lucide-react';
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
import { Surface } from '@/components/ui/Surface';
import { easeOut } from '@/utils/motion';

const getFriendDomain = (url: string) => {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
};

interface FriendCardProps {
  friend: Friend;
  /** 已失联样式：头像右下角红色闪烁小点 + 「已失联」角标 + 弱化边框。 */
  unavailable?: boolean;
}

/**
 * 友链卡片：正常友链与已失联友链共用同一布局，保证两板块视觉一致。
 * 已失联状态由站长在 Pages CMS「友链」集合中手动勾选「已失联」，在 friends/*.json
 * 中写入 `"unavailable": true` 标记；未配置（缺失/false）默认视为正常。
 */
const FriendCard = ({ friend, unavailable = false }: FriendCardProps) => {
  return (
    <a
      href={friend.url}
      target="_blank"
      rel="noopener noreferrer"
      className={`group relative block h-full rounded-surface border bg-paper p-5 transition-colors duration-150 hover:border-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zinc-900 dark:bg-zinc-900 dark:focus-visible:outline-zinc-100 ${
        unavailable
          ? 'border-red-300/70 opacity-80 dark:border-red-900/60 dark:hover:border-red-500'
          : 'border-zinc-300 hover:border-ink dark:border-zinc-700 dark:hover:border-white dark:focus-visible:border-white'
      }`}
    >
      {unavailable && (
        <span className="absolute left-0 top-0 z-10 rounded-br-lg border-b border-r border-red-300/70 bg-red-50 px-2 py-1 text-[11px] font-semibold text-red-600 dark:border-red-900/60 dark:bg-red-950/60 dark:text-red-400">
          已失联
        </span>
      )}
      <div className="flex items-start gap-4 pr-5">
        <div className="relative h-14 w-14 flex-shrink-0">
          <div className="h-14 w-14 overflow-hidden rounded-full border border-zinc-300 bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-900">
            <ProgressiveImage
              src={friend.avatar}
              alt={friend.name}
              wrapperClassName="h-full w-full"
              className="h-full w-full object-cover object-center"
              effect="fade"
            />
          </div>
          {unavailable && (
            <span
              aria-hidden="true"
              className="friend-dead-dot absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-paper bg-red-500 dark:border-zinc-900"
            />
          )}
        </div>
        <div className="min-w-0 flex-1">
          <h2
            className={`mb-1 truncate text-lg font-bold transition-colors group-hover:text-zinc-700 dark:group-hover:text-zinc-300 ${
              unavailable ? 'text-zinc-700 dark:text-zinc-300' : 'text-zinc-900 dark:text-zinc-100'
            }`}
          >
            {friend.name}
          </h2>
          <p className="line-clamp-2 text-sm leading-relaxed text-zinc-600 dark:text-zinc-400">{friend.description}</p>
          <div
            className={`mt-3 inline-flex max-w-full items-center gap-1.5 border-b py-1 text-xs font-medium ${
              unavailable
                ? 'border-red-300/60 text-red-500/90 dark:border-red-900/50 dark:text-red-400/90'
                : 'border-zinc-300 text-zinc-500 dark:border-zinc-700 dark:text-zinc-400'
            }`}
          >
            <Globe2 size={12} />
            <span className="truncate">{getFriendDomain(friend.url)}</span>
          </div>
        </div>
      </div>
    </a>
  );
};

// 构建期 SSG：friends.json 已通过 eager glob 内联，SSR 阶段即可同步渲染友链列表，
// 客户端水合首帧与 SSR 输出一致；异步重取仅用于“重新加载”。
const initialFriends = getInitialFriends();

/** 已收录条目的信息修改联系邮箱：不接 Issue 流程，也不为此新增配置键。 */
const FRIEND_EDIT_CONTACT_EMAIL = 'pldduck@outlook.com';

const APPLY_FIELD_CLASS = 'mb-1.5 block text-xs font-semibold text-zinc-700 dark:text-zinc-300';

interface ApplyFormState {
  name: string;
  url: string;
  backlinkUrl: string;
  avatar: string;
  description: string;
  applicationType: string;
}

const EMPTY_APPLY_FORM: ApplyFormState = {
  name: '',
  url: '',
  backlinkUrl: '',
  avatar: '',
  description: '',
  applicationType: '新增',
};

/**
 * 申请资料填写卡：填完直接把正文预填进 GitHub 新建 Issue 页。
 * 页面自身不发请求、不落数据，采集面仍然是 Issue（正文格式与模板渲染结果同构，
 * 由 src/utils/friendIssue.test.ts 用机器人的解析器做往返校验）。
 */
const FriendApplyForm = () => {
  const [form, setForm] = useState<ApplyFormState>(EMPTY_APPLY_FORM);
  const [confirmed, setConfirmed] = useState<boolean[]>([false, false]);
  const [error, setError] = useState('');

  const updateField = (key: keyof ApplyFormState) => (event: ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
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
      setError('两项确认都要勾选');
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
    <Surface variant="card" className="p-4 sm:p-5" aria-labelledby="friend-apply-form">
      <h3 id="friend-apply-form" className="text-base font-semibold text-zinc-900 dark:text-zinc-100">
        填好资料，一键带到 Issue
      </h3>
      <p className="mt-2 text-sm leading-relaxed text-zinc-600 dark:text-zinc-400">
        先在本站把资料填好，点「生成 Issue 申请」会打开 GitHub 的新建 Issue 页面，正文已经写好，确认无误后提交即可。
        挂链要用服务端直出的 <code className="font-mono text-xs">&lt;a href&gt;</code>（JS
        渲染的挂件检测不到）；机器人会先确认站点与头像在境外可以访问（开启禁海外会被自动驳回），再检测反链作为审核参考，
        是否收录由站长确认。
      </p>
      <form className="mt-4 space-y-3" onSubmit={handleSubmit}>
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
          <div>
            <label className={APPLY_FIELD_CLASS} htmlFor="friend-apply-type">
              申请类型
            </label>
            <select
              id="friend-apply-type"
              className="editorial-input"
              value={form.applicationType}
              onChange={updateField('applicationType')}
            >
              <option value="新增">新增</option>
              <option value="下架">下架</option>
            </select>
          </div>
        </div>
        <fieldset className="space-y-2 pt-1">
          <legend className="mb-1.5 text-xs font-semibold text-zinc-700 dark:text-zinc-300">确认事项</legend>
          {FRIEND_ISSUE_CONFIRMATIONS.map((item, index) => (
            <label
              key={item}
              className="flex items-start gap-2.5 text-sm leading-relaxed text-zinc-600 dark:text-zinc-400"
            >
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
            className="text-sm text-zinc-500 underline-offset-4 hover:underline dark:text-zinc-400"
          >
            改用空白 Issue 表单
          </a>
        </div>
      </form>
    </Surface>
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

  // 已失联友链（friend.unavailable === true，由站长在 Pages CMS 手动标记）与正常友链分开渲染：
  // 正常友链留在主列表，失联友链全部归入下方「已失联的博客」折叠板块。
  const activeFriends = useMemo(
    () => filteredFriends.filter((friend) => friend.unavailable !== true),
    [filteredFriends],
  );
  const unavailableFriends = useMemo(
    () => filteredFriends.filter((friend) => friend.unavailable === true),
    [filteredFriends],
  );

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

      <header className="mb-12 border-b border-zinc-200 pb-8 dark:border-zinc-800 md:pb-10">
        <p className="mb-3 text-xs font-semibold uppercase tracking-[0.2em] text-zinc-500 dark:text-zinc-400">
          Friends Directory
        </p>
        <h1 className="text-4xl font-bold tracking-tight text-zinc-900 dark:text-zinc-100 md:text-5xl">友情链接</h1>
        <p className="mt-4 max-w-2xl text-zinc-600 dark:text-zinc-400">
          这里汇集了一些优秀的技术博客和有趣的网站。如果你也想交换友链，可以在下方填好资料，一键带到 GitHub Issue。
        </p>
        <p className="mt-4 flex items-center gap-2 text-sm text-zinc-500 dark:text-zinc-400">
          <Sparkles size={14} />
          以下排名不分先后，每次刷新都会随机排序
        </p>
      </header>

      <div className="mb-12 border-y border-zinc-200 dark:border-zinc-800">
        <button
          type="button"
          onClick={() => setIsExpanded(!isExpanded)}
          className="flex w-full items-center justify-between gap-4 py-4 text-left transition-colors hover:text-zinc-700 dark:hover:text-zinc-300"
          aria-expanded={isExpanded}
          aria-controls="friend-link-panel"
        >
          <div className="min-w-0 flex-1">
            <span className="text-base font-semibold text-zinc-950 dark:text-white">申请友链</span>
            <p className="mt-1 text-sm leading-relaxed text-zinc-700 dark:text-zinc-300">
              查看本站友链信息，填好资料后一键提交 GitHub Issue
            </p>
          </div>
          <motion.div
            animate={{ rotate: isExpanded ? 180 : 0 }}
            transition={shouldReduceMotion ? { duration: 0 } : { duration: 0.22, ease: easeOut }}
            className="flex-shrink-0"
          >
            <ChevronDown size={18} className="text-zinc-500 dark:text-zinc-400" />
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
              <div className="border-t border-zinc-200 pb-5 pt-5 dark:border-zinc-800 sm:pb-6 sm:pt-6">
                <div className="space-y-6">
                  <motion.div
                    initial={shouldReduceMotion ? false : { opacity: 0 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={shouldReduceMotion ? undefined : { opacity: 0 }}
                  >
                    <Surface variant="card" className="p-4 sm:p-5" aria-labelledby="friend-link-site-info">
                      <h2
                        id="friend-link-site-info"
                        className="mb-4 text-base font-semibold text-zinc-900 dark:text-zinc-100"
                      >
                        本站友链信息
                      </h2>
                      <div className="flex flex-col items-start gap-4 sm:flex-row sm:items-center">
                        <ProgressiveImage
                          src={siteInfo.avatar}
                          alt={siteInfo.name}
                          wrapperClassName="h-14 w-14 flex-shrink-0 overflow-hidden rounded-full border border-zinc-300 bg-paper dark:border-zinc-700 dark:bg-void"
                          className="h-14 w-14 object-cover object-center"
                        />
                        <div className="w-full flex-1 space-y-1">
                          <div className="font-semibold text-zinc-900 dark:text-zinc-100">{siteInfo.name}</div>
                          <div className="text-sm leading-relaxed text-zinc-600 dark:text-zinc-400">
                            {siteInfo.description}
                          </div>
                          <div className="break-all pt-0.5 font-mono text-xs leading-relaxed text-zinc-700 dark:text-zinc-400 select-all">
                            链接：{siteInfo.url}
                          </div>
                          <div className="break-all font-mono text-xs leading-relaxed text-zinc-700 dark:text-zinc-400 select-all">
                            LOGO：{siteInfo.avatar}
                          </div>
                        </div>
                      </div>
                      <div className="mt-5 flex flex-wrap items-center gap-4">
                        <a
                          href={siteConfig.friendsPage.repoFriendsUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-sm text-zinc-500 underline-offset-4 hover:underline dark:text-zinc-400"
                        >
                          查看友链目录
                        </a>
                      </div>
                    </Surface>
                  </motion.div>
                  <motion.div
                    initial={shouldReduceMotion ? false : { opacity: 0 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={shouldReduceMotion ? undefined : { opacity: 0 }}
                  >
                    <FriendApplyForm />
                  </motion.div>
                  <motion.div
                    initial={shouldReduceMotion ? false : { opacity: 0 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={shouldReduceMotion ? undefined : { opacity: 0 }}
                  >
                    <Surface variant="card" className="p-4 sm:p-5">
                      <p className="text-sm leading-relaxed text-zinc-600 dark:text-zinc-400">
                        如果有修改友链信息的需求，请联系邮箱{' '}
                        <a
                          href={`mailto:${FRIEND_EDIT_CONTACT_EMAIL}`}
                          className="font-medium text-zinc-700 underline decoration-zinc-300 underline-offset-2 transition-colors hover:text-zinc-950 hover:decoration-zinc-500 dark:text-zinc-300 dark:decoration-zinc-700 dark:hover:text-white dark:hover:decoration-zinc-400"
                        >
                          {FRIEND_EDIT_CONTACT_EMAIL}
                        </a>
                      </p>
                    </Surface>
                  </motion.div>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <div className="mb-8 border-y border-zinc-200 py-4 dark:border-zinc-800">
        <SearchField
          value={searchQuery}
          onValueChange={setSearchQuery}
          onClear={() => setSearchQuery('')}
          clearLabel="清除友链搜索"
          placeholder="按站点名称、简介或域名搜索友链..."
          aria-label="搜索友链"
        />
        {searchQuery && (
          <p className="mt-3 text-sm text-zinc-600 dark:text-zinc-400">找到 {filteredFriends.length} 个匹配站点</p>
        )}
      </div>

      {loadError && !loading && (
        <ContentStatus
          variant="error"
          title="友链加载失败"
          description={loadError}
          actionLabel="重新加载"
          onAction={() => setLoadAttempt((attempt) => attempt + 1)}
          className="mb-8"
        />
      )}

      <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3" aria-busy={loading}>
        {!loading &&
          !loadError &&
          activeFriends.length > 0 &&
          activeFriends.map((friend) => <FriendCard key={`${friend.url}-${friend.name}`} friend={friend} />)}

        {loading && <LoadingStatus label="正在加载友情链接" className="col-span-full" />}
        {loading &&
          Array.from({ length: 3 }).map((_, index) => (
            <div
              key={`skeleton-${index}`}
              aria-hidden="true"
              className="animate-pulse rounded-surface border border-zinc-200 bg-paper p-5 dark:border-zinc-800 dark:bg-zinc-900"
            >
              <div className="flex items-start gap-4">
                <div className="h-14 w-14 flex-shrink-0 rounded-full bg-zinc-100 dark:bg-zinc-800" />
                <div className="flex-1 space-y-3">
                  <div className="h-5 w-1/3 bg-zinc-100 dark:bg-zinc-800" />
                  <div className="h-4 w-full bg-zinc-100 dark:bg-zinc-800" />
                  <div className="h-4 w-2/3 bg-zinc-100 dark:bg-zinc-800" />
                </div>
              </div>
            </div>
          ))}

        {!loading && !loadError && filteredFriends.length > 0 && activeFriends.length === 0 && (
          <div className="col-span-full border-y border-dashed border-red-300 py-10 text-center text-sm text-zinc-500 dark:border-red-900/50 dark:text-zinc-400">
            匹配的友链均位于下方「已失联的博客」板块中。
          </div>
        )}

        {!loading && !loadError && filteredFriends.length === 0 && (
          <div className="col-span-full border-y border-dashed border-zinc-300 py-10 text-center text-sm text-zinc-500 dark:border-zinc-700 dark:text-zinc-400">
            没有找到匹配的友链，试试更短的关键词。
          </div>
        )}
      </div>

      {/* 已失联的博客：失联状态由站长在 Pages CMS「友链」集合中手动标记（勾选「已失联」），
          随 friends/*.json 更新并在此处体现。 */}
      <div className="mb-3 border-y border-zinc-200 dark:border-zinc-800">
        <button
          type="button"
          onClick={() => setIsDeadExpanded(!isDeadExpanded)}
          className="flex w-full items-center justify-between gap-4 py-4 text-left transition-colors hover:text-zinc-700 dark:hover:text-zinc-300"
          aria-expanded={isDeadExpanded}
          aria-controls="dead-friend-link-panel"
        >
          <div className="min-w-0 flex-1">
            <span className="flex items-center gap-2 text-base font-semibold text-zinc-950 dark:text-white">
              已失联的博客
              <span
                className={`inline-flex h-5 min-w-5 items-center justify-center rounded-full px-1.5 text-xs font-bold ${
                  unavailableFriends.length > 0
                    ? 'bg-red-100 text-red-600 dark:bg-red-950/70 dark:text-red-400'
                    : 'bg-zinc-100 text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400'
                }`}
              >
                {unavailableFriends.length}
              </span>
            </span>
            <p className="mt-1 text-sm leading-relaxed text-zinc-700 dark:text-zinc-300">
              以下友链暂时无法正常访问，站点恢复后会自动移回上方列表
            </p>
          </div>
          <motion.div
            animate={{ rotate: isDeadExpanded ? 180 : 0 }}
            transition={shouldReduceMotion ? { duration: 0 } : { duration: 0.22, ease: easeOut }}
            className="flex-shrink-0"
          >
            <ChevronDown size={18} className="text-zinc-500 dark:text-zinc-400" />
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
              <div className="border-t border-zinc-200 pb-5 pt-5 dark:border-zinc-800 sm:pb-6 sm:pt-6">
                {unavailableFriends.length > 0 ? (
                  <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
                    {unavailableFriends.map((friend) => (
                      <FriendCard key={`${friend.url}-${friend.name}`} friend={friend} unavailable />
                    ))}
                  </div>
                ) : (
                  <p className="text-sm leading-relaxed text-zinc-600 dark:text-zinc-400">
                    目前没有失联的友链，所有友链均可正常访问 🎉
                  </p>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <p className="mb-12 text-sm text-zinc-500 dark:text-zinc-400">
        如果有任何疑问，请联系邮箱{' '}
        <a
          href={siteConfig.social.email}
          className="font-medium text-zinc-700 underline decoration-zinc-300 underline-offset-2 transition-colors hover:text-zinc-950 hover:decoration-zinc-500 dark:text-zinc-300 dark:decoration-zinc-700 dark:hover:text-white dark:hover:decoration-zinc-400"
        >
          {siteConfig.social.rawEmail}
        </a>
      </p>
    </div>
  );
};
