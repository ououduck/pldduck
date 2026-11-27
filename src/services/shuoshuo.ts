/**
 * 说说数据层：构建期 shuoshuo.json 经 eager glob 内联，
 * SSR 阶段同步读取说说列表（已按日期倒序）。
 *
 * 数据源是仓库内的 shuoshuo/*.md（Pages CMS「说说」集合），与文章、友链一样属于
 * 构建期静态数据：同样的内容永远产出同样的产物（SSG 与水合结果一致）。
 */
import type { ShuoShuo } from '../types';
import { stripMarkdown } from '../utils/markdownText';

// 构建期 SSG：shuoshuo.json 通过 eager glob 内联进产物，SSR 阶段即可同步渲染说说列表
// （与 posts.ts 的 posts.json / friends.ts 的 friends.json 模式一致）。
// 用 glob 而不是静态 import：本地首次构建前文件可能还不存在，
// 静态 import 会让 dev/test 直接崩在解析阶段。
const generatedShuoShuoModules = import.meta.glob<ShuoShuo[]>('../../generated/shuoshuo.json', {
  eager: true,
  import: 'default',
});
const initialShuoShuo = Object.values(generatedShuoShuoModules)[0] ?? [];

/** 同步读取构建期内联的说说列表（SSG / 首帧渲染用），已按日期倒序。 */
export const getInitialShuoShuo = (): ShuoShuo[] => initialShuoShuo;

/** 按 id 取单条（详情页首帧用；找不到返回 undefined）。 */
export const getInitialShuoShuoItem = (id: string): ShuoShuo | undefined =>
  initialShuoShuo.find((item) => item.id === id);

/**
 * 条目的展示标题：取正文第一个非空行（剥离 Markdown 标记后）。
 * 抽成纯函数便于列表页、详情页与 SEO 共用同一口径。
 */
export const getShuoShuoTitle = (entry: ShuoShuo, maxChars = 40): string => {
  const firstLine = stripMarkdown(String(entry.content ?? ''))
    .split('\n')
    .map((line) => line.trim())
    .find((line) => line.length > 0);
  const title = firstLine || entry.date;
  return title.length > maxChars ? `${title.slice(0, maxChars).trimEnd()}…` : title;
};
