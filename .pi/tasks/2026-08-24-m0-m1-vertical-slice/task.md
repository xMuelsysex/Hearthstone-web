# M0 + M1 单人纵向切片

## 目标与决策

- 目标：实现已批准的《网页版炉石复刻：M0 + M1 实施计划（第二次审核修订版）》。
- 技术边界：React + TypeScript + Vite；规则与场景引擎为纯 TypeScript；DOM/CSS 渲染；权威逐事件日志；普通 UI 只消费玩家视角投影。
- 范围：玩家法师、旅店老板战士、固定 30 张卡组、法力渴求/剧毒/扰魔/发现/磁力展示战、五步教程、active/completed 日志、localStorage、JSON 导入导出、DEV-only 调试。
- Git/发布边界：本轮不初始化 Git、不创建分支、不提交、不部署、不发布。
- 项目 Goal：`0147a129-5bad-42f7-8ccf-54ce37ea907a`。

### 阶段 0 已冻结信息

- 执行时间：2026-08-24（UTC+8）。
- 宿主 Node/npm：Node `v26.7.0`、npm `12.0.2`。
- 项目 Node：通过 x-cmd 隔离执行 Node `v22.22.0`；后续项目命令使用 `. ~/.x-cmd.root/X && x env exec node=v22.22.0 -- <command>`。
- HearthstoneJSON 数字 build：`249896`。
- zhCN 数据 URL：`https://api.hearthstonejson.com/v1/249896/zhCN/cards.json`。
- 数据响应：10,010,735 字节；SHA-256 `0a48530c48e0c15995790fcbedbc4d6e07474d8d1cf1c18eaaad8f2f0c1d3a3c`；Last-Modified `2026-08-18T17:37:12Z`；ETag `82bd13018667b6c0902e65db03295ece-2`。
- 卡图模板：`https://art.hearthstonejson.com/v1/render/latest/zhCN/512x/<card-id>.png`；样本 `CS2_029` 返回 PNG 416,404 字节，服务端 SHA-256 元数据 `984a6b702a159da9402a8180f3113f0b99760a019bbd2c3b6254bae97893ec80`。
- Gamespress 入口：`https://blizzard.gamespress.com/Hearthstone` 可公开访问；棋盘、卡背和 UI 纹理的最终下载 URL 待网络请求核验。

### 精确 npm 版本

- create-vite `9.1.2`
- react/react-dom `19.2.8`
- vite `8.2.2`
- @vitejs/plugin-react `6.1.0`
- typescript `7.0.2`
- vitest/@vitest/browser/@vitest/browser-playwright `4.1.11`
- @playwright/test/playwright `1.62.1`
- @testing-library/react `16.3.2`
- @testing-library/jest-dom `7.0.1`
- eslint `10.9.0`
- @eslint/js `10.0.1`
- typescript-eslint `8.67.0`
- eslint-plugin-react-hooks `7.1.1`
- eslint-plugin-react-refresh `0.5.4`
- globals `17.11.0`
- jsdom `30.0.1`
- zod `4.4.3`
- canonicalize `4.0.0`

### 受保护文件基线

初始化前已对 `.pi/settings.local.json` 与 `.workflow/**` 普通文件生成 SHA-256。完整命令输出保留在本次会话；关键文件：

- `.pi/settings.local.json`: `b1dcd1ddb005f2c58e531fbbe9211ae99daff12f42d4ecedab80d3c24a73ee1b`
- `.workflow/embedding-index.bin`: `94443fe4034fe9844a1d27716ddb83990831492130bfa4e4fcc42b8e1d3886c2`
- `.workflow/wiki-index.json`: `221abdd2ca0c564b4258c886d74ea10063e62119a42e8dea1fe3ca91b69e12af`

## 计划

1. 完成 Gamespress 棋盘/卡背/UI 素材下载端点核验，冻结实际资产清单。
2. 临时目录生成 Vite 模板；全量目标路径冲突预检后复制；安装精确依赖与 Chromium。
3. 从 build 249896 冻结 30–50 张唯一卡牌、两套 30 张卡组和素材 manifest。
4. 实现规则、场景、AI、逐事件日志、canonical hash 与会话控制器。
5. 实现 localStorage、恢复、导入导出、教程、棋盘 UI、动画与 DEV-only 调试。
6. 运行目标测试、浏览器 canonical 测试、类型检查、lint、build 与 M1 E2E。

## 验证记录

- `maestro search "Hearthstone session continue" --json`：无既有项目知识条目。
- `node --version && npm --version`：宿主为 Node v26.7.0 / npm 12.0.2。
- `. ~/.x-cmd.root/X && x env exec node=v22.22.0 -- node --version`：通过，输出 v22.22.0。
- HearthstoneJSON 索引、build 249896 zhCN 数据与卡图样本：HTTP 200；响应大小与 SHA-256 已记录。
- npm registry 精确版本查询：全部成功，版本见“精确 npm 版本”。

## 结论

进行中。阶段 0 尚待完成棋盘/卡背/UI 素材最终 URL 核验与 Playwright Chromium revision 锁定。
