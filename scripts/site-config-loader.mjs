/**
 * 站点配置加载器：读取 config/ 下的三份站点配置并合并成**一份对外对象**（含环境变量覆盖），
 * 供全部构建脚本共用。拆分只为 CMS 编辑体验（改首页文案不必翻几十个字段），
 * 消费方一律通过合并后的 siteConfig.portal / siteConfig.comments 访问，形状与拆分前一致。
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { getBasePath, withBasePath } from './base-path.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
// 站点配置数据源：与客户端 config/site.config.ts 共用同一批 JSON（PagesCMS 三个集合可编辑）。
const SITE_CONFIG_FILES = {
  site: path.join(__dirname, '../config/site.config.json'),
  portal: path.join(__dirname, '../config/portal.config.json'),
  comments: path.join(__dirname, '../config/comments.config.json'),
};

const DEFAULT_SITE_CONFIG = {
  title: '跑路的duck',
  subtitle: '',
  description: '',
  url: 'http://localhost:3000',
  logo: '/logo.png',
  seoImage: '/logo.png',
  author: {
    name: '作者',
    avatar: '',
    role: '',
    bio: '',
  },
};

const normalizeBaseUrl = (value, logger, allowFallback) => {
  const rawUrl = String(value || '')
    .trim()
    .replace(/\/+$/, '');

  if (!rawUrl) {
    if (allowFallback) {
      logger?.warn('Site URL is empty, fallback to default', DEFAULT_SITE_CONFIG.url);
      return DEFAULT_SITE_CONFIG.url;
    }
    throw new Error('site.config.json 缺少 url 字段（或 VITE_SITE_URL 为空）');
  }

  try {
    return new URL(rawUrl).toString().replace(/\/+$/, '');
  } catch (error) {
    if (allowFallback) {
      logger?.warn('Invalid site URL, fallback to default', `${rawUrl} -> ${DEFAULT_SITE_CONFIG.url}`);
      return DEFAULT_SITE_CONFIG.url;
    }
    throw new Error(
      `site.config.json 的 url 字段非法（${rawUrl}）：${error instanceof Error ? error.message : String(error)}`,
    );
  }
};

/**
 * 读取并校验单份配置文件。fail-closed：默认抛错中止构建，只有显式 allowFallback 才回退。
 * 返回 null 表示已按 allowFallback 回退，由调用方决定用哪个默认值。
 */
const readConfigFile = (file, { logger, allowFallback }) => {
  const name = path.basename(file);
  const fallBack = (reason) => {
    if (allowFallback) {
      logger?.warn(reason, { path: file });
      return null;
    }
    throw new Error(`${reason}（${file}）`);
  };

  if (!fs.existsSync(file)) {
    return fallBack(`${name} not found`);
  }

  let raw;
  try {
    raw = JSON.parse(fs.readFileSync(file, 'utf-8'));
  } catch (error) {
    return fallBack(`Failed to parse ${name}: ${error instanceof Error ? error.message : String(error)}`);
  }

  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return fallBack(`${name} is not an object`);
  }

  return raw;
};

/**
 * 读取三份站点配置并合并为拆分前的单一形状（含环境变量覆盖）。
 *
 * fail-closed：任一配置文件缺失/损坏/非对象时默认抛错中止构建 —— 静默回退到
 * localhost 默认值会让 sitemap/robots/feed 全部生成 localhost 地址却正常出包
 * （且回退分支在 VITE_SITE_URL 覆盖之前提前 return，CI 设置的 URL 也不生效）。
 * 仅在显式传入 allowFallback（本地调试等场景）时才回退默认配置。
 */
export const loadSiteConfig = ({ logger, allowFallback = false } = {}) => {
  const site = readConfigFile(SITE_CONFIG_FILES.site, { logger, allowFallback }) ?? DEFAULT_SITE_CONFIG;
  const portal = readConfigFile(SITE_CONFIG_FILES.portal, { logger, allowFallback }) ?? {};
  const comments = readConfigFile(SITE_CONFIG_FILES.comments, { logger, allowFallback }) ?? {};

  const raw = { ...site, ...comments, portal };
  const configuredUrl = process.env.VITE_SITE_URL || raw.url;

  return {
    ...raw,
    url: normalizeBaseUrl(configuredUrl, logger, allowFallback),
    author: {
      name: raw.author?.name || DEFAULT_SITE_CONFIG.author.name,
      avatar: raw.author?.avatar || DEFAULT_SITE_CONFIG.author.avatar,
      role: raw.author?.role || DEFAULT_SITE_CONFIG.author.role,
      bio: raw.author?.bio || DEFAULT_SITE_CONFIG.author.bio,
    },
  };
};

export const getSiteBasePath = () => getBasePath(process.env.VITE_BASE_PATH);

export const toAbsoluteUrl = (value, baseUrl, basePath = getSiteBasePath()) => {
  if (!value) {
    return new URL(withBasePath('/', basePath), `${baseUrl.replace(/\/+$/, '')}/`).toString();
  }

  const rawValue = String(value);
  if (/^[a-z][a-z\d+.-]*:/i.test(rawValue)) {
    try {
      const candidate = new URL(rawValue);
      const site = new URL(baseUrl);
      if (candidate.origin !== site.origin) {
        return rawValue;
      }
      return new URL(
        withBasePath(`${candidate.pathname}${candidate.search}${candidate.hash}`, basePath),
        `${baseUrl.replace(/\/+$/, '')}/`,
      ).toString();
    } catch {
      return rawValue;
    }
  }

  return new URL(withBasePath(rawValue, basePath), `${baseUrl.replace(/\/+$/, '')}/`).toString();
};
