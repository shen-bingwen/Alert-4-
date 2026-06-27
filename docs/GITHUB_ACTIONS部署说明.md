# GitHub Actions 版部署说明

这份说明是给你现在这条低成本路线准备的：

- 不依赖你电脑开机
- 先把提醒跑起来
- 通过 GitHub Actions 定时执行
- 命中后发企业微信机器人

这套文件主要是：

- [workflow](C:/Users/24951/Documents/Codex_66test/定投/.github/workflows/dca-alert.yml)
- [监控脚本](C:/Users/24951/Documents/Codex_66test/定投/scripts/github_actions_check.js)
- [GitHub 专用配置](C:/Users/24951/Documents/Codex_66test/定投/config/watchlist.github.json)
- [GitHub 状态文件](C:/Users/24951/Documents/Codex_66test/定投/data/github_action_state.json)

## 一、这版和本地版的区别

本地版：

- 你电脑开着，脚本才会跑
- 手机只是收通知或看本地页面

GitHub Actions 版：

- GitHub 每 5 分钟帮你跑一次
- 你电脑关机也没事
- 重点是提醒，不是页面管理

## 二、你要准备什么

1. 一个 GitHub 账号
2. 一个 GitHub 仓库
3. 一个企业微信机器人 webhook

## 三、建议怎么放仓库

最简单的做法是：

1. 新建一个私有仓库，比如 `dca-alert`
2. 把整个 [定投](C:/Users/24951/Documents/Codex_66test/定投) 目录内容放进去

如果你不想把本地版的文件都带上，也可以只放这几个路径：

```text
.github/workflows/dca-alert.yml
config/watchlist.github.json
data/github_action_state.json
scripts/github_actions_check.js
```

## 四、必须配置的 GitHub Secret

打开你的仓库：

`Settings -> Secrets and variables -> Actions -> New repository secret`

新增：

- 名称：`WECOM_WEBHOOK`
- 值：你的企业微信机器人 webhook

这个 secret 是必须的。  
没有它，脚本会跑，但只会记状态，不会真的推送。

## 五、要改哪个配置文件

改这个：

- [watchlist.github.json](C:/Users/24951/Documents/Codex_66test/定投/config/watchlist.github.json)

最常用的是这几部分：

```json
{
  "rules": {
    "triggerDropPct": 4,
    "oncePerDay": true
  },
  "watchlist": [
    {
      "symbol": "510300",
      "name": "沪深300ETF",
      "enabled": true
    }
  ]
}
```

说明：

- `triggerDropPct`
  - 全局跌幅提醒线，当前默认 4
- `oncePerDay`
  - 同一标的同一天只提醒一次
- `watchlist`
  - 监控标的列表

你后面要加标的，就改这里。

## 六、Workflow 是怎么跑的

当前 workflow 配置是：

- 支持手动运行
- 工作日每 5 分钟执行一次

文件：

- [dca-alert.yml](C:/Users/24951/Documents/Codex_66test/定投/.github/workflows/dca-alert.yml)

这里用的是 GitHub Actions 的 `schedule + workflow_dispatch`：

- `schedule`
  - 自动跑
- `workflow_dispatch`
  - 你可以在 GitHub 页面里手动点 `Run workflow`

## 七、为什么要有状态文件

GitHub Actions 不是常驻进程，每次跑都是新环境。

所以如果要保住：

- 今天已经提醒过
- 最近一次提醒记录
- 最近行情快照

就必须把状态写回仓库文件。

这里用的是：

- [github_action_state.json](C:/Users/24951/Documents/Codex_66test/定投/data/github_action_state.json)

Workflow 每次跑完后会：

1. 更新这个状态文件
2. 自动提交回仓库

这样下一次运行时，脚本就知道今天有没有提醒过。

## 八、脚本做了什么

脚本：

- [github_actions_check.js](C:/Users/24951/Documents/Codex_66test/定投/scripts/github_actions_check.js)

流程是：

1. 读 `watchlist.github.json`
2. 判断是不是交易时段
3. 拉行情
4. 算跌幅
5. 如果 `跌幅 >= 4%`
6. 判断今天是否已经提醒过
7. 发企业微信机器人
8. 更新状态文件

行情源逻辑：

- 优先新浪
- 失败时回退腾讯

## 九、第一次怎么验证

建议你第一次这样做：

1. 把仓库推上去
2. 配好 `WECOM_WEBHOOK`
3. 改好 `watchlist.github.json`
4. 打开 GitHub 仓库的 `Actions`
5. 找到 `DCA Alert`
6. 点 `Run workflow`

看这几项：

- workflow 是否成功
- 日志里是否有 `summary`
- 企业微信是否收到消息

如果当天没有达到阈值，也可能不会推送。  
这种情况下你主要看 workflow 有没有正常跑完。

## 十、你现在要知道的限制

1. 这版不是网页后台
   - 不能像网站那样手机直接点点点改配置
   - 改阈值和代码要改仓库文件

2. GitHub Actions 不是交易系统
   - 定时任务可能不是秒级准时
   - 更适合提醒，不适合高频监控

3. 最短就是 5 分钟级
   - 这对你的定投提醒通常已经够用

4. 状态提交会产生很多小 commit
   - 这是这条路线的正常代价

## 十一、怎么理解“免费”

这条路的核心成本优势在于：

- 不用买服务器就能先跑起来
- 不用你电脑一直开机
- 企业微信机器人本身通常不单独收费

但也要知道：

- GitHub Actions 免费额度并不是无限的
- 如果你以后扩展得很重，还是可能转向正式云服务器

## 十二、最适合你的使用阶段

这条路最适合：

- 你现在先想低成本验证提醒
- 你还不想马上买服务器
- 你可以接受“改配置靠改仓库文件”

如果后面你想升级成：

- 手机外网直接打开页面
- 随时在线改阈值
- 更像一个正式小后台

那下一步就是从这版再升级到云服务器公网版。
