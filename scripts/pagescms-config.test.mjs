// @vitest-environment node
/**
 * PagesCMS（.pages.yml）集合配置回归测试。
 *
 * 背景：新建友链报 `Invalid extension "" for content "friends"`。
 * 根因：原模板 `filename: "{fields.name}.json"` 会把站点名 slugify 后作为文件名，
 * 纯中文站点名（如「垃圾桶」）经 slugify(lower+strict) 得到空串，文件名退化为
 * `.json` 点文件；PagesCMS 的 getFileExtension(".json") 返回空串，与 schema 扩展名
 * "json" 不匹配，服务端在创建/读取/重命名/历史记录时统一抛该错误。posts 的
 * `{fields.id}.md` 模板存在同类隐患（id 填中文同样退化出 ".md" 点文件）。
 *
 * 修复：文件名/URL 标识统一由独立的 ASCII slug 字段生成（friends 的 filename、
 * posts 的 id），模板固定保留扩展名，slug 字段必填且 pattern 限制为
 * `^[A-Za-z0-9_-]+$`。
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import yaml from 'js-yaml';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const pagesConfig = yaml.load(readFileSync(path.join(repoRoot, '.pages.yml'), 'utf8'));

const SLUG_PATTERN = '^[A-Za-z0-9_-]+$';

/** 各集合的「文件名生成字段」约定：模板应引用该字段，且该字段必填 + pattern 校验。 */
const collections = [
  { name: 'friends', filenameTemplate: '{fields.filename}.json', slugField: 'filename' },
  { name: 'posts', filenameTemplate: '{fields.id}.md', slugField: 'id' },
];

describe('PagesCMS 集合：filename 模板与 slug 字段约束（回归：Invalid extension ""）', () => {
  for (const { name, filenameTemplate, slugField } of collections) {
    const collection = pagesConfig.content.find((item) => item.name === name);

    describe(`${name} 集合`, () => {
      it(`filename 模板固定为 ${JSON.stringify(filenameTemplate)}`, () => {
        expect(collection?.filename).toBe(filenameTemplate);
      });

      it(`${slugField} 字段必填且 pattern 限制为 ASCII slug 字符`, () => {
        const field = collection?.fields.find((f) => f.name === slugField);
        expect(field?.type).toBe('string');
        expect(field?.required).toBe(true);
        expect(field?.pattern).toEqual({
          regex: SLUG_PATTERN,
          message: expect.any(String),
        });
      });

      it('filename 模板引用的字段必须存在于 fields 中', () => {
        const names = new Set(collection.fields.map((f) => f.name));
        for (const match of collection.filename.matchAll(/\{fields\.([^}]+)\}/g)) {
          expect(names.has(match[1])).toBe(true);
        }
      });

      it('模板渲染结果始终保留扩展名（纯中文输入也不退化为点文件）', () => {
        // 模拟 PagesCMS generateFilename 的字段替换：{fields.<name>} 取表单值，
        // 中文/非 ASCII 字符在 slugify(lower+strict) 后全部被剥离。
        const slugifyLike = (value) =>
          String(value ?? '')
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, '-')
            .replace(/^-+|-+$/g, '');
        const render = (template, values) =>
          template.replace(/\{(?:fields\.)?([^}]+)\}/g, (_, key) => slugifyLike(values[key] ?? ''));

        // 修复前：slug 字段填中文 → 空串 → ".json"/".md" 点文件（getFileExtension 返回 "" → 报错）。
        expect(render('{fields.name}.json', { name: '垃圾桶' })).toBe('.json');
        expect(render('{fields.id}.md', { id: '我的文章' })).toBe('.md');

        // 修复后：文件名来自 slug 字段，纯中文的其他字段不影响扩展名。
        // 注：posts 的 slug 字段本身就是 id，故只注入 slug 字段与 name。
        const rendered = render(collection.filename, {
          [slugField]: 'my-slug',
          name: '垃圾桶',
        });
        expect(rendered).toBe(`my-slug${filenameTemplate.slice(filenameTemplate.lastIndexOf('.'))}`);
        expect(/\.(json|md)$/.test(rendered)).toBe(true);
      });
    });
  }
});

/**
 * 站点配置字段漂移守护（ai-rules/config.md §2）。
 *
 * PagesCMS 保存配置时按 .pages.yml 声明的字段树重写 JSON：**未声明的键会被静默丢弃**，
 * 表现是「CMS 里没看到这个配置项，保存一次后它就从配置文件消失了」。
 * 因此每份配置文件的每一层对象键（数组元素下钻一层）都必须能在对应集合的字段树里对上名字。
 */
const configCollections = [
  { collection: 'siteConfig', file: 'config/site.config.json' },
  { collection: 'portalConfig', file: 'config/portal.config.json' },
  { collection: 'commentsConfig', file: 'config/comments.config.json' },
];

