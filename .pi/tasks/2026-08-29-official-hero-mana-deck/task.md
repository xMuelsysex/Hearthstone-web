# 按官方参考图重做英雄头像、法力水晶与牌库

## 目标与决策

- 依据主人提供的官方战场截图，重做双方英雄头像、英雄技能、法力水晶和牌库的视觉层。
- 英雄头像保持双方水平对称居中，使用官方本地英雄卡图裁切人物区域，叠加竖向金色拱形框与实时生命宝石。
- 英雄技能固定在头像右侧，使用官方本地技能图的圆形艺术区域与金色边框，保留实时费用与可交互/可检查语义。
- 法力水晶采用参考图的蓝色椭圆水晶视觉，当前/最大/临时法力继续来自公开投影；牌库使用本地官方牌背并区分有牌/空牌，保留公开数量悬停与键盘聚焦。
- 保持 `data-event-key`、拖拽、inspection、教程和现有公开 projection 契约；不修改 engine、M2、日志或存储。

## 计划

1. 读取参考图、现有 Hero/DeckTracker DOM、官方本地英雄/技能/牌背素材与现有测试契约。
2. 以最小 DOM 变更重做英雄拱形框、技能圆形框、官方风格法力水晶和右缘牌库叠层。
3. 补充目标组件与浏览器几何/状态断言，验证桌面与 390px 响应式。
4. 执行目标 Vitest、typecheck、lint、architecture、build、M1/M3/M4 Chromium 和 console 检查。

## 验证记录

- `pnpm run build`：通过，Vite 140 modules。
- `pnpm exec vitest run src/ui/game/GameBoard.test.tsx src/ui/card/CardPreview.test.tsx src/app/App.test.tsx`：3 files / 17 tests 通过。
- `pnpm run typecheck`、`pnpm run lint`、`pnpm run test:architecture`：全部通过。
- M1 Chromium：11/11 通过；M3/M4 Chromium：2/2 通过。
- 真实浏览器复核：1280×720、1920×1080 页面滚动尺寸等于视口，英雄头像中心线一致，技能位于头像右侧，法力位于技能右侧，牌库牌背与数量可见；390px 保持头像、技能、法力、牌库和结束回合可用，横向滚动尺寸等于视口宽度。
- 牌库悬停提示显示公开手牌/牌库数量；浏览器 console errors=0。
- 最终修复移动端旧 `grid-row`/绝对定位继承：390px 实测头像与技能同排、法力独立下排，`scrollWidth=390` 与 viewport 一致；修复后重新执行 build、M1 11/11、M3/M4 2/2，全部通过。

## 结论

已依据主人提供的官方参考图完成英雄头像、英雄技能、法力水晶和牌库视觉重做。视觉层复用项目已有本地英雄图、英雄技能图和官方牌背，实时数据与交互契约保持不变。
