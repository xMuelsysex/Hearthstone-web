# 战场全屏、ESC 设置空壳与动作区收敛

## 目标与决策

- 收口此前确认的战场 UI 需求：动作区正常回合只保留“结束回合”；认输进入 ESC 打开的设置空壳；关键词进度、最近结算和状态消息作为右上角浮窗；桌面战场铺满浏览器视口。
- 保留换牌阶段的必要“确认换牌”动作，保留现有 `data-event-key`、拖拽和 Discover 真 dialog 契约。
- 卡牌外围容器去除矩形边线与容器阴影，放大桌面/窄屏卡牌尺寸；卡牌预览的原图全文与动态费用/攻击/生命方案保持独立。

## 计划

1. 复核 GameBoard、App 挂载点、主题 CSS、组件测试和 M1/M3/M4 浏览器契约。
2. 在 `GameBoard.tsx` 增加设置 dialog 生命周期与 ESC 入口，收敛 action panel 内容。
3. 在 `theme.css` 将桌面布局切换为 viewport 全屏，状态区右上浮窗化，移除卡牌外围边线并放大卡牌；保留移动端单列。
4. 补组件与 E2E 契约，执行目标测试、类型检查、lint、build 和定向浏览器验收。

## 验证记录

- `pnpm exec vitest run src/ui/game/GameBoard.test.tsx src/ui/card/CardPreview.test.tsx`：2 个文件 / 12 个测试通过。
- `pnpm run typecheck`：通过。
- `pnpm run lint`：通过。
- `pnpm run build`：通过。
- M1 Chromium：原始 8 个用例通过；修正换牌阶段同步点后的 2 个受影响用例通过，合计 10/10。
- M3/M4 Chromium 定向门禁：2/2 通过。
- 真实浏览器：1280×720 与 1920×1080 的 shell/board 均覆盖视口，文档滚动尺寸等于视口；390px 窄屏无横向溢出，英雄技能和结束回合保留。
- 真实浏览器：ESC 打开 `dialog[aria-label="设置"]`，设置内认输提交 `CONCEDE` 后状态显示“失败 · CONCEDE”；控制台错误 0。

## 结论

战场剩余 UI 需求已在候选树完成：桌面全屏、右上状态浮窗、动作区收敛、ESC 设置空壳、认输入口、卡牌外围边线移除和卡牌放大。改动集中在 `src/ui/game/GameBoard.tsx`、`src/ui/theme.css`、`src/ui/game/GameBoard.test.tsx` 与 `e2e/m1.spec.ts`。
