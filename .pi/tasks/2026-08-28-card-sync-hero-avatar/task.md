# 卡牌实时属性与官方英雄头像

## 目标与决策

- 修复卡牌 UI 显示值与公开投影实时属性不同步的视觉问题。
- 保留 engine 与 `PublicEntityViewModel` 作为唯一权威来源；UI 从 `entity.attack`、`entity.health`、`entity.maxHealth` 渲染当前值，从卡牌 registry 渲染静态费用与基准值。
- 继续使用仓库已有的官方中文 HearthstoneJSON 卡图和英雄图；英雄头像通过 CSS 从官方英雄卡图裁出官方人物视窗，避免新增外部来源或第二套素材。
- 保持 M2、日志、存储、回放和规则引擎冻结边界。

## 计划

1. 补齐 `GameBoard` 卡牌实时费用、攻击、生命、基准/变化状态与可审计 data 属性，确保动态值盖住官方卡图中的烘焙旧数字。
2. 调整英雄头像裁切、边框、生命宝石与状态层，移除字母 sigil 对官方人物图的遮挡。
3. 增加组件契约，覆盖磁力/受伤等变化值以及英雄头像素材视窗。
4. 运行 focused Vitest、typecheck、lint、build 和受影响的浏览器 gate；复核 diff 与候选树隔离边界。

## 验证记录

- `pnpm test -- src/ui/game/GameBoard.test.tsx`：Vitest 实际运行 25 个文件 / 71 个测试，全部通过。
- `pnpm run typecheck`：通过。
- `pnpm exec eslint src/ui/game/GameBoard.tsx src/ui/game/GameBoard.test.tsx e2e/m1.spec.ts`：通过。
- `pnpm run build`：Vite 139 modules 构建通过。
- `pnpm run test:architecture`：single-writer、projection/runtime boundary、replay/compatibility 全部 PASS。
- m1 Chromium：9/9 通过，新增真实磁力合体断言确认 `BOT_309` 从 `1/5` 更新为 `7/10`。
- m3/m4 Chromium：2/2 通过，Discover dialog 与 V2 compatibility gate 保持通过。
- 浏览器 DOM 核验：英雄图继续使用 `/assets/heroes/HERO_01.png` 与 `/assets/heroes/HERO_08.png`，通过 `.hero-art-window` 裁切为官方人物视窗；卡牌费用、攻击、生命/耐久均带实时 data 属性与视觉宝石。

## 结论

卡牌视觉值现在从最新公开 projection 渲染：随从使用当前攻击与生命、武器使用当前耐久，检查浮层按实体 ID 重取更新后的 projection，避免旧对象残留。英雄头像复用已有官方中文英雄卡图并精确裁切人物区域，移除 W/M 占位字母，加入原版风格头像框和生命宝石；engine、M2、日志、存储与 root evidence tree 均保持隔离。
