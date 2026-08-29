# 项目流水

## 2026-08-29 · 按官方参考图重做英雄头像、法力水晶与牌库

- 读取主人提供的官方战场截图，按其核心结构重做英雄区：头像使用官方本地英雄图裁切并叠加竖向金色拱形框，实时生命宝石保持公开 projection 驱动。
- 英雄技能改为头像右侧的大型金色圆形框，技能费用继续使用 registry 动态值；法力改为技能右侧的蓝色椭圆水晶，并保留 current/max/temporary 数据标记。
- 牌库改为无矩形面板的官方牌背叠层，牌背尺寸、边框、叠卡和数量宝石按参考图收敛；`has-cards`/`empty` 状态与悬停/键盘聚焦公开数量保持不变。
- 移动端保留英雄、技能、法力、牌库和结束回合的可用性；组件测试 3 files / 17 tests、typecheck、lint、architecture、build、M1 11/11、M3/M4 2/2 通过，1280×720/1920×1080/390px 浏览器检查通过，console errors=0。

## 2026-08-28 · 全部卡牌统一、英雄居中与牌库状态

- `GameBoard` 的共享 `CardFace` 统一覆盖手牌、战场、Discover、拖拽预览和 inspection：完整官方卡图作为连续底图，原始卡名/效果文字保留，费用/攻击/生命或武器耐久由实时公开 projection 覆盖；移除重复自制文本层。
- 双方英雄改为三列对称结构，头像位于英雄条水平中心，英雄技能固定在头像右侧；英雄条保留实时生命/攻击/护甲与现有官方人物裁切视窗。
- 法力区按锁定官方参考图的蓝色水晶胶囊视觉重建，`data-mana-current`/`data-mana-max`/`data-mana-temporary` 绑定公开法力投影；右侧新增本地官方牌背牌库面板，分别展示对手与玩家牌库。
- `data-deck-state` 区分 `has-cards`/`empty`，悬停或键盘聚焦显示公开手牌与牌库数量，空牌状态使用灰化牌背与“空牌库”标签。
- 新增 GameBoard 卡面/牌库/英雄布局契约，更新 App 集成测试以同步换牌阶段。验证：GameBoard+CardPreview 13/13、App 4/4、typecheck、lint、architecture、build、M1 11/11、M3/M4 2/2；1280×720、1920×1080、390px 真实浏览器检查通过，console errors=0。
- 主人确认后已删除根目录本轮生成的 4 个临时截图，候选树代码、测试和证据记录保持不变。

## 2026-08-28 · 战场全屏与 ESC 设置空壳

- 收口战场剩余 UI：桌面 `.hearth-board` 覆盖完整 viewport，动作区正常回合仅保留“结束回合”，换牌阶段保留必要的“确认换牌”。移除动作区拖动指引、认输按钮和卡牌外围矩形边线，放大战场/手牌卡牌。
- `GameBoard` 增加全局 ESC 设置 dialog 生命周期；设置空壳保留认输与关闭按钮，认输通过既有 `CONCEDE` 命令链提交。关键词进度、最近结算和状态消息集中为右上角浮窗，移动端保留单列布局。
- 新增组件契约覆盖 action panel 与 ESC 设置；M1 调整换牌阶段同步点。验证：目标 Vitest、typecheck、lint、build、M1 10/10、M3/M4 2/2 通过；1280×720、1920×1080 无页面滚动，390px 无横向溢出，真实 ESC 认输显示“失败 · CONCEDE”，控制台错误 0。

## 2026-08-28 · 分层卡牌原型预览

## 2026-08-28 · 分层卡牌原型预览

- 新增 `src/ui/card/CardPreview.tsx` 与 `src/ui/card/CardPreview.test.tsx`，以真实 `CS2_196`「剃刀猎手」验证官方卡框/原画/原始效果文字完整保留，以及费用/攻击/生命三处独立动态层。
- `App` 新增 `?card-preview` 预览入口；样式覆盖桌面卡牌工作台、原始卡面完整展示、三处局部动态覆盖、21% 费用水晶覆盖、攻击/生命装饰和 1280×720 一屏布局，现有展示战路径保持不变。
- 验证：目标 Vitest 2 文件 / 6 测试、typecheck、lint、build 通过；真实浏览器 1280×720 动态值与滚动高度检查通过，费用动态值 4 的截图确认原费用已完全覆盖，原始效果文字无自定义正文层，控制台错误数为 0。

## 2026-08-28 · 卡牌数值桌面端绑定审计

