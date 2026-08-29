# M0–M4 恢复、稳定化与兼容性交付

## 目标与决策
- 在 `/home/muelsyse/code/Hearthstone-web.candidate` 完成已确认的 M0–M4 source-confirmation 批次。
- 根目录 `/home/muelsyse/code/Hearthstone-web` 保持只读。
- 保持 `GameLogV1` 字段与语义不变；M2 通过 V2 root envelope 与唯一事务协调器扩展。
- M2 顺序：显式 40-card pool / 产品合同 → root transaction coordinator → V2 schema/migration → UI/E2E。
- M3 只调用 `applyRecordedEvent`；M4 使用静态 compatibility tuple map 与 fail-closed guards。

## 计划
1. 校验并锁定 40 张 normal collectible pool（Common 16、Rare 12、Epic 8、Legendary 4），补充 M2 纯域合同与 literal fixtures。
2. 实现 V2 storage root、revision/CAS、Web Locks 兼容协调器、finalize/pack/reward 原子写入和 V1→V2 migration。
3. 实现 immutable replay cursor、viewer authorization、privacy projection、unknown raw-byte artifact。
4. 实现 M4 compatibility matrix/guards，修复既有日志深拷贝、Discover dialog/a11y 和配置/架构扫描门。
5. 按目标测试、typecheck、lint、build、M2/M3/M4 Chromium 与 full Chromium 顺序验证；记录实际命令和结果。

## 验证记录
- 2026-08-23：source-confirmation 获主人确认；candidate 当前 M1 基线，开始 M2 实现。
- 2026-08-23：生成脚本写入显式 40-card normal pool，冻结源为 HearthstoneJSON build 249896/zhCN。

## 结论
- 待 M0–M4 实现与验证完成后补齐。
