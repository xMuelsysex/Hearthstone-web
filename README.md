# Hearthstone Web：确定性卡牌游戏引擎

> 一个运行在浏览器中的单人卡牌对局纵向切片：以确定性 `command → event → state` 引擎为核心，用真实卡牌数据、可验证日志、版本化存储和投影边界驱动教程与展示战。

**English summary.** Hearthstone Web is a deterministic, browser-based card-game vertical slice. Commands are validated against actor-scoped legal actions, resolved into recorded game/scenario events, hashed over canonical UTF-8 JSON, and committed through a versioned storage transaction. The UI and tavern-keeper AI consume projections rather than authoritative state, while replay/import paths re-execute commands and verify the complete event history. The project also includes a deterministic pack contract, frozen card/art snapshots, tutorial micro-scenarios, and Playwright milestone gates.

## 项目定位

这是一个以工程不变量为重点的卡牌游戏引擎项目，而不是联网对战服务或完整商业客户端。浏览器端提供以下可运行的闭环：

- **展示战**：选择 11 个官方职业之一，用对应英雄、英雄技能和代表性牌组挑战旅店老板；场景会引导并记录 `MANATHIRST`、`POISONOUS`、`ELUSIVE`、`DISCOVER`、`MAGNETIC` 五个展示关键词。
- **20 步教程**：每一步使用隔离的真实引擎状态，覆盖从法力渴求、剧毒、扰魔、发现、磁力到嘲讽、圣盾、风怒、亡语、突袭、冲锋、潜行、吸血、复生、免疫、冻结、沉默、法术伤害、过载和连击。
- **可恢复对局**：活动日志写入浏览器 `localStorage`，刷新后通过 replay 重建权威状态；完成日志可以导出、导入并显示最近对局摘要。
- **卡牌预览**：通过真实的 `resolveCommand` 和公开投影更新卡牌的当前攻击、生命等数值，而不是在展示层伪造运行时数值。

项目当前将一部分高级规则显式建模为 `EffectExecutorId` 和有限的关键词/目标类型集合；未进入注册表的能力不会被运行时默认为“支持”。

## 核心设计

### 单写入者与 Projection Boundary

权威状态只在引擎和会话提交边界内演进，UI 与 AI 不直接修改它：

1. `getLegalActions` 从权威状态生成 actor-scoped `LegalActionDescriptor`；`commandFromAction` 将 descriptor 转成 `GameCommand`，`validateCommand` 再用同一套合法动作生成器验证命令。目标合法性证据（例如被 `ELUSIVE`、`STEALTH` 或 `IMMUNE` 排除的实体）会随 command batch 记录。
2. `SessionController.dispatchCommand` 使用 Promise 队列串行提交命令。一个命令只有在前一个命令完成 commit 后才会进入 `resolveCommand`。
3. `resolveCommand` 先验证命令，再以 clone 的状态处理工作队列；每个 `RecordedEventV1` 由 `applyRecordedEvent` 产生新的 session state，场景覆盖事件由 `deriveScenarioEvents` 从已记录的游戏事件和合法性证据派生，并同样进入日志。
4. `SessionController` 先生成并校验下一批日志，再通过 `RootTransactionCoordinator` 持久化。只有根事务成功、写回原文和 digest/revision 验证通过后，内存中的 state/log 才更新。
5. `RootTransactionCoordinator` 在支持 Web Locks 时使用针对存储 key 的 exclusive lock；否则退回进程内 Promise lock。事务锁内重新读取 root、检查 `expectedRevision`、复制 root、执行 mutation，并递增 revision，以处理多 tab 的 stale root 和 active-game 冲突。

投影是有意设置的安全边界。`projectPlayerView` 只暴露 viewer 自己手牌的公开实体；对手手牌只返回 `{ id, hidden: true }`，其余可见英雄、战场、法力和合法动作按公开字段输出。AI 通过 `projectPlayerView(state, 'OPPONENT')` 和 `projectLegalActions` 观察对手视角，不能直接读取另一方手牌定义。UI 通过 `PlayerSessionContext` 消费投影；ESLint 规则和 `test:architecture` 会阻止普通 UI 直接导入 authoritative state、log、storage 或 AI。

这里的“单写入者”是应用会话的写入路径约束，不是把浏览器当成单进程：跨 tab 的协调由 root transaction 的 lock、revision 检查和写回验证共同完成。

