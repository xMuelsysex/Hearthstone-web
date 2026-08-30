# 任务：法力水晶靠近手牌并重做炉石式水晶托盘

## 目标与决策

- 将双方法力托盘从英雄条移动到各自手牌附近，玩家托盘贴近手牌上缘，保持双方公开法力状态可见。
- 将单一胶囊改为炉石式完整托盘：当前/最大法力数值、逐颗永久水晶、已用空槽、可用亮槽、临时水晶分别呈现。
- 托盘只消费现有公开 projection 的 `current`、`maximum`、`temporary`；不修改 engine、动作、日志或存储契约。
- 通过数据属性保留 `data-mana-current`、`data-mana-max`、`data-mana-temporary`，用单一 `ManaTray` 组件生成水晶状态，避免重复事实来源。

## 计划

1. 阅读现有 Hero/手牌 DOM、响应式布局和法力测试契约，核对官方式视觉可复用边界。
2. 提取 `ManaTray`，移动至双方手牌附近，并用 CSS 实现逐颗水晶及临时/空槽状态。
3. 更新组件与 M1 几何/状态断言，运行目标测试、typecheck、lint、architecture、build 和双视口浏览器检查。

## 验证记录

- `pnpm exec vitest run src/ui/game/GameBoard.test.tsx --config vitest.config.ts`：15/15 通过；覆盖永久槽亮灭、临时槽数量与数据属性。
- `pnpm run typecheck`、`pnpm run lint`、`pnpm run test:architecture`：全部通过。
- `pnpm run build`：Vite 140 modules 构建通过；重建 `.artifacts/dist` 后 `pnpm exec playwright test e2e/m1.spec.ts --project=m1-chromium`：12/12 通过。
- Playwright 实测 1280×720 与 390×844：双方托盘分别位于手牌内/手牌上缘，逐颗水晶可见；390px `scrollWidth=375`，console errors=0。截图证据：`artifacts-mana-tray-1280-final.png`、`artifacts-mana-tray-390-final-player.png`。

## 结论

- `ManaTray` 统一生成当前/最大法力、永久亮槽、永久空槽与临时水晶，并继续消费公开 projection 的三项法力数据。
- 双方托盘已移到各自手牌附近，桌面与移动端响应式定位稳定；engine、动作、日志与存储契约保持原样。
