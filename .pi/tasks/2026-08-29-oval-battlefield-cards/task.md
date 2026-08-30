# 任务：英雄框与对战区椭圆原画卡

## 目标与决策

- 目标：移除英雄头像与英雄技能周围的多重装饰框，将对战区卡牌改为示例图风格的椭圆原画卡。
- 视觉层调整，保留公开 projection、攻击/生命实时值、拖拽/点击/键盘交互、手牌与 Discover 卡面契约。
- 对战区原画优先使用 HearthstoneJSON 的 `orig/{CARD_ID}.png` 本地资源；复用现有卡牌渲染图作为资源边界内的 fallback。
- 英雄头像与技能保留图片裁切、生命/费用徽章和可访问性状态，移除 CSS 额外外围边框与多重阴影。

## 计划

1. 检查示例图、现有英雄/技能/战场卡 DOM 与素材来源。
2. 为实际展示战场随从补本地原画，更新 `GameBoard.tsx` 与 `theme.css` 的视觉结构。
3. 更新目标测试，运行组件测试、typecheck、lint、build、M1 与真实浏览器视觉检查。

## 验证记录

- `pnpm exec vitest run 'src/ui/game/GameBoard.test.tsx'`：1 file / 11 tests 通过。
- `pnpm run typecheck`：通过。
- `pnpm run lint`：通过。
- `pnpm run test:architecture`：single-writer、projection/runtime boundary、replay/compatibility 全部 PASS。
- `pnpm run build`：通过，Vite 转换 140 modules。
- `pnpm exec playwright test e2e/m1.spec.ts --project=m1-chromium`：11/11 通过。
- 浏览器复核：1280×720 下英雄和技能使用无框原画，战场卡牌使用椭圆原画与两侧攻击/生命宝石；390×844 下 `scrollWidth=375 <= innerWidth=390`，无横向溢出；console errors=0。
- 资源校验：manifest JSON 有效，7 个原画资源（3 张战场卡、2 个英雄、2 个英雄技能）均存在且带 64 位 SHA-256。

## 结论

- `GameBoard.tsx` 通过 HearthstoneJSON `orig` 原画路径与渲染图 fallback，英雄、英雄技能和战场卡牌保持公开数据、交互与失败可见性。
- `theme.css` 移除英雄/技能外围 CSS 框层，把战场卡牌裁切为椭圆原画，并保留实时属性宝石与响应式尺寸。
- `src/assets/manifest.ts`、`public/assets/source-manifest.v1.json` 与 `scripts/freeze-assets.mjs` 同步记录并生成原画资源来源。
