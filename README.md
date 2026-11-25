# dsh-token-peak

DeepSeek Harness（DSH）插件：在 DSH 界面里显示当前 Token 计价处于 **高峰 / 中峰 / 低峰** 哪一档，以及距下一次切换的时间、当日时段分布与花费估算。

- 侧栏面板：当前档位与倒计时、今日 24 小时时段条、未来 7 天预览、本周小结、花费换算与预算反算、计费规则。
- 会话头部：紧凑档位徽标；侧栏图标上有对应颜色的状态点。
- 规则与价格外置在 `rules.json`，构建时编译进 bundle；纯函数算法可独立自测。

> 实现原理、组件结构与边界说明见 [ARCHITECTURE.md](./ARCHITECTURE.md)；版本记录见 [CHANGELOG.md](./CHANGELOG.md)。

## 计费规则（北京时间，UTC+8）

| 档位 | 时段 | 计费 |
| --- | --- | --- |
| 高峰 | 周一至周五 09:00–12:00、14:00–18:00（不含法定节假日） | ×1.0 全价 |
| 中峰 | 周一至周五 12:00–14:00、18:00–22:00 | 闲时价（仅作活跃度提示） |
| 低峰 | 22:00–次日 09:00；周末、法定节假日全天 | ×0.5 闲时 |

官方只分「高峰 / 闲时」两档；**中峰是本插件补充的提示档，不参与独立计费**。周末调休上班日仍按官方的「周一至周五」口径判为闲时，并在日历行标注。规则未覆盖的年份显示「规则未覆盖」，不猜测档位。

## 环境要求

- DeepSeek Harness 桌面端 / Web 端。
- Node.js 18+（仅在修改规则、跑自测或本地打包时需要；插件运行时不依赖 Node）。

## 安装

```powershell
# 1. 克隆或下载本仓库到固定位置
git clone https://github.com/y5210/dsh-token-peak.git

# 2. 注册进当前 profile（路径换成你本机的绝对路径）
dsh plugin --profile desktop add "file:D:/DeepSeek Harness/plugins/dsh-token-peak"

# 3. 重启 DSH，侧栏出现「峰谷时段」入口
```

## 卸载

```powershell
node scripts/uninstall.mjs --profile desktop
# 脚本只移除 profile 里的依赖行与 bundle 记录；再手动删除插件目录并重启 DSH
```

## 规则配置 `rules.json`

| 字段 | 说明 |
| --- | --- |
| `coverage.years` | 已录入规则的年份；之外的日期返回 `unknown` |
| `coverage.holidays` | 节假日表（按年份批次录入） |
| `coverage.verifiedAt` | 单价核对日期，用于超龄提示 |
| `coverage.sourceUrl` | 官方价格页出处 |
| `priceMaxAgeDays` | 单价超过多少天未复核时提示「待复核」 |
| `timezoneOffsetMin` | 时区偏移分钟数（北京 = 480） |
| `peakWindows` / `midWindows` | 当日分钟区间 `[起, 止]`，自 00:00 起算 |
| `holidays` | 法定节假日区间列表 |
| `makeupWorkdays` | 调休补班日期列表 |
| `prices.<model>.peak` / `.off` | 三档单价 `[缓存命中, 未命中, 输出]`，单位：元 / 百万 token |

修改规则后：

```powershell
node scripts/sync-rules.mjs   # rules.json → lib/client.js（构建时注入）
node scripts/selftest.mjs    # 时段 / 节假日 / 价格 / 预算反算自测
```

## 目录结构

```
dsh-token-peak/
├── package.json          # dsh.bundle.patch + dsh.client.inject 声明
├── cordis.patch.yml      # 宿主半侧 Loader 行
├── rules.json            # 唯一规则数据源
├── lib/
│   ├── index.js          # 宿主半侧（空 apply，用于挂载浏览器半侧）
│   └── client.js          # 浏览器半侧：槽位注册、页面、徽标、时段算法
├── scripts/
│   ├── sync-rules.mjs    # rules.json → client.js
│   ├── selftest.mjs      # 纯函数自测
│   └── uninstall.mjs      # 移除 profile 中的依赖与 bundle 记录
├── ARCHITECTURE.md       # 实现说明
└── CHANGELOG.md          # 版本记录
```

浏览器半侧由 DSH 的模块装载器加载，运行时不读取本地 JSON 文件，因此规则在构建时编译进 `client.js`；核心算法与界面在同一文件内用 `//<tier-core>` 块分隔，自测直接抽取该块运行。

## 边界与已知限制

- 只按北京时间计算，与本机时区无关。
- 节假日表是静态数据，需随国务院年度安排更新；未覆盖年份显示「规则未覆盖」。
- 单价随官方调价可能滞后，金额为估算，以官方账单为准。
- 花费换算为手填比例估算；暂未接入其他插件的实时用量账本。
- 「100 万 token 能做多少事」按经验估算（1 汉字 ≈ 1–1.5 token），非官方口径。

## 许可

[MIT](./LICENSE)
