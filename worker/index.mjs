/**
 * Cloudflare Workers ESM 入口。
 *
 * 入口模块**只能**导出 `export default { fetch }`：Workers 运行时会把入口模块的每个
 * 具名导出当成 handler/Durable Object，导出常量或普通函数会在启动时报
 * `Incorrect type for map entry ...`（本地 `wrangler dev` 已实测）。因此
 * `/api/status` 的全部逻辑放在 `status.mjs`，这里只做转发。
 */
import { handleRequest } from './status.mjs';

export default {
  /**
   * @param {Request} request
   * @param {Record<string, unknown>} env
   * @param {{ waitUntil?: (promise: Promise<unknown>) => void }} ctx
   * @returns {Promise<Response>}
   */
  fetch(request, env, ctx) {
    return handleRequest(request, env, ctx);
  },
};
