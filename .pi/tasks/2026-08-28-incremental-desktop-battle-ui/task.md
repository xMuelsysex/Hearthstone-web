# 增量实现可审计的炉石桌面战场 UI

## 目标与决策

- 按 `.workflow/plans/plan-167daaa0e14f-3.md` 在 `/home/muelsyse/code/Hearthstone-web.candidate` 执行桌面战场 UI 增量改造。
- `/home/muelsyse/code/Hearthstone-web` 作为只读证据树；候选执行树保持隔离。
- 主人要求执行前初始化本地私有 Git 仓库，已在 root 与 candidate 初始化 `.git`，未配置远程、未提交、未发布。
- 严格保留 engine、scenario、App、SessionController、storage、log、replay、cards、package/config 与 M2 冻结边界。
- T0 在任何应用源文件修改前建立不可覆盖的备份、哈希、manifest、快照、基线日志与人工审阅记录；目录冲突或基线失败时停止。

## 计划

1. T0：建立 before 审计证据，运行 baseline 并取得人工 accept。
2. T1：修改 `src/ui/game/GameBoard.tsx`，收敛 DOM、inspection、ARIA、tutorial marker、dialog lifecycle、动画 marker 与 hero/power。
3. T2：修改 `src/ui/theme.css`，校准桌面几何、overlay 安全区、层级与响应式。
4. T3：新增 `src/ui/game/GameBoard.test.tsx`，锁定 public-only 边界与交互语义。
5. T4/T5：扩展 `e2e/m1.spec.ts`、`e2e/m3.spec.ts` 并通过 targeted 浏览器验收。
6. T6：after capture、人工 accept、八 gate 串行验证、manifest/冻结哈希核对、补 journal。

每条命令显式以 `cd '/home/muelsyse/code/Hearthstone-web.candidate' &&` 开始。所有证据写入 `.artifacts/2026-08-28-incremental-desktop-battle-ui/`。

## 验证记录

### T0 初始化

- 任务目录与 artifact 目录均在创建前确认不存在。
- 计划修改文件、冻结 scenario、`package.json` 与参考图均存在。
- 参考图初始 SHA-256：`e444cc43d8fda378a908aa7edda8ecec70012aabb91470a0db142703cf9eeed1`。
- 只读备份：5 个计划修改文件，记录于 `backups/backup-record.v1.tsv`；备份文件权限为 `0444`。
- 源快照：5 个计划修改文件的带行号 before 快照位于 `snapshots/`。
- root before manifest：`manifests/root-before.json`，共 12,242 个条目。
- 冻结哈希：`manifests/frozen-hashes.before.tsv`，覆盖允许清单之外的源、测试、脚本、配置与 M2 相关文件。
- baseline build：`logs/baseline-01-build.log`，exit code 0，Vite 转换 139 modules。
- baseline architecture：`logs/baseline-02-architecture.log`，exit code 0，single-writer、projection/runtime boundary、replay/compatibility 全部 PASS。
- baseline M0/M1/M3：`logs/baseline-03-m0-m1-m3-playwright.log`，7/7 tests passed，exit code 0。
- baseline capture：`logs/baseline-04-capture-retry1.log`，exit code 0；两视口截图与 bbox JSON 已保存。
- 参考图副本与元数据：`reference/locked-reference.png`、`reference/metadata.txt`；SHA-256 与计划锁定值一致。
- T0 人工审阅：`manual-review-t0.md`，verdict=`accept`。

### T1/T2 实现与静态验证

- `src/ui/game/GameBoard.tsx` 完成单文件 UI rework：公开 projection、public-only inspection、tutorial source/target marker、真实 Discover dialog、focus containment、hero power、End Turn 与 settle marker。
- `src/ui/theme.css` 完成桌面战场 grid、右侧 scene-control、唯一外置 status rail、扇形手牌、live health/armor/mana 样式与窄屏单列折叠。
- T1 focused typecheck：`logs/t1-typecheck-02.log`，exit code 0。
- T1 architecture scans：`logs/t1-architecture-01.log`，single-writer、projection boundary、replay compatibility 全部 PASS。
- T2 preview acceptance：`bboxes/after-1280x720.json`、`bboxes/after-1920x1080.json`、`bboxes/after-390x844.json`；真实浏览器确认 1280/1920 无滚动，390px 保留 hero power 与 End Turn，Discover 使用 native modal。

### T3/T4/T5 契约与浏览器验证

- `src/ui/game/GameBoard.test.tsx` 新增 public-only 组件契约，复用现有 Vitest/jsdom harness；`logs/t3-focused-vitest-01.log`：2 个文件、9 个测试通过。
- `e2e/m1.spec.ts` 扩展 tutorial marker、public inspection/hidden-card privacy、desktop geometry、standard/reduced-motion settle marker；`logs/t4-m1-01.log`：8/8 通过。
- `e2e/m3.spec.ts` 扩展 Discover choice inspection、Escape 后 modal/focus containment 与 pending inspection cleanup；`logs/t5-m3-02.log`：1/1 通过。

### T6 after 与八 gate

- after capture：`screenshots/after-1280x720.png`、`after-1920x1080.png`、`after-390x844.png` 及对应 bbox 已落盘；`manual-review-t6.md` verdict=`accept`。
- Gate 1 `pnpm test`：`logs/gate-01-pnpm-test.log`，25 个文件 / 68 个测试通过。
- Gate 2 `pnpm run test:browser`：`logs/gate-02-test-browser.log`，1/1 通过。
- Gate 3 `pnpm run typecheck`：首次因新增 E2E dialog 类型推断失败，修正为 `HTMLDialogElement` 后在 `logs/gate-03-typecheck-retry-01.log` 通过。
- Gate 4 `pnpm run lint`：`logs/gate-04-lint.log`，exit code 0。
- Gate 5 `pnpm run test:architecture`：`logs/gate-05-architecture.log`，三项 enforcement 全部 PASS。
- Gate 6 `pnpm run build`：`logs/gate-06-build.log`，Vite 139 modules，exit code 0。
- Gate 7 targeted E2E（m1/m3/m4）：`logs/gate-07-targeted-e2e.log`，10/10 通过。
- Gate 8 full E2E：`logs/gate-08-full-e2e.log`，22/22 通过。
- after manifest compare：`manifests/root-compare.json`，全部变更均落在允许应用文件、任务留痕或 artifact 范围，outsideAllowed=0，verdict=`PASS`。
- 冻结哈希核对：`manifests/frozen-hashes.after.json`，107 个文件 checked、0 mismatches，verdict=`PASS`。

## 结论

T0–T6 全部完成，桌面战场 UI 增量改造、组件契约、m1/m3 浏览器断言、after 人工 accept、八 gate、manifest 与冻结哈希核对均已落盘并通过。候选树保持隔离；root evidence tree 未写入应用文件；未创建远程、未提交 commit、未发布或部署。
