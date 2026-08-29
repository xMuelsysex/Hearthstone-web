# Hearthstone-web M0–M4 candidate delivery

## 目标与决策

- 在 `/home/muelsyse/code/Hearthstone-web.candidate` 完成主人已确认的 source-confirmation 批次。
- 保持 `GameLogV1` 字段与 M1 engine/applyRecordedEvent 语义兼容。
- 修正 M1 collectible pool 为 `Common 16 / Rare 12 / Epic 8 / Legendary 4`，derived cards/tokens/heroes/hero powers/Coin 独立登记。
- 先完成 M2 产品合同，再实现 V2 root 与单一 `RootTransactionCoordinator`；随后实现 M3 event-only replay/raw artifact 与 M4 静态 compatibility/accessibility/material gates。
- 所有产物、测试和构建输出留在 candidate；根证据目录保持只读。

## 计划

1. 从冻结 build `249896`/`zhCN` 原始缓存补齐 40-card normal pool，并加入显式数据门禁与 literal pack fixtures。
2. 实现 M2 钱包、收藏、抽包、奖励、V2 root、迁移和单一根事务协调器，覆盖 revision、quota、stale、exactly-once 与 zero-reward 边界。
3. 实现 M3 不可变 cursor replay、actor-scoped privacy、first-divergence diagnostics 和 exact raw-byte artifact。
4. 实现 M4 静态 tuple/capability matrix、fail-closed guards、restricted import/runtime scans、Discover dialog accessibility 与素材治理清单。
5. 按 focused tests → typecheck/lint → build → M0–M4 Playwright/fresh verifier 顺序验证，并记录每阶段证据。

## 验证记录

- 2026-08-24：主人确认完整 source-confirmation 批次；此前 M0/M1 candidate baseline 已通过 Node 22.22.0 / pnpm 11.22.0 的静态、单元、浏览器和 E2E 基线。
- 2026-08-24：M3/M4 focused tests 通过，`pnpm test` 为 24 个文件、63 个测试全通过。
- 2026-08-24：`pnpm run typecheck`、`pnpm run lint`、`pnpm run test:architecture` 全通过；三项 enforcement 覆盖单根写入、projection/runtime boundary、replay kernel 与静态 compatibility matrix。
- 2026-08-24：`pnpm run build` 重建 `.artifacts/dist` 成功；`pnpm run test:e2e:m3-m4` 通过 2/2，`pnpm run test:e2e` 通过 16/16（M0/M1/M3/M4 Chromium projects）。
- 2026-08-24：M2 产品实现保持冻结；reward/pack 失败 fixture 按 replay terminal 与 same-card duplicate 不变量修正测试数据与断言。
- 2026-08-24：`pnpm run test:browser` 通过 1/1。

## 结论

- M0–M4 candidate 实现与验证完成。`/home/muelsyse/code/Hearthstone-web` evidence/config 树保持只读；candidate 的 SessionController、Discover dialog、replay/compatibility gates 与架构扫描均已落盘。
