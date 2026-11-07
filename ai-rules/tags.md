# 标签页（Tags，`/tags`）— 已退役

## 状态：已退役（2026-11 用户确认）

独立标签页 `/tags` 已删除，**不要恢复**。标签浏览能力全部并入文章列表页 `/posts`：

- 桌面：文章列表右侧 `TagsPanel` sticky 标签卡片；移动端：贴右侧中部的「标签」按钮 + 侧板弹窗。
- 标签筛选使用 `?tag=` 参数（如 `/posts?tag=React`），与分类/搜索/排序/分页可叠加；非法 tag 从 URL 清理。
- 标签链接（`PostCard`、旧内容里的标签链接）统一指向 `/posts?tag=<encoded>`，不再指向 `/tags?tag=`。
- 独立标签页的视觉/交互规则已迁入 [文章页](posts.md)：标签面板的标签项是**同一页面内的筛选 toggle**，因此 `aria-pressed` 合法且应保留；旧标签云「导航视图切换」的语义已随页面退役作废。

## 旧 URL 契约

- `public/_redirects`：`/tags` 与 `/tags/*` 都 301 到 `/posts`（标签参数由客户端兜底转交）。
- `src/App.tsx` 的 `TagsRedirect`：把 `/tags?tag=X` 转到 `/posts?tag=X`，无 tag 时转 `/posts`。
- `config/routes.mjs` 的 `/tags` 条目只保留 SPA 重定向兜底（`sw: true`，**无 `ssg` / `sitemap` / `preload`**）；不得把它改回可预渲染页面。
- 侧栏「标签」导航项已删除；顶栏/命令面板搜索入口仍在，标签入口只在文章列表。

## 修改规则（必须遵守）

1. **不恢复独立标签页**：不新建 `src/pages/Tags.tsx`、不恢复 `/tags` 的 SSG/sitemap/导航项；需要标签能力就改 `/posts` 的 `TagsPanel` 与 `?tag=` 逻辑（见 [文章页](posts.md)）。
2. **旧链接继续可用**：`_redirects` 与 `TagsRedirect` 必须成对保留；删除任一侧都会让已索引的 `/tags?tag=` 外链失效。
3. **测试断言跟着改**：`Tags.test.tsx` 已随页面删除；相关覆盖落在 `Posts.test.tsx`（标签筛选/清除）与 `TagsPanel` 交互。不要再为独立标签页写测试。
4. **入站链接口径**：全站标签链接一律 `/posts?tag=`；发现 `/tags?tag=` 的新代码按 bug 处理。

## 破例条款

> 本文件规则为硬性约束。当 AI 认为有必要打破其中任何一条规则时，必须**先向用户说明理由并请求授权**；在获得用户明确准许之前，不得违反规则实现功能、修改代码或修改本文件。获准后应在提交信息中注明依据的授权。
