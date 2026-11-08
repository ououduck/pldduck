import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  acceptCookieConsent,
  COOKIE_CONSENT_KEY,
  COOKIE_DISMISSED_KEY,
  dismissCookieConsent,
  getCookieDecision,
  hasCookieDecision,
} from './cookieConsent';

describe('cookieConsent', () => {
  beforeEach(() => {
    window.localStorage.clear();
    window.sessionStorage.clear();
  });

  afterEach(() => {
    window.localStorage.clear();
    window.sessionStorage.clear();
  });

  it('没有选择时返回 null', () => {
    expect(getCookieDecision()).toBeNull();
    expect(hasCookieDecision()).toBe(false);
  });

  it('同意跨会话持久化，并优先于本会话关闭标记', () => {
    window.sessionStorage.setItem(COOKIE_DISMISSED_KEY, '1');
    acceptCookieConsent();
    expect(window.localStorage.getItem(COOKIE_CONSENT_KEY)).toBe('accepted');
    expect(window.sessionStorage.getItem(COOKIE_DISMISSED_KEY)).toBeNull();
    expect(getCookieDecision()).toBe('accepted');
  });

  it('关闭只写 sessionStorage，不写入同意', () => {
    dismissCookieConsent();
    expect(window.localStorage.getItem(COOKIE_CONSENT_KEY)).toBeNull();
    expect(window.sessionStorage.getItem(COOKIE_DISMISSED_KEY)).toBe('1');
    expect(getCookieDecision()).toBe('dismissed');
  });

  it('存储不可用时安全降级为未选择', () => {
    const original = Storage.prototype.getItem;
    Storage.prototype.getItem = () => {
      throw new Error('blocked');
    };
    try {
      expect(getCookieDecision()).toBeNull();
      expect(hasCookieDecision()).toBe(false);
    } finally {
      Storage.prototype.getItem = original;
    }
  });
});
