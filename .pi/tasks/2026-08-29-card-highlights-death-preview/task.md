# 任务：卡牌可用提示、预览尺寸与攻击死亡预告

## 目标与决策

- 英雄头像与英雄技能 inspection 预览采用战场卡牌预览的同等放大尺寸，保留各自原画与实时公开属性。
- 手牌可使用卡牌与战场可攻击随从显示绿色环；手牌中带可触发效果的卡牌显示金黄色环，状态来源继续使用 legal action 与卡牌定义。
- 攻击动作生成可复用的预期死亡实体列表，双方战场随从都依据该结果显示骷髅预告标记；UI 继续消费 projection/action 数据。
- 敌我牌库尺寸扩大约一倍，保持数量、空牌库、悬停与键盘可访问性。

## 计划

1. 阅读 GameBoard、legalActions、战斗结算与牌库 CSS，确认最小实现和现有契约。
2. 扩展攻击 action 的预期死亡结果，接入卡牌状态 class/marker、英雄/技能预览尺寸和牌库尺寸。
3. 更新组件/M1/引擎测试，运行目标测试、typecheck、lint、architecture、build 和双视口浏览器检查。

## 验证记录

- `pnpm exec vitest run --config vitest.config.ts src/engine/legalActions.test.ts src/ui/game/GameBoard.test.tsx`：20/20 通过；新增战斗双方死亡预告、可用/可攻击/特效状态和英雄/技能大预览契约通过。
- `pnpm test`：26 个测试通过；`pnpm exec vitest run --config vitest.browser.config.ts`：1/1 通过。
- `pnpm run typecheck`、`pnpm run lint`、`pnpm run test:architecture`：全部通过；`pnpm run build`：141 modules 构建成功。
- `pnpm exec playwright test --project=m1-chromium`：12/12 通过；最新构建产物覆盖英雄/技能 card-only 大预览、牌库几何与既有双视口布局契约。
- 真实浏览器检查：1280×720 下手牌可用卡牌出现金色环、可攻击战场随从出现绿色环，牌库牌背宽约 120px；390×844 下牌库牌背宽约 88px、`scrollWidth=390`，console errors=0；组件 DOM 检查确认双方攻击涉及的随从均能挂载骷髅预告标记。
- `git diff --check`：通过。

## 结论

- 完成本轮四项 UI 契约：英雄/技能 inspection 预览与战场卡面同级放大；可用、可攻击、可触发效果卡牌分层高亮；攻击 action 预计算双方预计死亡随从并显示骷髅标记；双方牌库牌背按响应式尺寸约放大一倍。
- 预期死亡计算复用共享战斗攻击力规则，覆盖武器攻击与剧毒伤害，UI 继续消费 legal action/public projection 数据；工作区维持未提交状态。
