# 任务：战场预览放大与拖拽卡牌可见性

## 目标与决策

- 将战场卡牌 inspection 预览放大至少一倍并继续向视口左侧调整。
- 战场预览只展示放大的卡牌面，移除重复的名称、数值与关键词说明面板。
- 箭头目标指向模式仅保留箭头视觉，隐藏跟随指针的拖拽卡牌副本。
- 手牌卡牌完整移出手牌区后隐藏原手牌卡；卡牌仍在手牌区时继续保留正常预览与原卡面。

## 计划

1. 检查现有 `InspectionLayer`、拖拽状态、手牌渲染和对应 CSS/测试。
2. 实现战场纯卡图预览、尺寸/定位调整、箭头模式与原手牌可见性联动。
3. 运行目标组件测试、typecheck、lint、build、architecture 与 M1，并完成桌面/移动端浏览器检查。

## 验证记录

- `pnpm exec vitest run src/ui/game/GameBoard.test.tsx`：14/14 通过，覆盖战场纯卡面预览、手牌离手隐藏与箭头拖拽状态。
- `pnpm run typecheck`、`pnpm run lint`、`pnpm run test:architecture`：全部通过。
- `pnpm run build`：Vite 构建通过，140 modules。
- `pnpm exec playwright test e2e/m1.spec.ts --project=m1-chromium`：11/11 通过，覆盖法术/攻击箭头、拖拽副本可见性、公开 inspection 与双视口布局。
- 真实浏览器检查：1280×720 预览宽 440px、中心约为视口 22%，835px 左缘为 0；390×844 预览宽 300px、`scrollWidth=375`、说明节点数 0；浏览器 console errors=0。

## 结论

- `InspectionLayer` 对战场随从使用 `card-only` presentation，仅渲染放大的完整卡面；桌面尺寸为 440px 并左移到约 22% 中线，移动端尺寸为 300px。
- `GameBoard` 在箭头状态下仅保留 SVG 指向箭头；手牌源卡按当前拖拽指针与源卡实际边界切换 `visibility`，回到源卡区域立即恢复。
- M1 辅助函数同步校验手牌起始阶段无箭头、攻击起始阶段无拖拽副本，原有 action descriptor、公开数据与可访问性保持稳定。
