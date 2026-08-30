# 任务：预览属性数值与英雄技能指向箭头

## 目标与决策

- 放大战场预览卡面上的费用、攻击、生命等实时数值，使其在 440px 桌面预览与 300px 移动端预览中清晰可读。
- 对具有目标选择的英雄技能复用现有拖拽箭头层；目标判定继续使用 `USE_HERO_POWER` legal action 与现有 drop target。
- 无目标英雄技能保持点击、键盘激活和普通拖拽行为；公开 projection、可访问性与现有素材兜底保持稳定。

## 计划

1. 定位战场预览属性层、英雄技能拖拽状态、目标动作和现有测试契约。
2. 调整预览属性视觉比例，接入 HERO_POWER 目标箭头及对应样式。
3. 更新组件/M1 测试，运行目标测试、typecheck、lint、architecture、build 和双视口浏览器检查。

## 验证记录

- `pnpm exec vitest run src/ui/game/GameBoard.test.tsx`：15/15 通过。
- `pnpm run typecheck`、`pnpm run lint`、`pnpm run test:architecture`：全部通过；初次尝试的 `pnpm run architecture` 不存在，已按项目脚本修正为 `test:architecture`。
- `pnpm run build`：140 modules 构建通过。
- `pnpm exec playwright test e2e/m1.spec.ts --project=m1-chromium`：12/12 通过，包含目标型英雄技能箭头与预览数字可读性断言。
- Playwright 实测：桌面预览 440px，费用/攻击/生命字体约 33/25/25px；390px 预览 300px，字体约 29/24/24px，`scrollWidth=375`，说明面板节点数为 0；目标型英雄技能在拖拽起始即显示 `hero-power` 箭头，指向对手英雄时 `data-arrow-valid=true`，拖拽副本不存在；console errors 为 0。

## 结论

- 战场预览卡面的费用、攻击、生命数值已按大尺寸预览同步放大。
- 目标型英雄技能已复用现有 legal action、drop target 和 SVG 箭头层；无目标技能保留原有激活和普通拖拽行为。