### Replay / Log 的确定性与可验证导入

引擎的确定性前提是：给定相同的初始状态、command 序列、版本 tuple 和 RNG seed，`resolveCommand` 应产生相同的事件序列和最终状态；时间戳与 game id 属于外层日志元数据，不是规则随机源。

- `canonicalizeV1` 只接受规范 JSON：拒绝非安全整数、稀疏数组、`undefined`、`Map` 等；随后使用稳定的 canonical JSON 表示，并通过 `TextEncoder` 得到确定的 UTF-8 bytes。
- `hashStateV1` 将 `rulesVersion`、`cardDataVersion`、`scenarioVersion` 和按版本归一化后的 state 一起做 SHA-256。日志保存 `initialStateHash`、每个 event 的 `postStateHash`、每个 batch 的 `postBatchStateHash`、`currentStateHash` 与去掉自身后的 `contentDigest`。
- `replayLog` 只使用共享的 `applyRecordedEvent` replay kernel，依次检查版本、content digest、初始 hash、batch/event sequence、每个事件后的 state hash、batch hash、总事件数、current hash，以及 completed 日志的终局摘要。`replayLogFrames` 在同一内核上产生逐事件 frame，避免播放器另写一套规则。
- `validateAndImportLog` 在读取文件文本前检查 1 MiB `IMPORT_BYTE_LIMIT`，再执行 JSON parse、Zod 边界 schema、初始实体引用检查和 replay。之后它会用对应 card-data 版本重新 `resolveCommand`，逐项比较 legality evidence、事件数量、事件 payload、sequence、post-state hash、current hash 和 content digest；因此“能 parse”不等于“能导入”。
- 相同 `gameId` 且 digest 相同的导入是幂等操作；相同 id 但内容不同会报 `GAME_ID_CONFLICT`。`exportLog` 输出 canonical JSON，而不是依赖普通 `JSON.stringify` 的属性顺序。
- Replay artifact 会保存版本 tuple、source digest 和每帧 hash，并进行 deep freeze。completed 日志允许 `PLAYER`、`OPPONENT` 和 `PUBLIC` viewer；active/pending 日志只允许 owner，公开投影会隐藏双方手牌以及未授权的 Discover 选择。

因此，日志既是 UI 的恢复来源，也是可重新执行、可定位 divergence 的审计材料；它不是仅用于显示事件文本的普通操作记录。

### 版本守卫、能力守卫与兼容矩阵

这三层解决的问题不同，不能互相替代：

| 层 | 守卫对象 | 解决的问题 |
| --- | --- | --- |
| **Version guard** | `rulesVersion`、`cardDataVersion`、`scenarioVersion`、`rngAlgorithmVersion` 与 carrier | 这个输入是否属于当前实现明确支持的规则/数据/RNG 版本组合；不匹配即 `UNSUPPORTED_VERSION`。 |
| **Capability guard** | `registryDigest`、card definition ids、effect ids、capability ids | 即使 tuple 看起来可用，输入是否引用了本地注册表没有的卡、效果或能力；digest 不同或出现未知能力即拒绝。 |
| **Compatibility matrix** | carrier + tuple → matrix row | 将 `GAME_LOG_V1`、`STORAGE_ROOT_V2`、`REPLAY_ARTIFACT_V1` 各自允许的 tuple、能力注册表和（M2）root version 固定在一个矩阵里，避免每条导入路径自行拼接兼容规则。 |

当前注册的矩阵行是 `M1_GAME_LOG_V1`、`M2_STORAGE_ROOT_V2`（root version `m2-root-v1`）和 `M3_REPLAY_ARTIFACT_V1`。当前 card-data 是 `250339-zhCN-v1`；历史 `249896-zhCN-v1` 仍可 replay/continue。legacy 路径会使用固定 Discover pool，并在 hash 与事件应用前移除当时不存在的 `cost`、`summonedThisTurn`、`attacksRemaining`、`frozen`、`immune`、`cardsPlayedThisTurn`、`overloadLocked` 等现代字段，保持旧日志的 hash 语义。

兼容性注册表的 card/effect/capability 列表和 matrix row 使用 `Object.freeze`，其 `registryDigest` 取自卡牌 source snapshot 的 `sourceSha256`。这使“版本相同但能力集合已漂移”的输入也会被拒绝；V1→V2 storage migration 另外记录迁移元数据和奖励策略，不会把旧完成日志自动变成可领奖励的本地完成。

