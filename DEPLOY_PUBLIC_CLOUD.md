# 定投工具免费云端部署说明

这份说明现在按你的最新目标来写：

- 尽量不花钱
- 电脑不用开
- 手机能随时打开页面改配置

我给你的主路线是：

- `Oracle Cloud Free Tier`

因为你这个项目不是纯静态站点，它需要：

- 常驻 Node 服务
- 定时检查
- 保存配置
- 保存运行状态

这类项目想 0 成本长期跑，免费云服务器比免费静态托管更靠谱。

## 先说结论

可以尽量做到不花钱，但要接受三个现实：

1. 免费资源不保证永远稳定
2. 注册和开通比付费平台麻烦
3. 免费额度和回收策略未来可能变化

Oracle 官方当前提供 `Always Free` 资源和 `30-day free trial with US$300 credits`。  
来源： [Oracle Cloud Free Tier](https://www.oracle.com/cloud/free/)

所以这条路是：

- 有机会长期 0 成本
- 但不是“闭眼稳如本地插电”

## 这套项目已经补好的云端能力

现在项目已经支持：

- 云平台 `PORT`
- 数据目录 `DCA_DATA_DIR`
- 公网访问保护
  - `DCA_BASIC_AUTH_USER`
  - `DCA_BASIC_AUTH_PASSWORD`
  - 或 `DCA_ACCESS_TOKEN`
- 手机通过 `?token=...` 链接访问时自动带 token

## 你最终会得到什么

部署完成后，你会有一个公网地址，例如：

```text
http://你的公网IP/
```

或者带 token：

```text
http://你的公网IP/?token=你的token
```

手机直接打开就能改配置。

## Oracle Cloud Free Tier 推荐规格

对你这个项目，够用就行：

- `1 台 Always Free ARM 或 AMD 实例`
- `Ubuntu / Oracle Linux`
- `1GB~2GB 内存就够`
- 只跑这一个 Node 服务

这套应用非常轻，不需要大机器。

## 目录里新增的部署文件

- [ecosystem.config.js](C:\Users\24951\Documents\Codex_66test\定投\ecosystem.config.js)
- [install-node20-oracle.sh](C:\Users\24951\Documents\Codex_66test\定投\deploy\linux\install-node20-oracle.sh)
- [install-pm2.sh](C:\Users\24951\Documents\Codex_66test\定投\deploy\linux\install-pm2.sh)
- [install-nginx.sh](C:\Users\24951\Documents\Codex_66test\定投\deploy\linux\install-nginx.sh)
- [setup-oracle-firewall.sh](C:\Users\24951\Documents\Codex_66test\定投\deploy\linux\setup-oracle-firewall.sh)
- [dingtou-monitor.conf](C:\Users\24951\Documents\Codex_66test\定投\deploy\linux\dingtou-monitor.conf)
- [deploy-app.sh](C:\Users\24951\Documents\Codex_66test\定投\deploy\linux\deploy-app.sh)

## 一步步怎么做

### 1. 先注册 Oracle Cloud Free Tier

官方入口：

- [Oracle Cloud Free Tier](https://www.oracle.com/cloud/free/)

如果开通成功，你会拿到控制台。

### 2. 创建 1 台免费 Linux 实例

建议：

- 系统选 `Ubuntu` 或 `Oracle Linux`
- 能选 ARM 就优先 ARM
- 公网 IP 要开

### 3. 开放入站端口

你至少要放行：

- `80`
- `443`
- `22`

如果你暂时不配 Nginx，直接裸开 Node，也可以先开：

- `8788`

但正式公网使用，我更建议走 Nginx。

### 4. 登录服务器

本地电脑执行：

```bash
ssh ubuntu@你的公网IP
```

如果是 Oracle Linux，用户名可能是：

```bash
opc
```

### 5. 安装 Node.js

把项目传上去后执行：

```bash
bash deploy/linux/install-node20-oracle.sh
```

### 6. 安装 PM2

```bash
bash deploy/linux/install-pm2.sh
```

### 7. 安装 Nginx

```bash
bash deploy/linux/install-nginx.sh
```

### 8. 配防火墙

```bash
bash deploy/linux/setup-oracle-firewall.sh
```

### 9. 上传项目到服务器

你可以：

- 用 Git 拉仓库
- 或直接上传整个 `定投` 目录

假设你把项目放到：

```text
~/dingtou
```

### 10. 安装依赖并首次启动

进入项目目录后执行：

```bash
bash deploy/linux/deploy-app.sh ~/dingtou
```

### 11. 修改 `.env`

参考这个文件：

- [\.env.example](C:\Users\24951\Documents\Codex_66test\定投\.env.example)

推荐至少这样配：

```text
PORT=8788
DCA_HOST=127.0.0.1
DCA_DATA_DIR=./cloud-data
DCA_PUBLIC_HEALTH=true
DCA_BASIC_AUTH_USER=admin
DCA_BASIC_AUTH_PASSWORD=换成强密码
```

或者用 token：

```text
DCA_ACCESS_TOKEN=换成长随机串
```

## PM2 启动方式

这个项目已经带了：

- [ecosystem.config.js](C:\Users\24951\Documents\Codex_66test\定投\ecosystem.config.js)

常用命令：

```bash
pm2 start ecosystem.config.js
pm2 restart dingtou-monitor
pm2 logs dingtou-monitor
pm2 save
```

## Nginx 配置方式

模板文件：

- [dingtou-monitor.conf](C:\Users\24951\Documents\Codex_66test\定投\deploy\linux\dingtou-monitor.conf)

大概这样装进去：

```bash
sudo cp deploy/linux/dingtou-monitor.conf /etc/nginx/conf.d/dingtou-monitor.conf
sudo nginx -t
sudo systemctl reload nginx
```

这样外部访问 `80` 端口时，就会转发到本机 `127.0.0.1:8788`。

## 数据保存在哪里

你配置了：

```text
DCA_DATA_DIR=./cloud-data
```

所以这两个文件会落在持久目录里：

- `cloud-data/config/watchlist.json`
- `cloud-data/data/runtime_state.json`

这就能保证你在手机上改完配置，服务重启后不会丢。

## 手机怎么访问

### 用账号密码保护

直接打开：

```text
http://你的公网IP/
```

浏览器会弹登录框。

### 用 token 链接

直接打开：

```text
http://你的公网IP/?token=你的token
```

## 免费路线的坑

这几个坑我提前告诉你：

1. Oracle 免费实例不一定每次都容易创建
2. 某些区域资源可能紧张
3. 长期空闲资源可能有被回收风险
4. 免费政策以后可能变

所以它适合：

- 你非常在意 0 成本
- 愿意多折腾一点

不适合：

- 你要百分百省心
- 你接受不了偶尔维护

## 如果你只想先跑起来

最短路径就是：

1. 先开 Oracle 免费实例
2. 先装 Node
3. 先 `npm start`
4. 先把 `8788` 暴露出来
5. 确认手机能打开

跑通后，再加：

- PM2
- Nginx
- 账号密码保护

## 这次我已经替你做好的东西

- 把项目整理成了 Linux 服务器可部署形态
- 补了 PM2 配置
- 补了 Nginx 反代模板
- 补了 Oracle 免费层安装脚本
- 保留了手机访问和配置保存能力

## 我建议你下一步

如果你要继续，最合适的是：

1. 我直接给你出一份 `Oracle Cloud 免费实例创建时每一步该怎么点`
2. 我再给你一份 `上传到服务器后逐条执行的命令清单`

第一份适合你先把机器开出来，第二份适合你机器已经有了直接开干。
