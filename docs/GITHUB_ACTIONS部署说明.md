# GitHub Actions 部署说明

这条路线的目标是：

- 不依赖你电脑开机
- 通过 GitHub Actions 定时运行
- 企业微信机器人负责提醒
- 支持“首次相对昨收跌 4% 提醒，之后每次在上一次触发价基础上再跌 4% 继续提醒”

## 核心文件

- [workflow](C:/Users/24951/Documents/Codex_66test/定投/.github/workflows/dca-alert.yml)
- [监控脚本](C:/Users/24951/Documents/Codex_66test/定投/scripts/github_actions_check.js)
- [添加标的脚本](C:/Users/24951/Documents/Codex_66test/定投/scripts/add_watch_symbol.js)
- [GitHub 配置](C:/Users/24951/Documents/Codex_66test/定投/config/watchlist.github.json)
- [GitHub 状态文件](C:/Users/24951/Documents/Codex_66test/定投/data/github_action_state.json)

## 现在的提醒规则

现在不是“当天只要跌到 4% 就提醒一次然后结束”，而是：

1. 第一次触发
   - 相对昨收价
   - 当天跌幅 `>= 4%`
   - 触发一次提醒
2. 后续继续触发
   - 以上一次触发时的价格作为新锚点
   - 再下跌 `4%`
   - 再提醒一次

公式是：

```text
下一次触发价 = 上一次触发价 × 0.96
累计相对起点跌幅 = 1 - 0.96^n
```

## 10.00 起点的提醒过程示例

如果起点是 `10.00`，那提醒会这样走：

```text
10.0000  起点
 9.6000  第1次触发
 9.2160  第2次触发
 8.8474  第3次触发
 8.4935  第4次触发
 8.1538  第5次触发
 7.8277  第6次触发
 7.5146  第7次触发
 7.2140  第8次触发
 6.9255  第9次触发
 6.6485  第10次触发
```

举个完整过程：

1. 昨收是 `10.00`
2. 跌到 `9.60`，第一次提醒
3. 系统把下一次提醒价记成 `9.60 × 0.96 = 9.216`
4. 如果后面跌到 `9.30`，不会提醒
5. 只有跌到 `9.216` 或更低，才会第二次提醒
6. 第二次提醒后，新的下一次提醒价变成 `9.216 × 0.96 = 8.84736`
7. 后面继续按这个规则往下推

所以它不是一直拿 `10.00` 去减 4%，而是每次都拿“上一次提醒价”继续减 4%。

## 企业微信现在会推送什么

现在推送里会带：

- 标的代码
- 名称
- 备注
- 第几次触发
- 当前价
- 昨收价
- 当前涨跌幅
- 当前单日跌幅
- 触发方式
- 起点价
- 本次基准价
- 相对起点累计跌幅
- 下一次触发价
- 阶梯跌幅
- 时间

这样你收到消息时，就能直接看到：

- 这是第几次提醒
- 从最初起点累计跌了多少
- 下一个提醒点在哪里

## 配置文件怎么理解

主配置文件：

- [watchlist.github.json](C:/Users/24951/Documents/Codex_66test/定投/config/watchlist.github.json)

示例：

```json
{
  "rules": {
    "triggerDropPct": 4,
    "progressiveDropPct": 4,
    "oncePerDay": true
  },
  "watchlist": [
    {
      "symbol": "510300",
      "name": "沪深300ETF",
      "enabled": true,
      "notes": "核心仓"
    }
  ]
}
```

字段说明：

- `triggerDropPct`
  - 第一次相对昨收的触发线
- `progressiveDropPct`
  - 后续每次相对上一次提醒价继续下跌的比例
- `symbol`
  - 6 位代码
- `name`
  - 推送里显示的名称
- `enabled`
  - 是否监控
- `notes`
  - 备注，当前会一起推送

## `notes` 会不会推送

会。

如果你写了：

```json
"notes": "核心仓"
```

推送里会带：

```text
- 备注: 核心仓
```

## 怎么更简单地加标的

脚本：

- [add_watch_symbol.js](C:/Users/24951/Documents/Codex_66test/定投/scripts/add_watch_symbol.js)

最简单的用法，只输代码：

```bash
node scripts/add_watch_symbol.js 512480
```

如果你想自己指定名称：

```bash
node scripts/add_watch_symbol.js 512480 "半导体ETF"
```

如果你还想顺手写阈值和备注：

```bash
node scripts/add_watch_symbol.js 512480 "半导体ETF" 4 "核心仓"
```

如果你不写名称，只想写阈值和备注，也可以：

```bash
node scripts/add_watch_symbol.js 512480 4 "核心仓"
```

如果你更习惯 npm，也可以：

```bash
npm.cmd run watch:add -- 512480
```

## Workflow 做了什么调整

我已经把 workflow 里的 Action 版本和 Node 版本更新了，减少旧 runtime 警告。

## 怎么部署

1. 把这些文件 push 到 GitHub 仓库
2. 配置 `WECOM_WEBHOOK` secret
3. 修改 [watchlist.github.json](C:/Users/24951/Documents/Codex_66test/定投/config/watchlist.github.json)
4. 手动运行一次 `DCA Alert`

## 怎么测试

如果你现在只是想先测试推送链路：

1. 临时把 `onlyTradingHours` 改成 `false`
2. 临时把 `triggerDropPct` 改小一点
3. 手动运行 workflow

测试结束后再改回正式值：

```json
"onlyTradingHours": true
"triggerDropPct": 4
"progressiveDropPct": 4
```
