# 桌面战场 UI 重构

## 目标与决策

- 将对局界面重构为覆盖 viewport 的桌面式战场，使用 CSS 绘制竞技场背景，移除棋盘背景贴图。
- 将双方手牌放到各自英雄下方，使用动态扇形布局；保留现有 `.player-hand`、拖拽目标与事件 marker 契约。
- 将英雄改为 CSS 角色面板，显示由 `PlayerViewModel` 驱动的当前生命、最大生命和可视血条。
- 将教程提示改为浮动 coach card，继续沿用既有 tutorial 状态机和逐步 action 过滤。

## 计划

1. 重排 `GameBoard` DOM：对手英雄/手牌/战场与玩家战场/英雄/手牌分层，操作区和事件状态融入全屏战场。
2. 重写 `theme.css` 的 viewport、竞技场、英雄、双手扇形牌组、操作提示和响应式规则，清理 board image 依赖。
3. 添加或调整 UI 断言，验证动态血量、教程提示、扇形牌和桌面布局的关键 DOM 契约。
4. 运行目标测试、类型检查、lint、构建与 Chromium E2E，并记录结果。

## 验证记录

- 2026-08-24：已完成 knowledge gate；相关 project knowledge 搜索无匹配 UI 规范，沿用现有 projection、tutorial、drag marker 契约。
- 2026-08-27：`pnpm test` 通过，24 个文件 / 63 个测试。
- 2026-08-27：`pnpm run test:browser` 通过，1/1；`pnpm run typecheck` 通过；`pnpm run lint` 通过。
- 2026-08-27：`pnpm run test:architecture` 通过，single-writer、projection/runtime boundary、replay/compatibility 三项均 PASS。
- 2026-08-27：`pnpm run build` 通过；`pnpm run test:e2e` 通过，16/16；M1 项目 5/5；1280×720 截图确认战场满屏、扇形手牌、动态血条和浮动 coach card。

## 结论

- 已完成：战场改为 CSS 绘制的 viewport 桌面布局，移除棋盘/英雄贴图依赖；双方手牌置于英雄下方并扇形排列；英雄生命以投影状态驱动徽章和血条；教程保持五步逐步引导并提供浮动提示；Discover 使用 fixed 高层原生 dialog；拖拽预览恢复为左侧放大跟随层。
- 已同步测试契约：拖拽 helper 等待动画完成与命令就绪，blocked-assets 用例验证 CSS 战场和动态英雄状态。
- M2 业务核心与单写入边界保持不变。
