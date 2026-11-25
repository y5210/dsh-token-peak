# 实现说明 · dsh-token-peak

面向想阅读源码、二次开发或排查问题的读者。使用安装说明见 [README.md](./README.md)。

## 1. 双半侧插件结构

DeepSeek Harness（DSH）插件分两侧：

| 半侧 | 文件 | 运行位置 | 职责 |
| --- | --- | --- | --- |
| 宿主半侧 | `lib/index.js` | Node / Cordis | 空 `apply`，仅作为 Loader 行地址，让 Web 应用能挂上浏览器半侧 |
| 浏览器半侧 | `lib/client.js` | Web UI（React） | 槽位注册、面板/徽标、时段算法与样式 |

装载链路：

1. `package.json` 的 `dsh.bundle.patch` 指向 `cordis.patch.yml`，bundle patch 层把本包作为一行插入宿主 Loader。
2. `package.json` 的 `dsh.client.inject` 声明要挂载的 UI 包（布局 / 侧栏 / 会话），`dsh.client.platform = "web"`。
3. Web 应用加载浏览器半侧时，执行 `client.js` 顶层的 `window.__ModuleLoader__.load({ factory })`；`factory(require)` 拿到 `react`，返回 Cordis 插件对象：`{ name, inject: ['slots'], apply(ctx) }`。

宿主半侧没有逻辑：它存在的意义是让包在 Loader 中可寻址，浏览器半侧由 `dsh.client` 声明单独挂载。

## 2. 槽位挂载

`apply(ctx)` 中先 `installStyles()`，再在 `ctx.effect` 内通过 `mount(slotName, definition, component)` 注册三个槽：

| 槽位 | 组件 | 说明 |
| --- | --- | --- |
| `sidebar.panellist` | `PeakNavIcon` | 侧栏入口图标，带档位状态点（`order: 21`） |
| `main` | `PeakPanel` | 主面板页面 |
| `conversation.session.header.utilities` | `PeakChip` | 会话头部紧凑徽标（`order: -10`） |

每个组件外包一层 `Boundary`（React 错误边界）：组件抛错时只兜底渲染一句提示，不拖垮侧栏其他条目。卸载时逐个调用槽位 dispose 函数，并移除注入的 `<style>` 节点。

## 3. 组件清单（`lib/client.js`）

- 注册组件：`PeakNavIcon`、`PeakPanel`、`PeakChip`。
- 边界：`Boundary`。
- 面板子组件：`Strip`（今日 24h 分段条）、`LegendItem`（图例）、`DayRow`（单日预览行）、`PriceTable`（计费规则表）、`WeekSummary`（本周小结）、`CostCalculator`（花费换算 + 预算反算）、`AgentHint`（可复制提示话术）。

## 4. 时段算法（`//<tier-core>` 块）

算法块在文件内用 `//<tier-core>` … `//</tier-core>` 标记包裹，**不引用 React 或任何浏览器 API**，自测直接抽取这一段源码用 `new Function` 执行。

核心函数：

- `partsOf(ms)`：按 UTC+8 拆出星期几、`YYYY-MM-DD` 键、当日分钟数。
- `holidayOf(key)` / `isMakeupWorkday(key)` / `isCovered(key)`：节假日、调休工作日、覆盖年份判定。
- `tierFor(key, weekday, minuteOfDay)`：判定顺序为 未覆盖年份 → 法定节假日 → 周末 → 调休日（按工作日口径）→ 峰/中/低窗口。
- `tierAt(ms)`：当前时刻档位。
- `segmentsOfDay(key)`：生成当日连续分段（首尾相接，合计 1440 分钟）；`statsOfSegments` 汇总各档分钟数。
- `nextChange(ms)`：距下一次换档的目标档与时刻；`nextOffPeakWindow(ms)`：下一段连续闲时的开始时刻与时长。
- `costOf(tokens, prices)`：按 缓存命中 / 未命中 / 输出 三档单价计费；`budgetTokensOf(budgetCny, tokens, prices)`：给定预算人民币反算可兑换 token。
- `priceAgeDays` / `priceStale`：价格核对日期是否超龄。
- `billingOf(tier)`：把展示档映射回官方计费档 `peak` / `off` / `unknown`；中峰与低峰同属 `off`（闲时价）。

档位口径（北京时间，UTC+8）：

- **高峰 peak**：周一至周五 09:00–12:00、14:00–18:00，不含法定节假日。
- **中峰 mid**：周一至周五 12:00–14:00、18:00–22:00。官方只分「高峰 / 闲时」两档，中峰是本插件补充的提示档，计费与闲时相同。
- **低峰 low**：22:00–次日 09:00；周末、法定节假日全天。
- **unknown**：规则未覆盖的年份，不猜测档位。

## 5. 规则数据流

`rules.json` 是唯一事实源。浏览器 bundle 运行时不能读取本地 JSON 文件，因此：

1. 编辑 `rules.json`。
2. 运行 `node scripts/sync-rules.mjs`：先校验字段形状（窗口数组、双模型单价、覆盖年份、`priceMaxAgeDays > 0`），再把 JSON 字面量写入 `client.js` 的 `//<rules-data>` … `//</rules-data>` 标记块，得到包内常量 `RULES`。
3. 自测与打包都读取注入后的 `RULES`。

字段含义见 [README.md · 规则配置](./README.md#规则配置-rulesjson)。

## 6. 状态与刷新

- `useNow(interval)`：`useState` 持有当前时间，`setInterval` 轮询；监听 `visibilitychange`，页面隐藏时停表、可见时恢复，避免后台空转。
- `nextChangeCached`：换档倒计时按分钟缓存，不每秒重算。
- 样式：单例 `<style id="dsh-token-peak-styles">` 注入 `document.head`，卸载时移除；未做内联 DOM 探针。

## 7. 测试

`node scripts/selftest.mjs` 从 `tier-core` 块抽取纯函数并断言：

- 工作日各窗口档位；周末为低峰；法定节假日全天闲时；调休日按工作日口径。
- 未覆盖年份返回 `unknown`，整日分段仍合计 1440 分钟（含闰日）。
- 换档边界时刻；闲时连续窗口时长。
- 单价：闲时恰为高峰半价；零 token 费用为 0；预算反算 = 预算 / 单位价格。
- 价格时效：未超龄 `false`、超龄 `true`。

## 8. 刻意不做的事（边界）

- **不接跨插件实时用量账本**：宿主内其他用量插件走自有 RPC / 投影契约，没有公开稳定入口；花费换算保持手填比例估算，金额以官方账单为准。
- **不做宿主级 prompt 注入**：当前插件体系没有公开的上下文槽位，`AgentHint` 只生成一段可复制的提示话术。
- **节假日表是静态数据**：需随国务院年度安排更新；覆盖年份之外一律 `unknown`，不套用旧年份规则猜测。