describe('PagesCMS 站点配置字段与三份配置文件一一对应', () => {
  const findField = (fields, name) => (fields ?? []).find((field) => field.name === name);

  const collectMissing = (value, fields, trail, acc) => {
    for (const [key, child] of Object.entries(value ?? {})) {
      const where = [...trail, key].join('.');
      const field = findField(fields, key);
      if (!field) {
        acc.push(where);
        continue;
      }
      if (child && typeof child === 'object' && !Array.isArray(child)) {
        collectMissing(child, field.fields, [...trail, key], acc);
      } else if (Array.isArray(child) && field.type === 'object' && field.list && field.fields) {
        // 列表项是同构对象（type: object + list: true）：只按每一项的键下钻。
        for (const item of child) {
          if (item && typeof item === 'object') {
            collectMissing(item, field.fields, [...trail, key], acc);
          }
        }
      }
    }
    return acc;
  };

  for (const { collection, file } of configCollections) {
    const json = JSON.parse(readFileSync(path.join(repoRoot, file), 'utf8'));
    const fields = pagesConfig.content.find((item) => item.name === collection)?.fields;

    describe(`${collection}（${file}）`, () => {
      it('字段树存在', () => {
        expect(Array.isArray(fields)).toBe(true);
      });

      it('JSON 的每个键都在 CMS 字段树中声明（否则保存即丢字段）', () => {
        expect(collectMissing(json, fields, [], [])).toEqual([]);
      });
    });
  }

  it('首页入口磁贴的每个字段都可编辑（新增磁贴属性时不能漏声明）', () => {
    const fields = pagesConfig.content.find((item) => item.name === 'portalConfig')?.fields;
    const portalJson = JSON.parse(readFileSync(path.join(repoRoot, 'config/portal.config.json'), 'utf8'));
    const entryFields = new Set((findField(fields, 'entries')?.fields ?? []).map((f) => f.name));
    for (const entry of portalJson.entries ?? []) {
      expect([...Object.keys(entry)].filter((key) => !entryFields.has(key))).toEqual([]);
    }
  });

  it('social.qq 已声明（首页 QQ 一键复制的数据源）', () => {
    const fields = pagesConfig.content.find((item) => item.name === 'siteConfig')?.fields;
    const socialFields = findField(fields, 'social')?.fields ?? [];
    expect(socialFields.some((field) => field.name === 'qq')).toBe(true);
  });

  it('三份配置文件键不重叠（合并时不会出现后者静默覆盖前者）', () => {
    const keySets = configCollections.map(
      ({ file }) => new Set(Object.keys(JSON.parse(readFileSync(path.join(repoRoot, file), 'utf8')))),
    );
    for (let i = 0; i < keySets.length; i += 1) {
      for (let j = i + 1; j < keySets.length; j += 1) {
        expect([...keySets[i]].filter((key) => keySets[j].has(key))).toEqual([]);
      }
    }
  });
});

/**
 * 字段声明合法性守护（回归：CMS「首页内容」里几个板块整块不显示）。
 *
 * Pages CMS 没有 `type: list` 这个字段类型：数组一律写成「字段自身类型 + list: true」
 * （对象列表 = type: object + list: true + fields，字符串列表 = type: string + list: true）。
 * 写成 type: list 时解析不出编辑器组件，字段在 CMS 里直接消失，而 JSON 里的数据还在 ——
 * 表现是「板块不见了」而不是报错，所以只能靠这层静态守护兜住。
 * 同理 `hint` 不是 Pages CMS 的键（帮助文本叫 description），会被静默忽略；
 * 嵌套字段只有复数 `fields`，单数 `field` 是 Decap 的写法，这里同样不认。
 * 类型清单出处：https://pagescms.org/docs/configuration/content/fields/
 */
const PAGES_FIELD_TYPES = new Set([
  'block',
  'boolean',
  'code',
  'date',
  'file',
  'image',
  'number',
  'object',
  'reference',
  'rich-text',
  'select',
  'string',
  'text',
  'uuid',
]);

const walkFields = (fields, trail = [], acc = []) => {
  for (const field of fields ?? []) {
    const where = [...trail, field.name ?? '(匿名)'].join('.');
    acc.push({ where, field });
    walkFields(field.fields, [...trail, field.name ?? '(匿名)'], acc);
  }
  return acc;
};

describe('PagesCMS 字段声明：type 与键名必须是 Pages CMS 认识的写法', () => {
  const allFields = pagesConfig.content.flatMap((entry) => walkFields(entry.fields, [entry.name]));

  it('遍历到了字段树（防止 walker 失效退化成空断言）', () => {
    expect(allFields.length).toBeGreaterThan(80);
  });

  it('每个字段的 type 都在受支持清单内（含回归：不存在 type: list）', () => {
    expect(
      allFields
        .filter(({ field }) => !PAGES_FIELD_TYPES.has(field.type))
        .map(({ where, field }) => `${where}=${field.type}`),
    ).toEqual([]);
  });

  it('不使用单数 field 键（嵌套字段只有复数 fields）', () => {
    expect(allFields.filter(({ field }) => 'field' in field).map(({ where }) => where)).toEqual([]);
  });

  it('帮助文本用 description 而不是 hint', () => {
    expect(allFields.filter(({ field }) => 'hint' in field).map(({ where }) => where)).toEqual([]);
  });

  it('首页内容的 5 个数组字段都按 list: true 声明', () => {
    const fields = pagesConfig.content.find((item) => item.name === 'portalConfig')?.fields ?? [];
    for (const name of ['tags', 'stack', 'entries', 'links', 'projects']) {
      expect(fields.find((item) => item.name === name)?.list, name).toBeTruthy();
    }
    // 对象列表必须自带 fields，否则 CMS 渲染不出可编辑项。
    for (const name of ['entries', 'links', 'projects']) {
      const field = fields.find((item) => item.name === name);
      expect(field?.type, name).toBe('object');
      expect(field?.fields?.length > 0, name).toBe(true);
    }
  });
});
