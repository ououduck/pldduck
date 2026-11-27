// @vitest-environment node
/**
 * 「一条内容 = 一个 Discussion」纯函数层（2026-11 评论通知改造）。
 *
 * 背景：GitHub 邮件通知是 Discussion 级的 —— 谁在某条 discussion 里留过言就收它
 * 全部后续评论，没有 per-reply 订阅。留言板与说说因此改成每个内容一条 discussion。
 */
import { describe, it, expect } from 'vitest';
import {
  buildDiscussionExcerpt,
  buildDiscussionMetaDescription,
  buildNewDiscussionUrl,
  deriveDiscussionTitle,
  discussionPath,
  extractDiscussionImages,
  normalizeDiscussionNode,
  normalizeDiscussionNodes,
  readMigrationByline,
  stripMigrationArtifacts,
} from './discussion-core.mjs';

describe('deriveDiscussionTitle', () => {
  it('取第一段非空文本并剥离 Markdown 标记', () => {
    expect(deriveDiscussionTitle('\n\n## 今天天气不错\n\n后面还有正文')).toBe('今天天气不错');
    expect(deriveDiscussionTitle('**加粗开头** 的一句话')).toBe('加粗开头 的一句话');
    expect(deriveDiscussionTitle('- 列表项开头')).toBe('列表项开头');
    expect(deriveDiscussionTitle('> 引用开头')).toBe('引用开头');
  });
  it('图片单独占一行时跳过图片语法、取后面的文字', () => {
    expect(deriveDiscussionTitle('![封面](https://img.example/a.png)\n真实标题')).toBe('封面\n真实标题'.split('\n')[0]);
  });

  it('超长标题截断并加省略号（不切坏代理对）', () => {
    const title = deriveDiscussionTitle('一'.repeat(100), 10);
    expect([...title]).toHaveLength(11);
    expect(title.endsWith('…')).toBe(true);
    const emoji = deriveDiscussionTitle('😀'.repeat(100), 5);
    expect([...emoji]).toHaveLength(6);
  });

  it('空正文回落为非空标题（GitHub 拒绝空标题）', () => {
    expect(deriveDiscussionTitle('')).toBe('（无标题）');
    expect(deriveDiscussionTitle(undefined)).toBe('（无标题）');
    expect(deriveDiscussionTitle('   \n\n  ')).toBe('（无标题）');
  });
});

describe('normalizeDiscussionNode', () => {
  const node = {
    number: 12,
    title: '第一条说说',
    body: '正文内容',
    createdAt: '2026-11-20T10:00:00Z',
    updatedAt: '2026-11-21T10:00:00Z',
    url: 'https://github.com/o/r/discussions/12',
    author: { login: 'ououduck', avatarUrl: 'https://a/x.png', url: 'https://github.com/ououduck' },
    comments: { totalCount: 3 },
    reactions: { totalCount: 2 },
  };

  it('归一化字段并读取评论/反应数', () => {
    expect(normalizeDiscussionNode(node)).toMatchObject({
      number: 12,
      title: '第一条说说',
      commentCount: 3,
      reactionCount: 2,
      author: { login: 'ououduck' },
    });
  });

  it('缺标题时用正文派生；缺 totalCount 视为 0', () => {
    const result = normalizeDiscussionNode({
      number: 5,
      title: '',
      body: '## 正文当标题',
      createdAt: '2026-01-01T00:00:00Z',
    });
    expect(result).not.toBeNull();
    expect(result?.title).toBe('正文当标题');
    expect(result?.commentCount).toBe(0);
    expect(result?.reactionCount).toBe(0);
  });

  it('编号非法时返回 null（不产出无法路由的条目）', () => {
    expect(normalizeDiscussionNode({ number: 0 })).toBeNull();
    expect(normalizeDiscussionNode({ number: 'abc' })).toBeNull();
    expect(normalizeDiscussionNode(null)).toBeNull();
  });
});