### Card Data / Asset Freeze：为什么固定输入

确定性 replay 和确定性抽包都不能依赖运行时不断变化的远端卡牌接口。因此项目把卡牌目录、卡池和视觉资源作为带版本与 digest 的输入快照：

- `src/cards/data/source-selected.250339.json` 记录 `build: 250339`、`locale: zhCN`、cutoff date、source URL、source SHA-256、source byte length，以及选入运行时的卡牌和 sourced decks。
- `freeze:cards` 会先校验 `.cache/hearthstone/cards-250339-zhCN.json` 的固定 source digest，再检查牌组格式、hero/hero power、职业归属和卡牌引用，最后生成 `source-selected.250339.json`、`cards.v1.ts`、`collectible-pool.v1.ts`、牌组文件。运行时 registry 再把快照字段和显式的 `EffectExecutorId` 映射合成为 typed card definitions。
- M1 collectible pool 是显式列出的 40 张牌；`validateM2PackContract` 要求 id 唯一，并锁定 `COMMON/RARE/EPIC/LEGENDARY = 16/12/8/4` 的分布。固定池让相同 pack 输入不会因外部卡池变化而改变结果。
- `freeze:assets` 根据同一快照生成卡图、英雄/英雄技能图、原画以及棋盘/卡背的 `source-manifest.v1.json`。manifest 为每项记录 id、kind、sourceUrl、`/assets/` localPath、SHA-256、byte length 和用途，构建时即可审计资源身份。

这里的 **freeze** 指构建期快照、显式契约和版本化输入；并不夸大为“所有资源在浏览器运行时都会重新做二进制 hash 校验”。当前 `loadAssetManifest` 的运行时职责是请求本地 manifest 并做 Zod schema 校验，实际文件的 hash/byteLength 是 manifest 中的来源记录。兼容 registry 和 matrix row 则确实使用了 `Object.freeze`。

### Storage：原子提交与字节预算

浏览器端只有 `BrowserStorageAdapter` 负责访问 `localStorage`；应用使用一个 `hearthstone-web:v1` key，V2 payload 的 root version 为 `m2-root-v1`。`GameRepository` 提供 memory adapter 供测试，普通业务通过 `RootTransactionCoordinator` 完成读改写。

Storage V2 root 在同一个结构中保存 active/completed logs、教程完成状态、wallet、collection、pack state、pack transaction fixtures、reward ledger、finalized games 和 V1 migration metadata。每次 mutation 都经过 schema、预算、canonical serialization、写回原文、SHA-256 和 revision 校验；写失败或回读不一致不会静默更新内存状态。

预算以 **canonical JSON 的 UTF-8 字节数**计算，而不是 JavaScript 字符数：

| 对象 | 限制 |
| --- | ---: |
| 单条 active/completed log | 1 MiB |
| completed logs 聚合 | 3 MiB |
| 整个 storage root | 4 MiB |
| completed log 数量 | 20 条 |
| 单条 pack transaction fixture | 1 MiB |
| V1→V2 migration raw input | 1 MiB，且在 parse 前检查 |

completed 日志超出数量或聚合预算时按 `completedAt` 从旧到新淘汰；单条日志超限则直接失败。V2 root 和 pack/finalize 操作也受同一 root transaction 约束，所以 collection、gold、pack state、fixture 或奖励不会只成功更新其中一部分。

### Economy：确定性抽包契约

M2 economy 的契约集中在 `packContract.ts`，算法集中在 `packAlgorithm.ts`：

