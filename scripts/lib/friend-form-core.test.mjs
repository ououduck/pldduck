// @vitest-environment node
import { readFileSync } from 'node:fs';
import { describe, it, expect } from 'vitest';
import yaml from 'js-yaml';
import {
  FRIENDS_DIR,
  FRIEND_APPLICATION_TYPES,
  FRIEND_FIELDS,
  FRIEND_ISSUE_MARKER,
  MAX_DESCRIPTION_CHARS,
  MAX_NAME_CHARS,
  MAX_URL_CHARS,
  REJECT_CONTACT_EMAIL,
  buildRecordJson,
  mergeRecordJson,
  normalizeFriendUrl,
  parseFriendIssueBody,
  pickDetectionUrl,
  renderApprovedComment,
  renderBlockedComment,
  renderComment,
  renderDetectComment,
  renderRejectComment,
  suggestFilename,
  validateFriendRecord,
} from './friend-form-core.mjs';
import { buildAcceptedHosts } from './friend-backlink.mjs';

const accepted = buildAcceptedHosts('https://www.pldduck.com');
const ZERO_WIDTH_SPACE = String.fromCodePoint(0x200b);
const IDEOGRAPHIC_SPACE = String.fromCodePoint(0x3000);

/** GitHub 渲染 Issue 表单正文的真实形状（每个输入一个三级标题 + 值）。 */
const issueBody = (overrides = {}) => {
  const values = {
    站点名称: '阿叶的小站',
    站点地址: 'https://blog.Ayeez.cn',
    反链页面地址: 'https://blog.Ayeez.cn/links',
    头像地址: 'https://qiniu.ayeez.cn/avatar.jpg',
    站点简介: '记录学习历程，记录美好生活',
    申请类型: '新增',
    确认事项: '- [X] 我已在自己的站点上添加指向本站的链接\n- [X] 我同意公开展示',
    ...overrides,
  };
  return FRIEND_FIELDS.map(({ label }) => `### ${label}\n\n${values[label]}\n`).join('\n');
};

// 走真实链路：Issue 正文（中文 label）→ 解析器 → values（英文 key），override 按 label 写。
const validValues = (overrides = {}) => parseFriendIssueBody(issueBody(overrides)).values;