describe('normalizeDiscussionNodes', () => {
  const make = (number: number, createdAt: string, extra: Record<string, unknown> = {}) => ({
    number,
    title: `第 ${number} 条`,
    body: '',
    createdAt,
    comments: { totalCount: 0 },
    reactions: { totalCount: 0 },
    ...extra,
  });

  it('按创建时间倒序（最新在前），时间相同按编号倒序', () => {
    const list = normalizeDiscussionNodes([
      make(1, '2026-11-01T00:00:00Z'),
      make(3, '2026-11-20T00:00:00Z'),
      make(2, '2026-11-20T00:00:00Z'),
    ]);
    expect(list.map((item) => item.number)).toEqual([3, 2, 1]);
  });

  it('过滤 spam 与非法节点，不产出 null', () => {
    const list = normalizeDiscussionNodes([
      make(1, '2026-11-01T00:00:00Z', { isSpam: true }),
      make(2, '2026-11-02T00:00:00Z'),
      null,
    ]);
    expect(list).toHaveLength(1);
    expect(list[0]?.number).toBe(2);
  });

  it('非数组输入返回空数组（GraphQL 结构异常时不崩）', () => {
    expect(normalizeDiscussionNodes(undefined)).toEqual([]);
    expect(normalizeDiscussionNodes(null)).toEqual([]);
  });

  it('带上构建期算好的摘要与图片（列表页不再解析 Markdown）', () => {
    const list = normalizeDiscussionNodes([
      make(1, '2026-11-01T00:00:00Z', { body: '今天很好 ![图](https://img.example/a.png)' }),
    ]);
    expect(list[0]?.images).toEqual(['https://img.example/a.png']);
    expect(list[0]?.excerpt).toBe('今天很好 图');
  });
});

describe('extractDiscussionImages', () => {
  it('只收 http(s) 与站内绝对路径，去重保序', () => {
    expect(
      extractDiscussionImages(
        '![a](https://img.example/1.png) ![b](/posts-img/2.jpg) ![c](https://img.example/1.png) ![d](relative/x.png)',
      ),
    ).toEqual(['https://img.example/1.png', '/posts-img/2.jpg']);
  });

  it('没有图片时返回空数组', () => {
    expect(extractDiscussionImages('纯文字')).toEqual([]);
    expect(extractDiscussionImages(undefined)).toEqual([]);
  });
});

describe('buildDiscussionExcerpt', () => {
  it('压成单行纯文本并截断', () => {
    expect(buildDiscussionExcerpt('# 标题\n\n正文 **加粗**')).toBe('标题 正文 加粗');
    expect(buildDiscussionExcerpt('字'.repeat(200), 10)).toBe(`${'字'.repeat(10)}…`);
  });
});

describe('迁移痕迹的剥离（真实迁移数据里带了 HTML 注释与署名行）', () => {
  const migrated = [
    '<!-- pldduck-migrated:DC_kwDOVDnR6M4BKslE -->',
    '',
    '不负一早上的性能优化',
    '',
    '[跳转PagesSpeed查看结果](https://pagespeed.web.dev/analysis/x)',
    '',
    '![](https://img.pldduck.com/a.png)',
    '',
    '> 由 @ououduck · 原发布于 2026-11-13 的旧说说迁移',
  ].join('\n');

  it('strip 掉迁移标记与署名行，只留真正的内容', () => {
    const stripped = stripMigrationArtifacts(migrated);
    expect(stripped).not.toContain('pldduck-migrated');
    expect(stripped).not.toContain('旧说说迁移');
    expect(stripped.startsWith('不负一早上的性能优化')).toBe(true);
    expect(stripped).toContain('![](https://img.pldduck.com/a.png)');
  });

  it('摘要与标题都不含迁移痕迹（否则会显示成页面上的字面量）', () => {
    expect(buildDiscussionExcerpt(migrated)).not.toContain('pldduck-migrated');
    expect(buildDiscussionExcerpt(migrated)).not.toContain('旧说说迁移');
    // 标题派生同样先剥离，否则会得到「<!-- pldduck-migrated:... -->」这种标题。
    expect(deriveDiscussionTitle(migrated)).toBe('不负一早上的性能优化');
  });

  it('readMigrationByline 取回原作者与原始日期，普通内容返回 null', () => {
    expect(readMigrationByline(migrated)).toEqual({ author: 'ououduck', date: '2026-11-13' });
    expect(readMigrationByline('普通正文，没有署名行')).toBeNull();
    expect(readMigrationByline('')).toBeNull();
  });

  it('迁移列表条目的 excerpt/images 基于剥离后的正文', () => {
    const [item] = normalizeDiscussionNodes([
      { number: 30, title: '不负一早上的性能优化', body: migrated, createdAt: '2026-11-27T15:42:30Z' },
    ]);
    expect(item?.excerpt.startsWith('不负一早上的性能优化')).toBe(true);
    expect(item?.images).toEqual(['https://img.pldduck.com/a.png']);
  });
});

