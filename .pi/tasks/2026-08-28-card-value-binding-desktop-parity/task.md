# 卡牌数值绑定与桌面端一致性审计

## 目标与决策

- 全面审计战场 UI 中所有可见数值，确认每个数值都绑定到当前公开投影或明确的卡牌 registry 字段。
- 优先复用现有 `PublicEntityViewModel`、`PlayerViewModel` 与 `CardDefinitionV1`，清理静态/空闲/重复显示值。
- 保持 engine、M2、日志、存储、回放和 root evidence tree 隔离；只修改候选树 UI、测试与必要的证据记录。
- 目标视觉行为对齐炉石传说桌面端：实时费用、攻击、生命/最大生命、护甲、武器攻击/耐久、法力水晶、牌库/手牌数量，以及状态变化的颜色和层级。

## 计划

1. 审计 `GameBoard.tsx`、投影类型、卡牌 registry、CSS 和现有测试，建立数值来源→DOM→视觉元素清单。
2. 并行复核遗漏项、静态烘焙值、英雄/武器/资源数值和桌面端可见层级，确认最小实现方案。
3. 在 `GameBoard.tsx` 与必要测试中补齐所有可见数值的实时绑定和状态样式，保持公开信息边界。
4. 运行目标 Vitest、typecheck、lint、architecture、build，以及 m1/m3/m4 浏览器回归；复核范围和候选树隔离。

## 验证记录

- 组件目标测试：`pnpm exec vitest run src/ui/game/GameBoard.test.tsx src/app/App.test.tsx`，2 个文件 / 13 个测试通过；修正了预期中同步后的耐久最大值文案。
- 全量单元测试：`pnpm test`，25 个文件 / 72 个测试通过。
- 静态门禁：`pnpm run typecheck`、`pnpm run lint`、`pnpm run test:architecture`、`pnpm run build` 全部通过；architecture 三项 enforcement 均 PASS，生产包 139 modules。
- 浏览器门禁：最终构建后的 `m1-chromium` 9/9、`m3-chromium` 1/1、`m4-chromium` 1/1 共 11/11 通过，覆盖素材阻断时的英雄技能费用宝石、Discover dialog 和 V2 compatibility；浏览器复用已有 4174 预览服务，测试后已将 `playwright.config.ts` 的 `reuseExistingServer` 恢复为 `false`。
- 真实浏览器复核确认英雄技能图标已裁切到中央艺术区，卡牌费用/攻击/生命宝石、动态 inspection 和响应式布局正常；未停止现有本地预览服务。

## 结论

- `GameBoard.tsx` 现在以单一 `CardFace` 复用卡面数字层，所有可见卡牌费用、攻击、生命/耐久及最大值均来自 registry 或当前公开 projection。
- 武器 HUD 不再暴露整张卡图中的烘焙费用/攻击/耐久，改为中央艺术裁切 + 实时攻击/耐久宝石；英雄技能采用同样的中央艺术裁切 + registry 费用宝石。
- 英雄条新增实际攻击总值（英雄自身攻击 + 武器攻击）和实时护甲宝石，inspection 对英雄、随从、武器、法术、英雄技能按类型显示对应数值，消除了 `攻击 0 · 生命 0/0`；最终收紧武器/英雄技能中央艺术裁切，排除卡图标题带。
- 修改范围保持在候选树的 UI、测试和任务记录；engine、M2、日志、存储、回放及 root evidence tree 未改动。
