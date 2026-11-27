/**
 * 说说 / 留言板数据层：构建期生成的 generated/discussions.json 经 eager glob 内联，
 * SSG 阶段同步可读（首帧直出，爬虫不执行 JS 也能读到列表）。
 *
 * 数据形态是「一条内容 = 一个 Discussion」：列表只展示标题/摘要/图片/评论数，
 * 每条内容的评论仍由 giscus 用 mapping="number" 精确锁定（见 ai-rules/shuoshuo.md）。
 */
import type { DiscussionEntry, DiscussionLists } from '../types';

const EMPTY: DiscussionLists = { shuoshuo: [], guestbook: [] };

// 用 glob 而不是静态 import：构建期 discussions.json 可能不存在（无 token 的本地构建、
// 或抓取失败），静态 import 会让 dev/test 直接崩在解析阶段；glob 拿不到时返回空集，
// 页面按降级态渲染。
const generatedModules = import.meta.glob<DiscussionLists>('../../generated/discussions.json', {
  eager: true,
  import: 'default',
});
const initial: DiscussionLists = Object.values(generatedModules)[0] ?? EMPTY;

export type DiscussionArea = keyof DiscussionLists;

/** 同步读取构建期内联的列表（SSG / 首帧渲染用）。 */
export const getInitialDiscussionList = (area: DiscussionArea): DiscussionEntry[] => initial[area] ?? [];

/** 按编号取单条（详情页首帧用；找不到返回 undefined）。 */
export const getInitialDiscussion = (area: DiscussionArea, number: number): DiscussionEntry | undefined =>
  getInitialDiscussionList(area).find((entry) => entry.number === number);

/**
 * 数据是否可用：false 表示构建期没抓到列表（无 token / API 失败 / 分类未配置），
 * 页面据此显示「暂不可用」而不是空列表 —— 「没有内容」与「拿不到数据」必须区分开。
 * 判据是 glob 有没有命中文件（而不是列表长度）：抓到 0 条是合法的「还没有内容」。
 */
export const hasDiscussionList = (): boolean => Object.keys(generatedModules).length > 0;
