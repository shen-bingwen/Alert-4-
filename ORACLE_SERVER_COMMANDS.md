# Oracle 服务器里逐条复制执行的命令清单

这份给你在 Oracle 免费实例里直接复制执行。

适用前提：

- 你已经创建好 Oracle 免费实例
- 已开放 `22` 和 `80`
- 你能 SSH 登录服务器
- 你已经把本地 `定投` 目录上传到服务器，或者准备从 Git 拉代码

## 0. 先登录

如果你装的是 Ubuntu：

```bash
ssh -i 你的私钥 ubuntu@你的公网IP
```

如果你装的是 Oracle Linux：

```bash
ssh -i 你的私钥 opc@你的公网IP
```

## 1. 先确认系统

复制执行：

```bash
cat /etc/os-release
```

如果看到 `Ubuntu`，后面用户名和包管理就是 Ubuntu 路线。  
如果看到 `Oracle Linux`，就是 Oracle Linux 路线。

## 2. 创建项目目录

```bash
mkdir -p ~/dingtou
mkdir -p ~/dingtou/cloud-data
```

## 3. 把项目上传到服务器

你有两种办法。

### 办法 A：本地直接上传整个目录

在你自己电脑上执行：

```bash
scp -i 你的私钥 -r "C:/Users/24951/Documents/Codex_66test/定投" ubuntu@你的公网IP:~/dingtou
```

如果是 Oracle Linux 用户：

```bash
scp -i 你的私钥 -r "C:/Users/24951/Documents/Codex_66test/定投" opc@你的公网IP:~/dingtou
```

上传后，服务器里实际项目目录一般会变成：

```bash
~/dingtou/定投
```

### 办法 B：用 Git 拉代码

如果你已经把项目放到了 Git 仓库里，在服务器执行：

```bash
cd ~
git clone 你的仓库地址 dingtou
```

## 4. 进入项目目录

如果你是用上传目录的办法，大概率执行：

```bash
cd ~/dingtou/定投
```

如果你是 Git clone 直接拉的项目根目录，就按你的实际目录进。

## 5. 安装 Node.js 20

复制执行：

```bash
bash deploy/linux/install-node20-oracle.sh
```

执行完检查：

```bash
node -v
npm -v
```

## 6. 安装 PM2

```bash
bash deploy/linux/install-pm2.sh
```

检查：

```bash
pm2 -v
```

## 7. 安装 Nginx

```bash
bash deploy/linux/install-nginx.sh
```

## 8. 配本机防火墙

```bash
bash deploy/linux/setup-oracle-firewall.sh
```

注意：

- 就算你开了本机防火墙，也还需要 Oracle 控制台的安全规则已放行
- 两边都通，外网才能访问

## 9. 安装依赖并生成 `.env`

```bash
bash deploy/linux/deploy-app.sh "$(pwd)"
```

这一步会：

- 执行 `npm install`
- 创建 `cloud-data`
- 如果没有 `.env`，自动从 `.env.example` 复制一份
- 用 `pm2` 启动服务

## 10. 修改 `.env`

打开配置：

```bash
nano .env
```

推荐改成这样：

```text
PORT=8788
DCA_HOST=127.0.0.1
DCA_DATA_DIR=./cloud-data
DCA_PUBLIC_HEALTH=true
DCA_BASIC_AUTH_USER=admin
DCA_BASIC_AUTH_PASSWORD=换成你自己的强密码
```

如果你更想用 token 链接，就写：

```text
PORT=8788
DCA_HOST=127.0.0.1
DCA_DATA_DIR=./cloud-data
DCA_PUBLIC_HEALTH=true
DCA_ACCESS_TOKEN=换成一个很长的随机串
```

保存后退出：

- `Ctrl + O`
- 回车
- `Ctrl + X`

## 11. 重启服务

```bash
pm2 restart dingtou-monitor
pm2 save
```

查看日志：

```bash
pm2 logs dingtou-monitor --lines 50
```

## 12. 配置 Nginx 反向代理

复制模板到系统目录：

```bash
sudo cp deploy/linux/dingtou-monitor.conf /etc/nginx/conf.d/dingtou-monitor.conf
```

检查配置：

```bash
sudo nginx -t
```

重载：

```bash
sudo systemctl reload nginx
```

## 13. 验证服务

先在服务器本机测：

```bash
curl http://127.0.0.1:8788/api/health
```

再测 Nginx：

```bash
curl http://127.0.0.1/
```

如果你开了账号密码保护，本地 `curl /` 可能会返回未授权，这是正常的。

## 14. 手机访问

### 账号密码方式

浏览器打开：

```text
http://你的公网IP/
```

输入你在 `.env` 里设置的用户名密码。

### token 方式

浏览器打开：

```text
http://你的公网IP/?token=你的token
```

## 15. 常用运维命令

查看状态：

```bash
pm2 status
```

查看日志：

```bash
pm2 logs dingtou-monitor
```

重启：

```bash
pm2 restart dingtou-monitor
```

停止：

```bash
pm2 stop dingtou-monitor
```

重载 Nginx：

```bash
sudo systemctl reload nginx
```

查看 Nginx 状态：

```bash
sudo systemctl status nginx --no-pager
```

## 16. 数据保存位置

你的配置和状态会保存在：

```text
./cloud-data/config/watchlist.json
./cloud-data/data/runtime_state.json
```

也就是项目目录里的：

```text
~/dingtou/定投/cloud-data/
```

## 17. 如果外网打不开

按这个顺序排查：

1. Oracle 控制台 `Ingress Rules` 是否开了 `80`
2. 本机防火墙是否允许 `80`
3. `pm2 status` 里服务是不是 `online`
4. `curl http://127.0.0.1:8788/api/health` 是否通
5. `sudo nginx -t` 是否通过
6. `sudo systemctl status nginx --no-pager` 是否正常

## 18. 你最短可以怎么跑通

如果你只想先验证，不想一次装太多：

```bash
cd ~/dingtou/定投
bash deploy/linux/install-node20-oracle.sh
npm install
cp .env.example .env
npm start
```

然后在 Oracle 后台再开 `8788` 端口，手机访问：

```text
http://你的公网IP:8788/
```

等确认能用，再补：

- PM2
- Nginx
- 密码保护

## 19. 建议你先走哪条

最稳的是：

1. 先按第 18 步最小化跑通
2. 跑通后再按第 6 到第 14 步补成正式版

这样最不容易被一堆配置同时绊住。
