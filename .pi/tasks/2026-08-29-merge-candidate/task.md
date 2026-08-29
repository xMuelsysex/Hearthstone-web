# 将 candidate 作为分支合并到现有项目

## 目标与决策

- 将 `/home/muelsyse/code/Hearthstone-web.candidate` 当前实现作为分支纳入现有项目 `/home/muelsyse/code/Hearthstone-web` 的 `master`。
- candidate 分支命名为 `ui/official-reference-hero-layout`；candidate 当前实现提交为 `1bd6f66`。
- root 现有配置与既有 `.pi` 流水先形成基线提交 `b795f6e`，再用允许无共同祖先的本地 Git 合并接入 candidate。
- candidate 的源码、测试、配置、public 素材、scripts 与 `.pi` 留痕纳入；`.artifacts`、`.cache`、`.workflow` 等生成/本地状态留在 candidate 工作区，root 独有证据与本地状态保留。

## 计划

1. 检查两棵树的 Git 状态、提交历史、独有文件与重叠配置。
2. 在 candidate 建立实现分支与基线提交，在 root 建立现有项目基线提交。
3. 将 candidate 分支对象引入 root，执行 `--allow-unrelated-histories` 合并，保留 candidate 项目实现并合并 root 历史流水。
4. 在合并后的 root 安装锁定依赖，执行目标测试、typecheck、lint、architecture、build，并核对 Git 图与工作区。

## 验证记录

- `git fetch /home/muelsyse/code/Hearthstone-web.candidate ui/official-reference-hero-layout:ui/official-reference-hero-layout`：成功。
- root merge commit `6029659` 的两个父提交为 `b795f6e`（root 基线）与 `1bd6f66`（candidate 实现）。
- `pnpm install --frozen-lockfile`：通过，依赖按 candidate 锁文件同步。
- `pnpm exec vitest run src/ui/game/GameBoard.test.tsx src/ui/card/CardPreview.test.tsx src/app/App.test.tsx`：3 files / 17 tests 通过。
- `pnpm run typecheck`、`pnpm run lint`、`pnpm run test:architecture`、`pnpm run build`：全部通过；build 转换 140 modules。
- 合并后 root 关键源码、测试、配置和官方素材均存在；工作区仅保留 `.artifacts`、`.workflow`、Playwright 证据、截图、tmp 与 `.pi/settings.local.json` 等未跟踪本地文件。

## 结论

candidate 当前实现已作为 `ui/official-reference-hero-layout` 分支合并进 root `master`，合并提交为 `6029659`。两棵树的 Git 历史均已建立，candidate 分支继续保留以便回溯；root 项目可直接从合并后的目录运行。
