/**
 * Cookie 选择的最小持久化层：同意跨会话、关闭仅当前会话。
 * 存储不可用（隐私模式/配额）时按「未选择」处理，继续展示弹窗。
 */

export const COOKIE_CONSENT_KEY = 'cookie-consent';
export const COOKIE_DISMISSED_KEY = 'cookie-dismissed';

export type CookieDecision = 'accepted' | 'dismissed';

const safeGet = (storage: Storage, key: string) => {
  try {
    return storage.getItem(key);
  } catch {
    return null;
  }
};

const safeSet = (storage: Storage, key: string, value: string) => {
  try {
    storage.setItem(key, value);
  } catch {
    // Cookie 选择是尽力而为：存储不可用不应阻塞页面。
  }
};

/** 读取当前选择；accepted 优先于本次会话的 dismissed。 */
export const getCookieDecision = (): CookieDecision | null => {
  if (typeof window === 'undefined') return null;
  if (safeGet(window.localStorage, COOKIE_CONSENT_KEY) === 'accepted') return 'accepted';
  if (safeGet(window.sessionStorage, COOKIE_DISMISSED_KEY) === '1') return 'dismissed';
  return null;
};

export const hasCookieDecision = () => getCookieDecision() !== null;

/** 同意：跨会话记住，并清掉当前会话的关闭标记。 */
export const acceptCookieConsent = () => {
  if (typeof window === 'undefined') return;
  safeSet(window.localStorage, COOKIE_CONSENT_KEY, 'accepted');
  try {
    window.sessionStorage.removeItem(COOKIE_DISMISSED_KEY);
  } catch {
    // ignore
  }
};

/** 关闭/仅浏览：不等于同意，只在当前会话不再展示。 */
export const dismissCookieConsent = () => {
  if (typeof window === 'undefined') return;
  safeSet(window.sessionStorage, COOKIE_DISMISSED_KEY, '1');
};