describe('parseFriendIssueBody', () => {
  it('解析完整表单', () => {
    const parsed = parseFriendIssueBody(issueBody());
    expect(parsed.ok).toBe(true);
    expect(parsed.values).toMatchObject({
      name: '阿叶的小站',
      url: 'https://blog.Ayeez.cn',
      backlinkUrl: 'https://blog.Ayeez.cn/links',
      applicationType: '新增',
    });
    expect(parsed.confirmations).toHaveLength(2);
  });

  it('缺失字段段 → 失败并说明是哪个字段', () => {
    const body = issueBody().replace(/### 站点简介\n\n[^\n]*\n/, '');
    const parsed = parseFriendIssueBody(body);
    expect(parsed.ok).toBe(false);
    expect(parsed.reason).toContain('站点简介');
  });

  it('字段段重复 → 失败（绝不猜取哪一段）', () => {
    const parsed = parseFriendIssueBody(`${issueBody()}\n### 站点名称\n\n假的站名\n`);
    expect(parsed.ok).toBe(false);
    expect(parsed.reason).toContain('出现 2 次');
  });

  it('字段顺序与模板不一致 → 失败', () => {
    // 交换「头像地址」与「站点简介」两段的位置（模板 label 顺序即解析契约）。
    const avatarHeading = `### ${FRIEND_FIELDS[3].label}`;
    const descHeading = `### ${FRIEND_FIELDS[4].label}`;
    const body = issueBody()
      .replace(avatarHeading, '@@DESC@@')
      .replace(descHeading, avatarHeading)
      .replace('@@DESC@@', descHeading);
    const parsed = parseFriendIssueBody(body);
    expect(parsed.ok).toBe(false);
    expect(parsed.reason).toContain('顺序');
  });

  it('未填项（_No response_）按空值处理', () => {
    const parsed = parseFriendIssueBody(issueBody({ 反链页面地址: '_No response_' }));
    expect(parsed.ok).toBe(true);
    expect(parsed.values.backlinkUrl).toBe('');
  });

  it('未知标题（模板说明块）不影响解析，但会被记录', () => {
    const parsed = parseFriendIssueBody(`### 申请须知\n\n先看说明\n\n${issueBody()}`);
    expect(parsed.ok).toBe(true);
    expect(parsed.unknown).toContain('申请须知');
  });

  it('确认事项有未勾选项 → 失败', () => {
    const parsed = parseFriendIssueBody(issueBody({ 确认事项: '- [X] 第一项\n- [ ] 第二项' }));
    expect(parsed.ok).toBe(false);
    expect(parsed.reason).toContain('未勾选');
  });

  it('确认事项里一个复选框都没有 → 失败（模板被绕过）', () => {
    const parsed = parseFriendIssueBody(issueBody({ 确认事项: '我保证' }));
    expect(parsed.ok).toBe(false);
    expect(parsed.reason).toContain('没有找到任何勾选项');
  });

  it('空正文/非模板正文 → 失败而不是抛错', () => {
    expect(parseFriendIssueBody('').ok).toBe(false);
    expect(parseFriendIssueBody(undefined).ok).toBe(false);
  });

  it('CRLF 正文与 LF 同样解析', () => {
    expect(parseFriendIssueBody(issueBody().replace(/\n/g, '\r\n')).ok).toBe(true);
  });

  it('别的字段里出现的复选框文本不被误算', () => {
    const parsed = parseFriendIssueBody(issueBody({ 站点简介: '我喜欢 - [ ] 这种写法' }));
    expect(parsed.ok).toBe(true);
    expect(parsed.confirmations).toHaveLength(2);
  });
});

describe('validateFriendRecord', () => {
  it('合法记录通过并给出归一化地址', () => {
    const result = validateFriendRecord(validValues(), { acceptedHosts: accepted });
    expect(result.ok).toBe(true);
    expect(result.record).toEqual({
      name: '阿叶的小站',
      description: '记录学习历程，记录美好生活',
      avatar: 'https://qiniu.ayeez.cn/avatar.jpg',
      url: 'https://blog.Ayeez.cn',
    });
    expect(result.canonicalUrl).toBe('https://blog.ayeez.cn');
    expect(result.backlinkUrl).toBe('https://blog.Ayeez.cn/links');
  });

  it('javascript:/data:/ftp: 协议在入库前就被拒（前端会把它塞进 href/src）', () => {
    for (const url of ['javascript:alert(1)', 'data:text/html,<script>alert(1)</script>', 'ftp://blog.example']) {
      const result = validateFriendRecord(validValues({ 站点地址: url }), { acceptedHosts: accepted });
      expect(result.ok).toBe(false);
      expect(result.errors.join()).toContain('只允许 http/https');
    }
  });

  it('头像同样只允许 http/https', () => {
    const result = validateFriendRecord(validValues({ 头像地址: 'javascript:alert(1)' }), { acceptedHosts: accepted });
    expect(result.errors.join()).toContain('头像地址 只允许 http/https');
  });

  it('IP 字面量与带凭据的地址被拒', () => {
    for (const url of ['https://127.0.0.1', 'https://10.0.0.8/blog', 'https://user:pass@blog.example']) {
      expect(validateFriendRecord(validValues({ 站点地址: url }), { acceptedHosts: accepted }).ok).toBe(false);
    }
  });

  it('名称与简介长度收口（按码点计数）', () => {
    expect(validateFriendRecord(validValues({ 站点名称: '字'.repeat(51) })).errors.join()).toContain('站点名称过长');
    expect(validateFriendRecord(validValues({ 站点简介: 'x'.repeat(121) })).errors.join()).toContain('站点简介过长');
    expect(validateFriendRecord(validValues({ 站点名称: '字'.repeat(50) })).ok).toBe(true);
  });

  it('零宽与全角空白等不可见字符被清掉（防止冒充他人站点名）', () => {
    const result = validateFriendRecord(
      validValues({ 站点名称: `阿叶${ZERO_WIDTH_SPACE}的小站${IDEOGRAPHIC_SPACE}注入` }),
    );
    expect(result.record.name).toBe('阿叶的小站 注入');
  });

  it('站点地址不能是本站域名', () => {
    for (const url of ['https://www.pldduck.com', 'https://pldduck.com/', 'https://blog.pldduck.com']) {
      const result = validateFriendRecord(validValues({ 站点地址: url }), { acceptedHosts: accepted });
      expect(result.errors.join()).toContain('不能是本站域名');
    }
  });

  it('反链页面必须与站点同域，且不得使用非标准端口（否则本 Action 变成任意探测代理）', () => {
    expect(validateFriendRecord(validValues({ 反链页面地址: 'https://other.example/links' })).errors.join()).toContain(
      '必须与站点地址同域',
    );
    expect(validateFriendRecord(validValues({ 反链页面地址: 'https://evil-pldduck.com/x' })).ok).toBe(false);
    expect(validateFriendRecord(validValues({ 反链页面地址: 'http://127.0.0.1:3000' })).ok).toBe(false);
    expect(
      validateFriendRecord(validValues({ 反链页面地址: 'https://blog.Ayeez.cn:8443/links' })).errors.join(),
    ).toContain('非标准端口');
  });

  it('反链页面允许站点主机的父/子域', () => {
    const result = validateFriendRecord(
      validValues({ 站点地址: 'https://blog.Ayeez.cn', 反链页面地址: 'https://ayeez.cn/friends' }),
    );
    expect(result.ok).toBe(true);
    expect(result.backlinkUrl).toBe('https://ayeez.cn/friends');
  });

  it('反链页面留空合法（检测退回站点首页）', () => {
    const result = validateFriendRecord(validValues({ 反链页面地址: '' }), { acceptedHosts: accepted });
    expect(result.ok).toBe(true);
    expect(result.backlinkUrl).toBe('');
    expect(pickDetectionUrl(result)).toBe('https://blog.Ayeez.cn');
  });

  it('申请类型只能是新增/修改/下架', () => {
    const result = validateFriendRecord(validValues({ 申请类型: '随便' }), { acceptedHosts: accepted });
    expect(result.errors.join()).toContain('申请类型只能是');
    expect(FRIEND_APPLICATION_TYPES).toEqual(['新增', '修改', '下架']);
  });

  it('多个错误一次性全部返回（省得申请人来回改）', () => {
    const result = validateFriendRecord(validValues({ 站点名称: '', 站点地址: 'nope' }), { acceptedHosts: accepted });
    expect(result.ok).toBe(false);
    expect(result.errors.length).toBeGreaterThanOrEqual(2);
  });

  it('下架申请同样通过校验（由入口脚本转人工，机器人不删文件）', () => {
    expect(validateFriendRecord(validValues({ 申请类型: '下架' }), { acceptedHosts: accepted }).ok).toBe(true);
  });
});

describe('normalizeFriendUrl', () => {
  it('大小写、www、末尾斜杠、默认端口归一（生成器只按原始串去重，机器人必须更严）', () => {
    const seen = new Set([
      normalizeFriendUrl('https://blog.Ayeez.cn'),
      normalizeFriendUrl('https://blog.ayeez.cn/'),
      normalizeFriendUrl('https://www.ayeez.cn'),
      normalizeFriendUrl('https://ayeez.cn:443/'),
    ]);
    expect([...seen]).toEqual(['https://blog.ayeez.cn', 'https://ayeez.cn']);
  });

  it('非默认端口与路径、查询串保留（末尾斜杠归一）', () => {
    expect(normalizeFriendUrl('https://Blog.Example.COM:8443/friends/?a=1#x')).toBe(
      'https://blog.example.com:8443/friends?a=1#x',
    );
  });

  it('非法地址退化为小写原文（不抛错）', () => {
    expect(normalizeFriendUrl('Not A Url')).toBe('not a url');
  });
});

describe('suggestFilename', () => {
  it('只从提交者用户名派生', () => {
    expect(suggestFilename('Ayeez', 'https://blog.ayeez.cn')).toBe('ayeez');
    expect(suggestFilename('YILXIY', 'https://blog.example')).toBe('yilxiy');
  });

  it('撞名时加站点域名后缀，再撞就退到哈希', () => {
    expect(suggestFilename('ayeez', 'https://blog.ayeez.cn', ['ayeez'])).toBe('ayeez-blog-ayeez-cn');
    expect(suggestFilename('ayeez', 'https://blog.ayeez.cn', ['ayeez', 'ayeez-blog-ayeez-cn'])).toMatch(
      /^ayeez-[0-9a-f]{8}$/,
    );
  });

  it('长度封顶 64', () => {
    expect(suggestFilename('b'.repeat(70), 'https://x.example')).toHaveLength(64);
  });

  it('穿越型用户名要么被拒要么只剩安全字符（写入路径恒为 friends/<单段>.json）', () => {
    for (const login of ['../../etc/passwd', 'a/b', 'a\\b', '..', `nul${String.fromCharCode(1)}`, '  ']) {
      if (!login.trim()) continue;
      let filename = null;
      try {
        filename = suggestFilename(login, 'https://blog.ayeez.cn');
      } catch {
        continue; // 派生不出合法文件名 → 抛错转人工，同样是安全结果
      }
      expect(filename).toMatch(/^[A-Za-z0-9_-]{1,64}$/);
      expect(`${FRIENDS_DIR}/${filename}.json`.split('/')).toHaveLength(2);
    }
  });

  it('无法从用户名派生合法文件名时抛错转人工（不静默造怪名字）', () => {
    expect(() => suggestFilename('中文站点名', 'https://blog.ayeez.cn')).toThrow();
    expect(() => suggestFilename('', 'https://blog.ayeez.cn')).toThrow();
  });
});

describe('buildRecordJson / mergeRecordJson', () => {
  const record = {
    name: '阿叶的小站',
    description: '记录学习历程',
    avatar: 'https://qiniu.ayeez.cn/avatar.jpg',
    url: 'https://blog.Ayeez.cn',
  };

  it('与现有 14 个文件同形状：键序固定、含 filename 键、2 空格缩进、无尾换行', () => {
    const json = buildRecordJson({ record, filename: 'ayeez' });
    expect(json.endsWith('}')).toBe(true);
    expect(JSON.parse(json)).toEqual({
      name: '阿叶的小站',
      filename: 'ayeez',
      description: '记录学习历程',
      avatar: 'https://qiniu.ayeez.cn/avatar.jpg',
      url: 'https://blog.Ayeez.cn',
      unavailable: false,
    });
    expect(Object.keys(JSON.parse(json))).toEqual(['name', 'filename', 'description', 'avatar', 'url', 'unavailable']);
    expect(json).toContain('\n  "name"');
  });

  it('filename 键必须存在（缺了它 Pages CMS 会生成 .json 点文件）', () => {
    expect(JSON.parse(buildRecordJson({ record, filename: 'ayeez' })).filename).toBe('ayeez');
  });

  it('非法文件名直接抛错，不产出会穿越目录的 JSON', () => {
    expect(() => buildRecordJson({ record, filename: '../evil' })).toThrow();
    expect(() => buildRecordJson({ record, filename: 'a/b' })).toThrow();
    expect(() => buildRecordJson({ record, filename: '' })).toThrow();
  });

  it('更新时保留站长的 unavailable 标记、覆盖申报字段、不改动原对象', () => {
    const original = {
      name: '旧名',
      filename: 'ayeez',
      description: '旧简介',
      avatar: 'https://a/1.png',
      url: 'https://old',
      unavailable: true,
    };
    const before = { ...original };
    const merged = mergeRecordJson(original, record, 'ayeez');
    expect(JSON.parse(merged).unavailable).toBe(true);
    expect(JSON.parse(merged).url).toBe('https://blog.Ayeez.cn');
    expect(JSON.parse(merged).name).toBe('阿叶的小站');
    expect(original).toEqual(before);
  });

  it('unavailable 非 true 的一切取值都写成 false', () => {
    expect(JSON.parse(mergeRecordJson({ unavailable: undefined }, record, 'a')).unavailable).toBe(false);
    expect(JSON.parse(buildRecordJson({ record, filename: 'a', unavailable: 'true' })).unavailable).toBe(false);
  });
});

describe('评论渲染', () => {
  it('每条评论都带自循环标记', () => {
    for (const body of [
      renderComment({ title: 'x' }),
      renderRejectComment(),
      renderBlockedComment({ title: 'y', reasons: ['z'] }),
      renderDetectComment({
        validated: validateFriendRecord(validValues()),
        result: null,
        siteUrl: 'https://www.pldduck.com',
      }),
      renderApprovedComment({
        record: { name: 'a', description: 'b', avatar: 'c', url: 'd' },
        filename: 'a',
        commitSha: 'deadbeef',
      }),
    ]) {
      expect(body).toContain(FRIEND_ISSUE_MARKER);
    }
  });

  it('拒绝文案是固定串 + 站点公开邮箱，不含任何用户输入', () => {
    const body = renderRejectComment();
    expect(body).toContain('您的友链出于某些原因被 PLDDUCK 拒绝了');
    expect(body).toContain(REJECT_CONTACT_EMAIL);
    expect(body).not.toContain('阿叶');
    // 收到拒绝的人没有打标签权限，页脚不能教他「打 friend-approved 即入库」。
    expect(body).not.toContain('friend-approved');
    expect(body).toContain('已关闭');
  });

  it('用户文本一律进行内代码：拼不出可点链接、裸露 HTML 或多行字段', () => {
    const validated = validateFriendRecord({
      ...validValues(),
      name: '[点我](https://evil.example)',
      description: '<script>alert(1)</script>',
    });
    expect(validated.ok).toBe(true);
    const body = renderDetectComment({
      validated,
      result: { verdict: 'found', message: '命中', stats: {} },
      siteUrl: 'https://www.pldduck.com',
    });
    // 反引号包裹 → GitHub 按纯文本渲染；裸露在行外才会变成可点链接/可执行 HTML
    expect(body).toContain('`[点我](https://evil.example)`');
    expect(body).toContain('`<script>alert(1)</script>`');
    expect(body).not.toContain('\n[点我](https://evil.example)');
    expect(body).not.toContain('\n<script>alert(1)</script>');
  });

  it('值里本身带反引号时改用双反引号定界（防止提前闭合）', () => {
    const body = renderDetectComment({
      validated: validateFriendRecord({ ...validValues(), description: '`x`' }),
      result: null,
      siteUrl: 'https://www.pldduck.com',
    });
    expect(body).toContain('`` `x` ``');
  });

  it('换行与控制字符被压成一行，不会在评论里长出小标题', () => {
    const body = renderDetectComment({
      validated: validateFriendRecord({ ...validValues(), name: `a\n### 注入标题\n${ZERO_WIDTH_SPACE}b` }),
      result: null,
      siteUrl: 'https://www.pldduck.com',
    });
    expect(body).not.toMatch(/^### 注入标题$/m);
    expect(body).toContain('a ### 注入标题 b');
  });

  it('空值行直接省略，不输出空表格行', () => {
    const body = renderDetectComment({
      validated: validateFriendRecord(validValues()),
      result: { verdict: 'not-found', message: '没找到', stats: { anchorCount: 3 } },
      siteUrl: 'https://www.pldduck.com',
    });
    expect(body).toContain('静态链接数');
    expect(body).not.toContain('| 页面出现的域名 | |');
  });

  it('人工放行评论在检测未命中时写明「人工放行」', () => {
    const record = validateFriendRecord(validValues()).record;
    const body = renderApprovedComment({
      record,
      filename: 'ayeez',
      commitSha: 'abc123def',
      result: { verdict: 'not-found', message: '没检测到', stats: {} },
      deployed: true,
    });
    expect(body).toContain('人工放行');
    expect(body).toContain('abc123d');
    expect(body).toContain('Deploy to Cloudflare Worker');
    expect(body).toContain('friends/ayeez.json');
  });

  it('部署触发失败时如实说明要手动部署', () => {
    const body = renderApprovedComment({
      record: validateFriendRecord(validValues()).record,
      filename: 'ayeez',
      commitSha: 'abc123def',
      deployed: false,
    });
    expect(body).toContain('自动触发部署失败');
  });

  it('无法自动处理时列出原因', () => {
    const body = renderBlockedComment({ title: '表单已变更', reasons: ['站点简介过长'], next: '改完再打标签' });
    expect(body).toContain('暂时无法自动处理：表单已变更');
    expect(body).toContain('- 站点简介过长');
    expect(body).toContain('改完再打标签');
  });
});

describe('模板与解析器的契约（漂移守卫）', () => {
  const templatePath = new URL('../../.github/ISSUE_TEMPLATE/friend-link-application.yml', import.meta.url);
  const siteConfig = JSON.parse(readFileSync(new URL('../../config/site.config.json', import.meta.url), 'utf8'));
  const template = yaml.load(readFileSync(templatePath, 'utf8'));
  const items = template.body.filter((item) => item.type !== 'markdown');

  /** GitHub 表单里 required 的写法按类型不同：勾选框挂在每个选项上，其余挂在 validations。 */
  const isRequired = (item) =>
    item.type === 'checkboxes'
      ? item.attributes.options.every((option) => option.required === true)
      : item.validations?.required === true;

  it('模板字段 label、顺序与必填性与 FRIEND_FIELDS 一致', () => {
    expect(items.map((item) => item.attributes.label)).toEqual(FRIEND_FIELDS.map((field) => field.label));
    expect(items.map(isRequired)).toEqual(FRIEND_FIELDS.map((field) => field.required));
  });

  it('申请类型选项 === FRIEND_APPLICATION_TYPES', () => {
    const dropdown = items.find((item) => item.attributes.label === '申请类型');
    expect(dropdown.attributes.options).toEqual([...FRIEND_APPLICATION_TYPES]);
  });

  it('模板 maxLength 与校验上限一致（否则申请人会被要求改两次）', () => {
    const caps = {
      name: MAX_NAME_CHARS,
      description: MAX_DESCRIPTION_CHARS,
      url: MAX_URL_CHARS,
      backlinkUrl: MAX_URL_CHARS,
      avatar: MAX_URL_CHARS,
    };
    for (const field of FRIEND_FIELDS) {
      if (caps[field.key] === undefined) continue;
      const item = items.find((candidate) => candidate.attributes.label === field.label);
      expect(item.validations?.maxLength, field.label).toBe(caps[field.key]);
    }
  });

  it('拒绝文案的邮箱就是站点公开邮箱', () => {
    expect(REJECT_CONTACT_EMAIL).toBe(siteConfig.social.rawEmail);
  });

  it('写入目录硬编码值与 CMS 配置一致', () => {
    expect(FRIENDS_DIR).toBe(siteConfig.friendsPage.repoFriendsDir);
  });
});
