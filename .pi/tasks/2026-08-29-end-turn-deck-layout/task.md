# 结束回合与双方牌库位置调整

## 目标与决策

- 将正常回合的“结束回合”按钮放在战场整体高度的 50% 附近。
- 复用现有公开投影驱动的 `DeckTracker`，在桌面右侧形成“对手牌库 — 结束回合 — 我方牌库”的垂直排列。
- 保留结束回合命令派发、牌库数量/空牌状态、悬停与键盘聚焦语义；移动端继续保持可滚动和可操作。
- 当前工作区已有上一轮战场布局的未提交修改，后续只在其上追加本次范围内的改动。

## 计划

1. 检查 `GameBoard.tsx`、`theme.css`、组件契约和 M1 几何检查，确认现有 DOM 与响应式约束。
2. 将牌库与回合控制合并到右侧场景控制容器，调整桌面垂直居中与移动端堆叠样式。
3. 更新聚焦组件/E2E 几何断言，验证按钮中心线、双方牌库相对顺序、状态栏与 390px 无溢出。
4. 运行目标 Vitest、typecheck、lint、architecture、build 与必要的 Chromium 几何检查，复核 diff 并补流水。

## 验证记录

- `pnpm exec vitest run src/ui/game/GameBoard.test.tsx`：1 file / 11 tests 通过。
- `pnpm run typecheck`：通过。
- `pnpm run lint`：通过。
- `pnpm run test:architecture`：single-writer、projection/runtime boundary、replay/compatibility 全部 PASS。
- `pnpm run build`：通过，Vite 转换 140 modules。
- `pnpm exec playwright test e2e/m1.spec.ts --project=m1-chromium`：11/11 通过；包含桌面 1280×720、1920×1080 几何与牌库悬停交互。
- 浏览器复核：1280×720 正常回合结束回合按钮中心约为 y=360.5，接近视口高度 50%；对手牌库在按钮上方、我方牌库在按钮下方；390px `scrollWidth <= innerWidth`，控制区保持可操作；console errors=0。
- M1 首次完整运行中的两处旧文本断言因控制区新增牌库文本而失败，已将断言收窄至 `.scene-turn-control`，最终完整运行 11/11 通过。

## 结论

- `GameBoard.tsx` 将同一组 `DeckTracker` 数据源移入场景控制区，形成对手牌库—结束回合—我方牌库的垂直结构。
- `theme.css` 让桌面场景控制垂直居中，移动端沿用可滚动的纵向控制区；公开数量、空牌状态、悬停/聚焦语义和结束回合派发保持不变。
- `GameBoard.test.tsx` 与 `e2e/m1.spec.ts` 新增控制区顺序和 50% 高度几何契约。
