import { describe, it, expect } from 'vitest';
import { postCoverTransitionName, shuoshuoCoverTransitionName, viewTransitionStyle } from './viewTransition';

describe('viewTransition', () => {
  it('转场名按条目区分（避免从 A 卡片点进 B 文章时封面错配）', () => {
    expect(postCoverTransitionName('hello-world')).toBe('post-cover-hello-world');
    expect(postCoverTransitionName('a')).not.toBe(postCoverTransitionName('b'));
    expect(shuoshuoCoverTransitionName('hello-shuoshuo')).toBe('shuoshuo-cover-hello-shuoshuo');
  });

  it('转场名是合法的 CSS ident（特殊字符替换为短横线）', () => {
    // CSS 自定义 ident 只允许字母/数字/下划线/短横线：中文等字符必须被替换，
    // 否则 view-transition-name 会被浏览器丢弃（转场静默失效）。
    expect(postCoverTransitionName('a/b c')).toBe('post-cover-a-b-c');
    expect(postCoverTransitionName('中文id')).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  it('未启用时返回 undefined：SSR 输出里不能出现转场内联样式', () => {
    expect(viewTransitionStyle('post-cover-a', false)).toBeUndefined();
    expect(viewTransitionStyle(null, true)).toBeUndefined();
    expect(viewTransitionStyle(undefined, true)).toBeUndefined();
  });

  it('启用时返回 viewTransitionName', () => {
    expect(viewTransitionStyle('post-cover-a', true)).toEqual({ viewTransitionName: 'post-cover-a' });
  });
});