describe('buildDiscussionMetaDescription', () => {
  it('短内容补齐到可接受的描述长度（说说常常只有几个字）', () => {
    const short = buildDiscussionMetaDescription({ excerpt: '恐怖', siteTitle: '跑路的duck', surface: 'shuoshuo' });
    expect(short.length).toBeGreaterThanOrEqual(50);
    expect(short).toContain('恐怖');
    expect(short).toContain('跑路的duck');
    expect(short).toContain('说说');
  });

  it('极短/空摘要也能达标，且不超 160 上限', () => {
    for (const excerpt of ['', '恐', '恐怖']) {
      const text = buildDiscussionMetaDescription({ excerpt, siteTitle: '跑路的duck', surface: 'shuoshuo' });
      expect(text.length, `excerpt=${JSON.stringify(excerpt)}`).toBeGreaterThanOrEqual(50);
      expect(text.length).toBeLessThanOrEqual(160);
    }
    const guest = buildDiscussionMetaDescription({ excerpt: '好', siteTitle: '跑路的duck', surface: 'guestbook' });
    expect(guest.length).toBeGreaterThanOrEqual(50);
    expect(guest).toContain('留言板');
  });

  it('已经足够长的摘要原样使用（不画蛇添足）', () => {
    // 需要 ≥ minChars（50）才会原样输出：12 字 × 5 = 60。
    const long = '这是一段足够长的说说摘要'.repeat(5);
    expect(long.length).toBeGreaterThanOrEqual(50);
    expect(buildDiscussionMetaDescription({ excerpt: long, siteTitle: '跑路的duck', surface: 'shuoshuo' })).toBe(long);
  });

  it('刚好差几个字时仍会补齐（SEO 审计下限口径是 50）', () => {
    const borderline = '这是一段足够长的说说摘要'.repeat(4);
    expect(borderline.length).toBeLessThan(50);
    expect(
      buildDiscussionMetaDescription({ excerpt: borderline, siteTitle: '跑路的duck', surface: 'shuoshuo' }),
    ).not.toBe(borderline);
  });

  it('空摘要只留上下文句子（不产出以破折号/空格开头的描述）', () => {
    const text = buildDiscussionMetaDescription({ excerpt: '', siteTitle: '跑路的duck', surface: 'guestbook' });
    expect(text.startsWith('——')).toBe(false);
    expect(text.startsWith(' ')).toBe(false);
    expect(text).toContain('留言板');
  });

  it('同样输入产出同样描述（SSG 与水合一致，不依赖时钟/随机）', () => {
    const make = () => buildDiscussionMetaDescription({ excerpt: 'x', siteTitle: 's', surface: 'shuoshuo' });
    expect(make()).toBe(make());
  });
});

describe('discussionPath', () => {
  it('生成站内详情路径（数字化，防御非数字输入）', () => {
    expect(discussionPath('shuoshuo', 12)).toBe('/shuoshuo/12');
    expect(discussionPath('guestbook', '7')).toBe('/guestbook/7');
  });
});

describe('buildNewDiscussionUrl', () => {
  it('拼出 GitHub 新建讨论地址，分类按 slug 编码', () => {
    expect(buildNewDiscussionUrl({ repo: 'ououduck/pldduck', categorySlug: '留言板' })).toBe(
      `https://github.com/ououduck/pldduck/discussions/new?category=${encodeURIComponent('留言板')}`,
    );
  });

  it('repo 或分类缺失时抛错（不产出半截 URL）', () => {
    expect(() => buildNewDiscussionUrl({ repo: '', categorySlug: '留言板' })).toThrow(TypeError);
    expect(() => buildNewDiscussionUrl({ repo: 'ououduck', categorySlug: '留言板' })).toThrow(TypeError);
    expect(() => buildNewDiscussionUrl({ repo: 'ououduck/pldduck', categorySlug: '' })).toThrow(TypeError);
  });
});