- 算法版本为 `m2-official-style-v1`；每包 5 张、价格 100 gold、初始 gold 500、单次本地完成奖励 20 gold。
- 稀有度权重按 10,000 的 raw roll 分配：`COMMON 7165`、`RARE 2284`、`EPIC 442`、`LEGENDARY 109`。
- 每个 slot 先消耗一次 `mulberry32-v1` RNG 产生 raw rarity；然后应用第 10 包首张 set legendary、连续 39 包 legendary、连续 9 包 epic 和“至少一张 rare-or-better”覆盖规则。每张牌的选择还会继续消耗 RNG。
- 牌池选择优先保护 `everOwnedCount` 尚未达到上限的牌：普通/稀有/史诗上限为 2，传说上限为 1；同一包内也遵守对应的重复上限，无法满足时返回 typed `PACK_POOL_EXHAUSTED`。
- 输入契约要求 `packSequence === openedPacks + 1`、seed 是非负 safe integer、gold 至少为 100、pity counter 非负。fixture 逐 slot 保存 raw roll、raw/final rarity、override reason、ownership 前后值、pity 前后值和 gold 前后值。
- transaction payload 以 canonical UTF-8 bytes 和 SHA-256 保存；进入 root transaction 时会补入最终 revision 并重算 fixture hash。一次 `openPack` 同时更新 collection、packState、wallet 和 packTransactions；相同 `packSequence + seed` 幂等，不同 seed 冲突。
- 游戏完成奖励只对本地 `finalize` 路径 eligible；V1 import 和 V1 migration 的完成日志奖励为零。这项差异在 economy/storage 测试中明确锁定；现有 E2E 的 M4 只验证空的 V2 pack/reward 字段启动，不声称覆盖实际开包流程。

### Scenarios：教程与展示策略

Scenario state 与 game state 一起被记录，避免“为了演示而在 UI 里偷偷改规则”：

- **展示战**使用固定 seed `249896`，上限为 32 commands、16 turns。默认 MAGE 会把展示所需卡牌置于可达位置；其他职业使用对应的 class deck/signature cards。玩家策略按剧毒 → 发现 → 法力渴求 → 磁力的覆盖缺口选择动作；旅店老板 AI 只消费对手视角的 projection，先处理 mulligan/Discover，在覆盖齐全后请求 CONCEDE。
- `deriveScenarioEvents` 从 `MANATHIRST_BONUS_APPLIED`、剧毒死亡、Discover resolve、Magnetic merge 以及带 `ELUSIVE` 排除证据的动作派生 coverage。五项覆盖完成后进入 `READY_FOR_AI_CONCEDE`，AI concede 后才进入 `COMPLETED`；这让“展示完成”与“对局终局”分别可验证。
- **教程**有 20 个 `TutorialStepDefinition`。每步从独立的 `createGameState` 开始，确认双方 mulligan 后把目标卡放入手牌/战场，相关动作仍通过 `getLegalActions → commandFromAction → resolveCommand` 执行。每步限制最大动作数、根据真实事件判定完成，并始终提供 `RESET_TUTORIAL_STEP`；完成或跳过后通过 coordinator 持久化 `tutorialCompleted`。
- **卡牌预览**使用 authoritative projection、legal actions 和真实 attack command；卡面图层只是显示层，当前攻击/生命来自引擎实体。

## 技术栈

- **运行时**：Node.js `22.22.0`（`.node-version`）；`scripts/run-toolchain.sh` 还会校验 pnpm `11.22.0`。
- **前端**：React `19.2.8`、TypeScript `6.0.3`（strict/no-unused/noUncheckedIndexedAccess）、Vite `8.2.2`。
- **规则与数据**：原生 TypeScript、`zod` `4.4.3`、`canonicalize` `4.0.0`、Web Crypto SHA-256。
- **测试**：Vitest `4.1.11` + jsdom，Vitest Browser + Playwright Chromium，Playwright Test `1.62.1`。
- **入口**：`index.html` 设置 `zh-CN`、主题色、卡背 favicon 和页面标题；`src/main.tsx` 在 React `StrictMode` 下挂载 `App`。

## 目录结构

```text
.
├── src/
│   ├── ai/          # Tavern Keeper：只消费对手视角投影和合法动作
│   ├── app/         # App、PlayerSessionContext、SessionController
│   ├── assets/      # source manifest schema/loader
│   ├── cards/       # card types、registry、deck 与 frozen data snapshot
│   ├── compat/      # compatibility matrix、version/capability guards、raw input
│   ├── dev/         # DEV + ?debug 调试面板
│   ├── economy/     # pack contract、确定性抽包、奖励与 collection 类型
│   ├── engine/      # state、commands、legal actions、resolver、events、projection、RNG
│   ├── log/         # canonical JSON、hash、schema、builder、replay、import validation
│   ├── replay/      # privacy projection、artifact、frame cursor、raw artifact
│   ├── scenarios/   # showcase、tutorial、scenario reducer/derived events
│   ├── storage/     # browser/memory adapter、V1/V2 schema、migration、root transaction
│   ├── test/        # Vitest setup
│   └── ui/          # game board、menu、card face/preview、asset fallback 与交互动画
├── public/assets/   # 已冻结的卡图、原画、英雄、棋盘、卡背、字体和 manifest
├── scripts/         # 3 个 architecture gate、2 个 freeze 脚本、toolchain wrapper
├── e2e/             # smoke、M1、M3 dialog、M4 storage Playwright specs
├── index.html
├── package.json
└── vite.config.ts / vitest*.config.ts / playwright.config.ts
```

