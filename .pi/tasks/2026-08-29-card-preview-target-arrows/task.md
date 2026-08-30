# 任务：卡牌预览定位与目标箭头

## 目标与决策

- 目标：将战场卡牌预览移动到左侧约 30%—70% 的区域；手牌预览在当前指向卡牌的位置放大显示。
- 手牌卡牌完全移出手牌区后进入目标指向状态，显示从该卡牌到目标的箭头；卡牌留在手牌区时继续显示放大预览。
- 战场卡牌发动攻击时直接显示攻击箭头。
- 保留公开 action、拖拽跟手、卡牌数据、可访问性与现有 fallback 契约；保持最小交互层改动。

## 计划

1. 定位卡牌预览、拖拽指针状态、攻击/法术目标动作与现有 e2e/组件断言。
2. 分离 hand-hover preview、hand-drag targeting、battlefield attack targeting 状态，加入箭头层和左侧预览定位。
3. 运行目标组件测试、typecheck、lint、build、architecture 与 M1，并用 Playwright 检查桌面/移动端几何和箭头状态。

## 验证记录

- `pnpm exec vitest run src/ui/game/GameBoard.test.tsx`：14/14 通过，覆盖手牌预览跟随指针、离手后法术箭头、回到手牌后箭头收回、战场攻击箭头。
- `pnpm run typecheck`、`pnpm run lint`、`pnpm run test:architecture`：全部通过。
- `pnpm run build`：Vite 构建通过，140 modules。
- `pnpm exec playwright test e2e/m1.spec.ts --project=m1-chromium`：11/11 通过；真实浏览器确认法术/攻击箭头和左右预览断言。
- 真实浏览器 1280×720：战场预览中心约位于视口 30% 处；390×844：手牌预览覆盖当前卡牌、`scrollWidth=375`，浏览器 console errors=0。

## 结论

- `GameBoard` 保持现有 action descriptor 作为拖拽合法性来源，新增固定 SVG 箭头投影；手牌法术依据卡牌完整离开手牌区后显示箭头，战场可攻击卡牌按下即显示箭头。
- inspection source 增加 hand/board 模式：手牌预览跟随当前指针放大，战场预览固定到左侧约 30% 位置，Discover 预览继续使用对话框内布局。
