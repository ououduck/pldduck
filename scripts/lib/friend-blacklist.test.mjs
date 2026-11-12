// @vitest-environment node
/**
 * 友链黑名单匹配口径：这些用例守的是「站长在 CMS 里填的域名/泛域名能按预期拦截」，
 * 以及「坏条目不会把整份黑名单带崩」。
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it, expect } from 'vitest';
import {
  compileBlacklistPattern,
  extractBlacklistHost,
  findBlacklistHit,
  isBlacklistedHost,
  loadFriendBlacklist,
} from './friend-blacklist.mjs';

const compile = (entries) => entries.map(compileBlacklistPattern).filter(Boolean);

describe('extractBlacklistHost', () => {
  it('域名、完整 URL、带端口/路径/查询串都能取出主机名', () => {
    expect(extractBlacklistHost('spam.example')).toBe('spam.example');
    expect(extractBlacklistHost('HTTPS://Spam.Example/Path?q=1')).toBe('spam.example');
    expect(extractBlacklistHost('http://spam.example:8443/a/b')).toBe('spam.example');
    expect(extractBlacklistHost('  spam.example.  ')).toBe('spam.example');
    expect(extractBlacklistHost('')).toBe('');
  });
});

describe('compileBlacklistPattern', () => {
  it('裸域名：精确匹配 + 所有子域', () => {
    const [pattern] = compile(['spam.example']);
    for (const host of ['spam.example', 'a.spam.example', 'a.b.spam.example', 'SPAM.EXAMPLE']) {
      expect(isBlacklistedHost(host, [pattern]), host).toBeTruthy();
    }
    expect(isBlacklistedHost('notspam.example', [pattern])).toBeNull();
    expect(isBlacklistedHost('spam.example.evil.net', [pattern])).toBeNull();
    expect(isBlacklistedHost('example', [pattern])).toBeNull();
  });

  it('泛域名 *.：只匹配子域，不匹配裸域', () => {
    const [pattern] = compile(['*.spam.example']);
    expect(isBlacklistedHost('a.spam.example', [pattern])).toBeTruthy();
    expect(isBlacklistedHost('a.b.spam.example', [pattern])).toBeTruthy();
    expect(isBlacklistedHost('spam.example', [pattern])).toBeNull();
  });

  it('条目可以贴完整 URL，匹配只针对主机名', () => {
    const [pattern] = compile(['https://spam.example/friends']);
    expect(isBlacklistedHost('http://spam.example/links', [pattern])).toBeTruthy();
    expect(isBlacklistedHost('https://spam.example/other', [pattern])).toBeTruthy();
    expect(isBlacklistedHost('https://good.example/', [pattern])).toBeNull();
  });

  it('国际化域名按 punycode 匹配', () => {
    const [pattern] = compile(['例子.测试']);
    // 浏览器/URL 解析出来的主机名是 punycode 形式。
    expect(isBlacklistedHost('http://xn--fsqu00a.xn--0zwm56d/', [pattern])).toBeTruthy();
    expect(isBlacklistedHost('http://www.xn--fsqu00a.xn--0zwm56d/', [pattern])).toBeTruthy();
  });

  it('无效条目被忽略：空串、裸 *、单标签、非前缀通配', () => {
    for (const entry of ['', '   ', '*', 'localhost', 'spam*example.com', '*.']) {
      expect(compileBlacklistPattern(entry), entry).toBeNull();
    }
    expect(compile(['spam.example', 'localhost', ''])).toHaveLength(1);
  });
});

describe('findBlacklistHit', () => {
  it('站点地址、反链页面、头像任意一个命中都算命中，并返回具体地址', () => {
    const patterns = compile(['bad.example']);
    const hit = findBlacklistHit(
      ['https://good.example/', 'https://bad.example/links', 'https://good.example/a.png'],
      patterns,
    );
    expect(hit).toEqual({
      url: 'https://bad.example/links',
      host: 'bad.example',
      source: 'bad.example',
    });
  });

  it('全部未命中返回 null', () => {
    expect(findBlacklistHit(['https://good.example/'], compile(['bad.example']))).toBeNull();
  });
});

describe('loadFriendBlacklist', () => {
  it('仓库里的配置文件存在且可解析（域名为空时 patterns 为空）', () => {
    const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
    const loaded = loadFriendBlacklist({ rootDir: repoRoot });
    expect(loaded.error).toBeNull();
    expect(Array.isArray(loaded.patterns)).toBe(true);
    expect(loaded.invalid).toBe(0);
  });

  it('坏 JSON 返回 error 而不是抛错（调用方会转人工，不静默放行）', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'friend-blacklist-'));
    try {
      fs.mkdirSync(path.join(root, 'config'), { recursive: true });
      fs.writeFileSync(path.join(root, 'config/friend-blacklist.json'), '{ not json', 'utf8');
      const loaded = loadFriendBlacklist({ rootDir: root });
      expect(loaded.error).toContain('JSON');
      expect(loaded.patterns).toEqual([]);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it('统计无效条目数量，但有效条目照常生效', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'friend-blacklist-'));
    try {
      fs.mkdirSync(path.join(root, 'config'), { recursive: true });
      fs.writeFileSync(
        path.join(root, 'config/friend-blacklist.json'),
        JSON.stringify({ domains: ['bad.example', 'localhost', ''] }),
        'utf8',
      );
      const loaded = loadFriendBlacklist({ rootDir: root });
      expect(loaded.error).toBeNull();
      expect(loaded.patterns).toHaveLength(1);
      expect(loaded.invalid).toBe(2);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
});