- 完成战场 UI 数值审计：随从/武器卡面通过单一 `CardFace` 复用实时数值层；费用来自卡牌 registry，攻击、生命/最大生命、武器耐久来自当前公开 projection。
- 修复剩余桌面端数值脱离问题：武器 HUD 改为中央艺术裁切并覆盖实时攻击/耐久宝石，英雄技能改为中央艺术裁切并显示 registry 费用宝石，避免整张官方卡图中的烘焙旧数值继续可见。
- 英雄条新增实际攻击总值（英雄攻击 + 武器攻击）和护甲宝石；inspection 按 HERO/MINION/WEAPON/SPELL/HERO_POWER 类型显示对应费用或生命/耐久，消除技能/法术的虚假 `0/0`。
- 新增 GameBoard 组件回归契约与 M1 浏览器费用断言。验证：`pnpm test` 25 文件 / 72 测试、typecheck、lint、architecture、build、m1 9/9、m3/m4 2/2 全部通过。

## 2026-08-28 · 卡牌实时属性与官方英雄头像

- 修复 `src/ui/game/GameBoard.tsx` 的卡牌视觉同步：费用、攻击、随从当前生命/最大生命、武器真实耐久均由 registry + `PublicEntityViewModel` 渲染，新增蓝色费用宝石、攻击/生命实时宝石及 buff/受伤状态；官方整卡图保留为底图。
- 修复 inspection stale 状态：浮层按 `entity.id` 从当前公开 projection 重取，状态更新后不会继续显示旧的 attack/health/armor/durability；被移出公开视图的实体自动停止显示，Discover 选项保留当前选择实体。
- 英雄头像复用已有官方 HearthstoneJSON 中文英雄图，在 `.hero-art-window` 中裁切人物区域，移除 W/M 字母占位，补充金属头像框、生命宝石与稳定的公开实体标记。
- `src/ui/game/GameBoard.test.tsx` 新增实时检查浮层回归契约；`e2e/m1.spec.ts` 新增真实磁力合体断言，确认 `BOT_309` 从 `1/5` 变为 `7/10`。
- 验证：Vitest 25 文件 / 71 测试、typecheck、目标 lint、build、m1 Chromium 9/9、m3/m4 Chromium 2/2 全部通过；engine、M2、日志、存储与 root evidence tree 保持未改动。

## 2026-08-28 · 增量桌面战场 UI T3–T6 收口

- 新增 `src/ui/game/GameBoard.test.tsx`，以现有 Vitest harness 锁定公开 projection、隐藏手牌字段、inspection focus 优先级与清理、tooltip、Enter 惰性、hero power、End Turn/rail/tutorial marker 契约；focused 2 文件 / 9 测试通过。
- 扩展 `e2e/m1.spec.ts` 与 `e2e/m3.spec.ts`，覆盖 tutorial marker、public-only inspection、desktop 1280/1920 几何、390px 响应式、standard/reduced-motion settle marker、Discover true dialog 与 pending cleanup；targeted 10/10、full 22/22 通过。
- T6 after 截图与 bbox 已落盘，1280×720、1920×1080、390×844 经人工审阅 verdict=`accept`；八 gate 串行通过，完整 Vitest 25 文件 / 68 测试，browser 1/1，typecheck、lint、architecture、build、targeted E2E、full E2E 均有日志。
- `root-compare.json` 报告 72 个允许范围变更、outsideAllowed=0；107 个冻结文件哈希 0 mismatch。候选树继续隔离，未提交、未发布、未部署。

## 2026-08-27 · 桌面战场 UI 重构完成

## 2026-08-27 · 桌面战场 UI 重构完成

- 战场改为 CSS 绘制的 viewport 桌面布局，移除棋盘与英雄贴图依赖；双方手牌放置在各自英雄下方并使用扇形层叠布局。
- 英雄面板显示投影状态驱动的当前/最大生命、血量徽章与血条；教程继续使用真实状态机逐步引导，并以浮动 coach card 提示当前动作。
- Discover 原生 dialog 使用 fixed 高层、backdrop 与统一视觉样式；拖拽预览使用 fixed 放大层跟随指针，避免阻塞目标命中。
- 修正 E2E 拖拽 helper 的 ready 等待与资源阻断断言。验证：`pnpm test` 24/24 文件、63/63 测试，browser 1/1，typecheck、lint、architecture、build 通过，完整 Chromium E2E 16/16。

## 2026-08-24 — M0 + M1 纵向切片启动

- 已批准并开始执行 M0 + M1：React/TypeScript/Vite、纯 TypeScript 规则与场景引擎、玩家法师对旅店老板战士、五关键词确定性展示战、权威逐事件日志与本地持久化。
- HearthstoneJSON 数据冻结到数字 build `249896`、`zhCN`；完整响应 SHA-256 为 `0a48530c48e0c15995790fcbed4d6e07474d8d1cf1c18eaaad8f2f0c1d3a3c`。
- 项目命令固定通过 x-cmd 的 Node `v22.22.0` 执行；宿主默认 Node 为 v26.7.0。
- 本轮不初始化 Git、不提交、不部署、不发布。
- 任务记录：`.pi/tasks/2026-08-24-m0-m1-vertical-slice/task.md`。
