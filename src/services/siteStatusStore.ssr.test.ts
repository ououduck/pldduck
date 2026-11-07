// @vitest-environment node
import { describe, it, expect, vi } from 'vitest';

// SSR 安全：服务端（Node，无 window/document）只会碰到「模块导入」这一步。
// 导入不得访问浏览器 API，订阅也不得启动轮询；组件只在客户端 effect 中订阅。
// 用独立文件声明 node 环境，才能真正验证「无 window/document」而不是靠 mock。
describe('siteStatusStore — SSR 安全', () => {
  it('无 window/document 时模块可导入，订阅只回放中性快照且不抛错', async () => {
    expect(typeof window).toBe('undefined');
    expect(typeof document).toBe('undefined');

    const { subscribeSiteStatus, subscribeWorkersLimit } = await import('./siteStatusStore');

    const statusListener = vi.fn();
    const unsubscribeStatus = subscribeSiteStatus(statusListener);
    expect(statusListener).toHaveBeenCalledTimes(1);
    expect(statusListener).toHaveBeenCalledWith({ status: 'unavailable' });
    unsubscribeStatus();

    const unsubscribeWorkers = subscribeWorkersLimit(vi.fn());
    unsubscribeWorkers();
  });
});
