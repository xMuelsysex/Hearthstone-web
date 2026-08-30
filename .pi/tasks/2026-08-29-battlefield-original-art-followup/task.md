# 任务：补齐战场椭圆原画卡面

## 目标与决策

- 目标：以主人提供的示例图为视觉基准，让所有支持进入战场的随从卡使用纯原画椭圆裁切；当前从左往右第二张卡 `BOT_309` 作为正确样本。
- 覆盖 `CARD_DEFINITIONS_V1` 中 48 个 `MINION` definition，包含默认卡组、教程 fixture、可注册自定义卡组和召唤 token。
- 保留公开 projection、攻击/生命实时宝石、拖拽/点击/键盘交互与完整卡面 fallback 契约；原画资源由卡数据自动枚举。

## 计划

1. 读取示例图，枚举所有可进入战场的随从 definitionId，检查当前资源路径与 DOM。
2. 将冻结脚本改为从权威卡数据自动枚举 48 个随从，下载并登记全部 `orig` 原画，补充数据驱动测试。
3. 用目标组件测试、typecheck、lint、architecture、build、M1 及 1280/390 浏览器检查验证。

## 验证记录

- 示例图核对：从左往右第二张为 `BOT_309`，其余四张识别为 `BOT_563`、`CS2_179`、`CS2_196`、`CS2_boar`；此前本地原画仅覆盖 7 张，现扩展到全部 48 个支持随从。
- `pnpm exec vitest run 'src/assets/manifest.test.ts' 'src/ui/game/GameBoard.test.tsx'`：2 files / 14 tests 通过。
- `pnpm run typecheck`：通过。
- `pnpm run lint`：通过。
- `pnpm run build`：通过，Vite 转换 140 modules。
- `pnpm run test:architecture`：single-writer、projection/runtime boundary、replay/compatibility 全部 PASS。
- `pnpm exec playwright test e2e/m1.spec.ts --project=m1-chromium`：11/11 通过。
- `node scripts/freeze-assets.mjs`：生成 124 项资源 manifest，包含 48 张 `CARD_ART`；所有本地原画 SHA-256 与文件大小一致。
- 全量路径测试：48 个支持随从均请求 `/assets/card-art/{definitionId}.png`，definition、攻击、当前生命和最大生命属性保持映射。
- 浏览器复核：1280×720 下 `scrollWidth=1280`，390×844 下 `scrollWidth=375`；当前展示战的 `CS2_119` 与 `BOT_309` 均加载 `/assets/card-art/` 且 fallback=false。截图：`artifacts-oval-card-followup-835.png`。

## 结论

- `public/assets/card-art/` 现覆盖 48 个支持战场随从的原画，`scripts/freeze-assets.mjs` 从权威卡数据自动枚举，`source-manifest.v1.json` 同步登记来源、哈希和文件大小。
- `GameBoard` 继续统一使用椭圆原画视窗，所有战场随从共享同一映射，实时攻击/生命宝石与交互契约保持不变。