## 快速开始

### 环境

- Node.js 版本以 `.node-version` 为准：`22.22.0`。
- 使用仓库中的 `pnpm-lock.yaml` 安装依赖。`pnpm install` 是包管理器内置动作；下面列出的项目命令均对应 `package.json` 中真实存在的 script。

### 启动开发服务器

```bash
pnpm install
pnpm run dev
```

Vite 开发服务器启动后，用浏览器打开终端输出的本地地址。首次打开会进入 20 步教程；完成或跳过后可在主菜单选择职业、开始展示战、继续 active log、导入或导出 JSON 日志。要打开卡牌预览页，访问开发服务器地址并追加 `?card-preview`；`?debug` 仅在 `import.meta.env.DEV` 下加载调试面板。

### 生产构建与本地预览

```bash
pnpm run build
pnpm run preview
```

`build` 先执行 `tsc -b`，再将 Vite 产物写入 `.artifacts/dist`；`preview` 使用同一输出目录提供静态预览。

## 测试与质量门

以下命令均来自 `package.json`，可按需要单独执行：

| 命令 | 覆盖内容 |
| --- | --- |
| `pnpm run typecheck` | `tsc -b --pretty false`，检查 app/node/e2e 引用的严格类型。 |
| `pnpm run lint` | ESLint、TypeScript ESLint、React Hooks/Refresh，以及 UI 的 restricted imports。 |
| `pnpm run test` | Vitest jsdom 单元/集成测试；包含 engine、log、storage、economy、scenario、card、app 等测试。 |
| `pnpm run test:watch` | Vitest watch 模式。 |
| `pnpm run test:browser` | Vitest Browser 的 Chromium 测试，包含 canonicalization 的浏览器向量。 |
| `pnpm run test:architecture` | 运行 single-writer、projection/runtime boundary、replay/compatibility 三个源码约束 gate。 |
| `pnpm run build` | 类型检查 + Vite production build；也是完整 E2E preview 的前置步骤。 |
| `pnpm run test:e2e` | Playwright 的全部项目：`m0` smoke、`m1`、`m3`、`m4` 和 `full-chromium`。 |
| `pnpm run test:e2e:m3-m4` | 只运行 M3 dialog 和 M4 storage compatibility 两个 Chromium 项目。 |

建议的完整本地质量门顺序：

```bash
pnpm run typecheck
pnpm run lint
pnpm run test
pnpm run test:browser
pnpm run test:architecture
pnpm run build
pnpm run test:e2e
```

Playwright 配置会启动 `vite preview`，产物目录必须先由 `pnpm run build` 生成。失败时 trace 保留在 `.artifacts/test-results`，HTML report 在 `.artifacts/playwright-report`。

### 数据/资源冻结脚本

| 命令 | 作用 |
| --- | --- |
| `pnpm run freeze:cards` | 校验固定 card source digest、解析 sourced deck，并重新生成 card snapshot、typed registry 输入、牌组和 collectible pool。需要仓库已有对应 `.cache` source。 |
| `pnpm run freeze:assets` | 按 `source-selected.250339.json` 补齐缺失图片，计算资源 hash/byte length，并生成 `public/assets/source-manifest.v1.json`。 |
| `scripts/run-toolchain.sh` | 可选的 Node/pnpm 版本固定 wrapper；要求以 `--` 分隔并透传 `node` 或 `pnpm` 命令，禁止 `npm`/`npx`。 |

冻结脚本会写入生成的数据/资源文件，日常只读开发和测试不需要运行它们。

## E2E 里程碑

Playwright 配置把四类 spec 映射为 m0/m1/m3/m4 project；`full-chromium` 会运行全部 spec：

