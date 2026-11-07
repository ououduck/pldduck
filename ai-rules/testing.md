# 测试约定（testing）— AI 修改规则

## 功能概述

Vitest 测试体系：101 个测试文件 / 1097 个用例；jsdom（src）与 node（scripts、worker）双环境；@testing-library/react；覆盖率门槛。

## 关键文件

- `vitest.config.ts`（环境/覆盖率/门槛）
- `src/test/setup.ts`（jest-dom matchers、scrollIntoView/scrollTo 补齐）
- 各 `*.test.{ts,tsx,mjs}`

## 修改规则（必须遵守）

1. **断言必须真实**：禁止恒真断言（如 MemoryRouter 下断言 window.location、jsdom 下断言 URL 不变）——用 useSearchParams 探针 / dispatchEvent 返回值 / 行为断言替代。
2. **环境声明**：scripts 与 worker 的 node 测试文件头必须 `// @vitest-environment node`（Vitest 4 无 environmentMatchGlobs）。
3. **mock 纪律**：vi.mock 工厂内引用模块级常量必须用 `vi.hoisted`（TDZ）；mock 后必须恢复（afterEach vi.restoreAllMocks / unstubAllGlobals）；页面测试用固定非空数据集（空数据让行为零覆盖）。
4. **回归覆盖**：修复 bug 必须补对应回归测试（含失败分支：存储不可用、加载失败、竞态、边界输入）。
5. **覆盖率门槛**：thresholds（stmts/lines/funcs 50、branches 45）防下滑，本地 test:coverage 必须保持全绿。
6. **异步**：异步断言用 waitFor/findBy；禁止裸 setTimeout 代替等待（flaky）。
7. **SSR/水合**：涉及渲染确定性（日期/时钟）的组件测试需验证 SSR 首帧与客户端一致。
8. **全局 store / 订阅测试**：`siteStatusStore` 这类模块级单例（订阅者、timer、快照）会跨用例残留，必须 `vi.resetModules()` 后重新 import（或 mock 服务层 `getSiteStatus`），并在用例结束显式取消订阅；轮询与节流一律用 fake timers（`vi.useFakeTimers()` + `advanceTimersByTimeAsync`），`sessionStorage` 在 beforeEach 清空、afterEach 恢复真实计时器。断言要验证真实行为：同一时刻只发一个请求、60s 轮询、可见性补刷、最后一个订阅者取消后停止、Workers 上限 10 分钟节流（含存储不可用的回退分支）、无订阅者时不消耗提示窗口。
9. **SSR 安全测试**：涉及 `window` / `document` / storage 的模块（如 `siteStatusStore`）要有独立的 `// @vitest-environment node` 测试文件，验证「无 window/document 时模块可导入、订阅只回放中性快照且不抛错」；**不得**用 jsdom + mock window 冒充 SSR。
10. **全局提示组件（toast）测试**：mock 订阅接口而不是真实轮询；覆盖精确文案（逐字断言，含导出的 `WORKERS_LIMIT_MESSAGE`）、`role="alert"`、颜色与层级类、无关闭按钮、3 秒自动收回、重复触发重新计时、卸载取消订阅并清理 timer（卸载后不得 setState）。
11. **尾斜杠页名归一测试**：`siteNav.ts` 的 `normalizePathname` 会去掉尾斜杠再比较（SSG 产物是 `/posts/`，客户端 pathname 可能是 `/posts`）。改导航/顶栏页名时必须断言 `/posts` 与 `/posts/` 得到同一页名、同一激活态，否则水合首帧文本会抖动；优先直接对 `isNavItemActive` / `resolveNavLabel` 纯函数断言，不要只依赖某个页面的 DOM 间接覆盖。
12. **视觉回归（PostCard / Posts）**：视觉重构的测试锁结构与可访问语义，不锁整段 className：断言普通与精选卡片标题**都是 `h2`**（列表页没有 `h2` 区块，避免 `h1 → h3` 跳级；Search 桌面网格同样适用），标签最多 3 个且是纯文字链接，分享回调仍触发，分类 tab 的 `aria-pressed`，单排序按钮的 `aria-pressed` / `aria-label`，继续阅读横条保留进度与「继续 / 放弃」操作，骨架与条目结构同构。**PostCard 同时服务 `/search` 桌面三列网格**，改布局必须同时跑 Search 的桌面网格用例，不能只测 `/posts`。

## 常见陷阱

- jsdom 无 canvas/IntersectionObserver/matchMedia：按既有 stub 模式处理，不视为问题；
- 修改测试基建（setup/vitest 配置）需全量回归（101 文件）；
- 模块级缓存（如 busuanzi 的 lastResponse、routeData 的单例、siteStatusStore 的订阅者/timer/快照）
  会跨用例共享：测试「无缓存」「无残留订阅」前提必须用 vi.resetModules 隔离或改为验证真实行为；
- `sessionStorage` 节流与 fake timers 配合时，`vi.setSystemTime` 与 `advanceTimersByTime` 要分开控制，
  beforeEach 清空存储、afterEach `vi.useRealTimers()`，否则上一个用例的提示窗口会漏到下一个；
- 视觉重构只跑单个页面测试：`PostCard` 被 Posts/Search 共用，改布局至少同时跑
  `src/components/PostCard.test.tsx`、`src/pages/Posts.test.tsx`、`src/pages/Search.test.tsx`；
- 用整段 className 快照锁视觉：Tailwind 类序/合并方式一改就红，且看不出行为回归；用角色、文案、
  关键结构类断言；
- 尾斜杠只在 Router 层测：`normalizePathname` 是纯函数，直接在 `siteNav` 层断言 `/posts` 与
  `/posts/` 等价，比在页面里造两种 URL 更稳定；
- 等待动画/异步完成禁用裸 setTimeout（Layout 的 600ms sleep、SlideModal 的
  50ms 均曾为此类）——用 waitFor 轮询状态或 fake timers + advanceTimersByTime；
- URL 等静态方法的 mock 用 vi.spyOn（可被 restoreAllMocks 恢复），勿用
  Object.defineProperty 覆写（无法恢复，违反 mock 纪律）。

## 破例条款

> 本文件规则为硬性约束。当 AI 认为有必要打破其中任何一条规则时，必须**先向用户说明理由并请求授权**；在获得用户明确准许之前，不得违反规则实现功能、修改代码或修改本文件。获准后应在提交信息中注明依据的授权。
