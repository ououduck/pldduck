/** Feishu custom bot Webhook sender. */
import { fetchWithRetry, readResponseText, RetryableHttpError } from './http.mjs';
import { createActionLogger } from './gh-actions-logger.mjs';

const logger = createActionLogger('feishu-webhook');
const SAFE_BUDGET = 4000;
const TIMEOUT_MS = 15000;
const RETRIES = 2;
const CONTROL_CHARACTERS = new RegExp(
  `[${String.fromCharCode(0)}-${String.fromCharCode(9)}${String.fromCharCode(11)}-${String.fromCharCode(12)}${String.fromCharCode(14)}-${String.fromCharCode(31)}${String.fromCharCode(127)}]`,
  'g',
);

const CARD_TEMPLATES = Object.freeze({
  success: 'green',
  failure: 'red',
  cancelled: 'orange',
  error: 'red',
  comment: 'blue',
  discussion: 'blue',
  issue: 'orange',
  push: 'purple',
  'link-check': 'orange',
  'friend-review': 'blue',
  'friend-added': 'green',
  'friend-rejected': 'red',
  'friend-deploy': 'purple',
});

export const sanitizeFeishuWebhookUrlForLogs = (value) => {
  try {
    const url = new URL(String(value));
    return `${url.protocol}//${url.host}/***`;
  } catch {
    return '***';
  }
};

const sanitizeText = (value) => String(value ?? '').replace(CONTROL_CHARACTERS, ' ');

const ensureSafeLength = (text) =>
  text.length <= SAFE_BUDGET ? text : `${text.slice(0, SAFE_BUDGET)}\n\n…(消息过长，其余内容已省略)`;

const toCardMarkdown = (text) =>
  sanitizeText(text)
    .replace(/<b>([\s\S]*?)<\/b>/gi, '**$1**')
    // 飞书卡片 markdown 把 `![alt](x)` 当作"图片"解析，且只认飞书上传返回的 img_key（img_v2_…）；
    // 正文里的外部图片 URL（如说说/评论带的 ![](https://img.pldduck.com/…)）会被拒：
    // ErrCode 200570 "card contains invalid image keys"。去掉前导 `!` 降级为普通链接，
    // 图片地址仍可点击跳转，但不再被当成图片渲染。
    .replace(/!\[([^\]]*)\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g, (_match, alt, url) => `[${alt || '图片'}](${url})`)
    // 仅自动链接「裸 URL」：前导字符不含 `(`，否则会把上一步 `[图片](url)` 里 ] (…) 的目标再次包裹成嵌套链接。
    .replace(/(^|[\s：:])((?:https?:\/\/)[^\s<>]+)(?=$|[\s<>])/g, (_match, prefix, url) => {
      const trailing = url.match(/[),.;!?]+$/)?.[0] ?? '';
      const target = trailing ? url.slice(0, -trailing.length) : url;
      return `${prefix}[${target}](${target})${trailing}`;
    });

const buildCardBodyElements = (text, event) => {
  const paragraphs = sanitizeText(text)
    .split(/\n\s*\n+/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean);
  const elements = [];
  paragraphs.forEach((paragraph, index) => {
    if (index > 0) elements.push({ tag: 'hr' });
    elements.push({ tag: 'markdown', content: toCardMarkdown(paragraph) });
  });
  elements.push({ tag: 'hr' });
  elements.push({
    tag: 'div',
    text: { tag: 'plain_text', content: `来源：${sanitizeText(event)}` },
  });
  return elements;
};

const getCardTemplate = (event) => {
  const key = String(event ?? '').toLowerCase();
  if (CARD_TEMPLATES[key]) return CARD_TEMPLATES[key];
  if (key.includes('failure') || key.includes('error')) return 'red';
  if (key.includes('success')) return 'green';
  return 'blue';
};

export const buildFeishuPayload = (text, { event = 'notification', title = 'pldduck 通知' } = {}) => {
  const safeTitle = sanitizeText(title);
  const safeEvent = sanitizeText(event);
  const businessContent = ensureSafeLength(sanitizeText(text));
  const content = ensureSafeLength(`[${safeTitle}]\n事件: ${safeEvent}\n\n${businessContent}`);
  if (process.env.FEISHU_MESSAGE_FORMAT === 'text') {
    return { msg_type: 'text', content: { text: content } };
  }

  return {
    msg_type: 'interactive',
    card: {
      schema: '2.0',
      config: { wide_screen_mode: true, enable_forward: true },
      header: {
        template: getCardTemplate(event),
        title: { tag: 'plain_text', content: safeTitle },
      },
      body: {
        direction: 'vertical',
        elements: buildCardBodyElements(businessContent, safeEvent),
      },
    },
  };
};

export const sendFeishuWebhookMessage = async (text, { event = 'notification', title = 'pldduck 通知' } = {}) => {
  const url = process.env.FEISHU_WEBHOOK_URL;
  if (!url) {
    logger.warn('FEISHU_WEBHOOK_URL not configured; skipping notification');
    return null;
  }

  const payload = buildFeishuPayload(text, { event, title });
  let response;
  try {
    response = await fetchWithRetry(
      url,
      { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) },
      {
        timeoutMs: TIMEOUT_MS,
        retries: RETRIES,
        onRetry: ({ attempt, status, error, delayMs }) =>
          logger.warn('Feishu Webhook transient failure, retrying', {
            attempt,
            status: status ?? 'network',
            error: error ? error.message : '',
            delayMs,
          }),
      },
    );
  } catch (error) {
    const status = error instanceof RetryableHttpError ? error.status : 0;
    const attempts = error instanceof RetryableHttpError ? error.attempts : undefined;
    throw new Error(
      `Feishu Webhook request failed after ${attempts ?? '?'} attempt(s): ${sanitizeFeishuWebhookUrlForLogs(url)}` +
        (status ? ` (HTTP ${status})` : ' (network error)'),
      { cause: error },
    );
  }

  const body = await readResponseText(response, { maxBytes: 4096 }).catch(() => '');
  if (!response.ok) {
    throw new Error(
      `Feishu Webhook request failed: ${sanitizeFeishuWebhookUrlForLogs(url)} (HTTP ${response.status})` +
        (body ? ` — ${body.slice(0, 200)}` : ''),
    );
  }
  if (body) {
    try {
      const result = JSON.parse(body);
      if (result.code !== undefined && result.code !== 0) {
        throw new Error(`Feishu Webhook rejected message (code=${result.code}): ${String(result.msg || 'unknown')}`);
      }
    } catch (error) {
      if (error.message.startsWith('Feishu Webhook rejected message')) throw error;
    }
  }
  return { status: response.status };
};