- **M0 / smoke**：预置 V1 root 且 `tutorialCompleted: true` 后，主菜单标题可见。
- **M1**：覆盖 11 个职业的 hero/hero power/signature cards；首次启动完成全部 20 个教程步骤并持久化完成状态；展示战完成五个关键词、旅店老板 concede、日志导出/完成摘要/重新开始；还覆盖 refresh 恢复 active log、multi-tab 冲突、active/completed import 行为、磁力后的 authoritative 数值、目标英雄技能箭头、资源失败 fallback、720p 无横向溢出、对手手牌隐私、deck tracker、标准/`prefers-reduced-motion` settle marker 等。
- **M3**：Discover 使用真正的 modal `<dialog>`，检查 `open`、`aria-modal`、`:modal` 和焦点留在 dialog；Escape 不会关闭；拖拽结束时 inspection overlay 必须先清理，dialog 才卸载。
- **M4**：从 `schemaVersion: 2`、`rootVersion: m2-root-v1`、wallet/collection/pack/migration 等字段启动，首页可用且 localStorage 仍保持 schema 2。

E2E 重点是用户可观察的里程碑和投影/交互边界；抽包的逐 slot 稳定性、pity、重复保护和 reward eligibility 由 `src/economy` 与 `src/storage` 的单元/集成测试覆盖，而不是被描述成现有 E2E 已覆盖的功能。

## 数据与资源来源

- 卡牌数据与卡图按版本化的官方客户端数据快照固化在仓库中，不在浏览器启动时请求远端卡牌目录。构建号直接体现在 `src/cards/data/source-selected.250339.json` 文件名和内容中：`build = 250339`、`locale = zhCN`；TypeScript 对外版本为 `250339-zhCN-v1`。
- 快照记录了 `https://api.hearthstonejson.com/v1/250339/zhCN/cards.json`、source SHA-256 和 source byte length；卡图/原画 manifest 记录 `art.hearthstonejson.com` 与棋盘/卡背的 Blizzard Press Kit 来源、local path、hash 和 byte length。
- `src/cards/data/sourced-decks.v1.ts` 保存有来源日期和格式的 11 个职业 sourced decks，`cards/decks.ts` 负责将其转换为展示战定义并验证职业、牌组大小、可收集性和复制上限。
- UI 只引用 `/assets/...` 的本地路径；manifest loader 校验本地 manifest 的 schema，资源缺失时 UI 有显式 fallback。数据快照、卡池契约和兼容 registry 的版本变化应当作为新的版本/fixture 变化处理，而不是悄悄覆盖旧输入。

## 实现导航

| 关注点 | 主要文件 |
| --- | --- |
| 命令合法性与 resolver | `src/engine/commands.ts`、`src/engine/legalActions.ts`、`src/engine/resolveCommand.ts` |
| 事件应用与投影 | `src/engine/applyRecordedEvent.ts`、`src/engine/projection.ts` |
| 会话串行提交 | `src/app/session/SessionController.ts` |
| canonical/hash/log/replay | `src/log/canonicalize.ts`、`src/log/hash.ts`、`src/log/logBuilder.ts`、`src/log/replay.ts`、`src/log/validateImport.ts` |
| 兼容性边界 | `src/compat/compatibilityMatrix.v1.ts`、`versionGuards.ts`、`capabilityGuards.ts` |
| V2 root 与预算 | `src/storage/schemaV2.ts`、`src/storage/rootTransactionCoordinator.ts`、`src/storage/byteBudget.ts` |
| 卡牌/资源快照 | `src/cards/data/source-selected.250339.json`、`src/cards/registry.ts`、`src/assets/manifest.ts`、`scripts/freeze-*.mjs` |
| 抽包与奖励 | `src/economy/packContract.ts`、`src/economy/packAlgorithm.ts` |
| 教程/展示策略 | `src/scenarios/tutorial.ts`、`src/scenarios/showcase.ts`、`src/scenarios/deriveEvents.ts`、`src/ai/tavernKeeper.ts` |
| 架构 gate | `scripts/enforce-single-writer.mjs`、`enforce-projection-boundary.mjs`、`enforce-replay-compatibility.mjs` |
| 浏览器里程碑 | `e2e/smoke.spec.ts`、`e2e/m1.spec.ts`、`e2e/m3.spec.ts`、`e2e/m4.spec.ts` |

## 免责声明

本项目是非官方的学习与研究项目，与 Blizzard Entertainment、Hearthstone 或其发行方不存在隶属、授权或背书关系。卡牌名称、规则文本、卡图、原画、棋盘和其他相关素材的权利归其各自权利人所有；仓库中的数据和资源仅用于工程实现、确定性 replay、UI 研究与测试。项目不提供官方服务、在线对战或商业授权。
