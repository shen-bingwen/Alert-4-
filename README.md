# 定投提醒工具

现在这个仓库保留的是 GitHub Actions + 企业微信机器人 方案。

核心文件：

- [workflow](C:/Users/24951/Documents/Codex_66test/Dollar-Cost Averaging/.github/workflows/dca-alert.yml)
- [监控脚本](C:/Users/24951/Documents/Codex_66test/Dollar-Cost Averaging/scripts/github_actions_check.js)
- [添加标的脚本](C:/Users/24951/Documents/Codex_66test/Dollar-Cost Averaging/scripts/add_watch_symbol.js)
- [配置文件](C:/Users/24951/Documents/Codex_66test/Dollar-Cost Averaging/config/watchlist.github.json)
- [说明文档](C:/Users/24951/Documents/Codex_66test/Dollar-Cost Averaging/docs/GITHUB_ACTIONS部署说明.md)
- [添加代码教程](C:/Users/24951/Documents/Codex_66test/Dollar-Cost Averaging/docs/如何添加股票基金代码.md)
- [修改推送教程](C:/Users/24951/Documents/Codex_66test/Dollar-Cost Averaging/docs/如何修改推送内容.md)

提醒方式：

- 盘中检查，不等收盘
- GitHub Actions 只在 A 股交易时段触发
- 北京时间周一到周五：
  - 09:30 - 11:30 每 5 分钟一次
  - 13:00 - 15:00 每 5 分钟一次
- 第一次相对昨收跌 4% 触发
- 之后每次相对上一次触发价再跌 4% 再触发
